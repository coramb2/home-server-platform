import 'dotenv/config';
import PocketBase from 'pocketbase';
import webpush from 'web-push';

const {
	PB_URL = 'http://127.0.0.1:8090',
	PB_ADMIN_EMAIL,
	PB_ADMIN_PASSWORD,
	VAPID_PUBLIC_KEY,
	VAPID_PRIVATE_KEY,
	VAPID_SUBJECT = 'mailto:admin@example.com',
	POLL_SECONDS = '5'
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
	console.error('Missing VAPID keys. Generate with: npx web-push generate-vapid-keys');
	process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const nameOf = (u) => u?.name || u?.email?.split('@')[0] || 'someone';

// State: last-known assignee per ticket, and comment ids we've already handled.
// Seeded on startup (no push) so existing data doesn't trigger a notification flood.
const assigneeOf = new Map();
const seenComments = new Set();

/** Deliver a push to every subscription of `userId`; prune dead ones (404/410). */
async function pushToUser(userId, payload) {
	if (!userId) return;
	const subs = await pb
		.collection('push_subscriptions')
		.getFullList({ filter: pb.filter('user = {:u}', { u: userId }) });
	const body = JSON.stringify(payload);
	for (const s of subs) {
		try {
			await webpush.sendNotification(
				{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
				body
			);
		} catch (err) {
			if (err?.statusCode === 404 || err?.statusCode === 410) {
				await pb.collection('push_subscriptions').delete(s.id).catch(() => {});
			} else {
				console.warn('[push] send failed:', err?.statusCode ?? err?.message);
			}
		}
	}
}

async function seed() {
	const tickets = await pb.collection('tickets').getFullList({ fields: 'id,assignee' });
	for (const t of tickets) assigneeOf.set(t.id, t.assignee || '');
	const comments = await pb.collection('comments').getFullList({ fields: 'id' });
	for (const c of comments) seenComments.add(c.id);
	console.log(
		`[push] seeded ${tickets.length} tickets / ${seenComments.size} comments; watching for assignments + comments (poll ${POLL_SECONDS}s)`
	);
}

async function poll() {
	// New assignments: notify the (new) assignee when a ticket's assignee changes.
	const tickets = await pb.collection('tickets').getFullList({ fields: 'id,title,assignee' });
	for (const t of tickets) {
		const prev = assigneeOf.get(t.id);
		const now = t.assignee || '';
		assigneeOf.set(t.id, now);
		if (prev === now) continue;
		if (now)
			await pushToUser(now, {
				title: 'Ticket assigned to you',
				body: t.title,
				tag: `ticket-${t.id}`,
				url: '/'
			});
	}

	// New comments: notify the ticket assignee (except the comment's author).
	const comments = await pb.collection('comments').getFullList({ sort: 'created' });
	for (const c of comments) {
		if (seenComments.has(c.id)) continue;
		seenComments.add(c.id);
		try {
			const ticket = await pb.collection('tickets').getOne(c.ticket);
			if (!ticket.assignee || ticket.assignee === c.author) continue;
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
	}
}

async function main() {
	await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
	console.log(`[push] authenticated to ${PB_URL}`);
	await seed();
	const run = () => poll().catch((e) => console.warn('[push] poll error:', e?.message ?? e));
	setInterval(run, Number(POLL_SECONDS) * 1000);
}

process.on('unhandledRejection', (e) =>
	console.warn('[push] unhandledRejection:', (e && e.message) || e)
);
main().catch((e) => {
	console.error('[push] fatal:', e?.message ?? e);
	process.exit(1);
});
