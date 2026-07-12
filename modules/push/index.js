import 'dotenv/config';
import PocketBase from 'pocketbase';
import webpush from 'web-push';

const {
	PB_URL = 'http://127.0.0.1:8090',
	PB_ADMIN_EMAIL,
	PB_ADMIN_PASSWORD,
	VAPID_PUBLIC_KEY,
	VAPID_PRIVATE_KEY,
	VAPID_SUBJECT = 'mailto:admin@example.com'
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
	console.error('Missing VAPID keys. Generate with: npx web-push generate-vapid-keys');
	process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const nameOf = (u) => u?.name || u?.email?.split('@')[0] || 'someone';

/** Deliver a push to every subscription of `userId`; prune dead ones. */
async function pushToUser(userId, payload) {
	if (!userId) return;
	const subs = await pb.collection('push_subscriptions').getFullList({
		filter: pb.filter('user = {:u}', { u: userId })
	});
	const body = JSON.stringify(payload);
	for (const s of subs) {
		try {
			await webpush.sendNotification(
				{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
				body
			);
		} catch (err) {
			// 404/410 = subscription is gone; remove it.
			if (err?.statusCode === 404 || err?.statusCode === 410) {
				await pb.collection('push_subscriptions').delete(s.id).catch(() => {});
			} else {
				console.warn('push failed:', err?.statusCode ?? err?.message);
			}
		}
	}
}

async function main() {
	await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
	console.log(`[push] authenticated to ${PB_URL}; watching tickets + comments`);

	// New/updated tickets → notify the (new) assignee, unless they did it themselves.
	await pb.collection('tickets').subscribe('*', async (e) => {
		if (e.action !== 'create' && e.action !== 'update') return;
		const t = e.record;
		if (!t.assignee) return;
		await pushToUser(t.assignee, {
			title: e.action === 'create' ? 'New ticket assigned to you' : 'Ticket updated',
			body: t.title,
			tag: `ticket-${t.id}`,
			url: '/'
		});
	});

	// New comments → notify the ticket assignee (except the comment's author).
	await pb.collection('comments').subscribe('*', async (e) => {
		if (e.action !== 'create') return;
		const c = e.record;
		try {
			const ticket = await pb.collection('tickets').getOne(c.ticket);
			if (!ticket.assignee || ticket.assignee === c.author) return;
			const author = await pb.collection('users').getOne(c.author).catch(() => null);
			await pushToUser(ticket.assignee, {
				title: `New comment from ${nameOf(author)}`,
				body: ticket.title,
				tag: `ticket-${ticket.id}`,
				url: '/'
			});
		} catch {
			/* ticket/author lookup failed — skip */
		}
	});
}

main().catch((e) => {
	console.error('[push] fatal:', e);
	process.exit(1);
});
