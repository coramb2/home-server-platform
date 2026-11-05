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

// State: who we've already told about each ticket, and comment ids we've
// already handled. Seeded on startup (no push) so existing data doesn't
// trigger a notification flood.
const notified = new Map(); // ticket id -> Set of user ids
const seenComments = new Set();

// Tickets can have several assignees (an array). Older data may be a string.
const assigneesOf = (t) => (Array.isArray(t.assignee) ? t.assignee : t.assignee ? [t.assignee] : []);
// A repeating ticket waits off the board until its reminder window (show_from).
// Until then nobody hears about it; when it appears, its assignees do.
const isVisible = (t) => !t.show_from || new Date(t.show_from.replace(' ', 'T')).getTime() <= Date.now();
const fmtDay = (d) =>
	new Date(d.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

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

const TICKET_FIELDS = 'id,title,assignee,show_from,due_date';

async function seed() {
	const tickets = await pb.collection('tickets').getFullList({ fields: TICKET_FIELDS });
	// Hidden tickets stay unseeded, so they notify when they appear.
	for (const t of tickets) if (isVisible(t)) notified.set(t.id, new Set(assigneesOf(t)));
	const comments = await pb.collection('comments').getFullList({ fields: 'id' });
	for (const c of comments) seenComments.add(c.id);
	console.log(
		`[push] seeded ${tickets.length} tickets / ${seenComments.size} comments; watching for assignments + comments (poll ${POLL_SECONDS}s)`
	);
}

async function poll() {
	// Assignments: tell each person newly assigned to a visible ticket.
	// (Several assignees are fine; each is told once.)
	const tickets = await pb.collection('tickets').getFullList({ fields: TICKET_FIELDS });
	for (const t of tickets) {
		if (!isVisible(t)) continue;
		const known = notified.get(t.id);
		const now = assigneesOf(t);
		notified.set(t.id, new Set(now));
		const fresh = known ? now.filter((u) => !known.has(u)) : now;
		// First time we see a repeating ticket = it just appeared on the board.
		const appeared = !known && t.show_from && t.due_date;
		for (const u of fresh)
			await pushToUser(u, {
				title: appeared ? `Coming up · due ${fmtDay(t.due_date)}` : 'Ticket assigned to you',
				body: t.title,
				tag: `ticket-${t.id}`,
				url: `/tickets/${t.id}`
			});
	}

	// New comments: notify every assignee except the comment's author.
	const comments = await pb.collection('comments').getFullList({ sort: 'created' });
	for (const c of comments) {
		if (seenComments.has(c.id)) continue;
		seenComments.add(c.id);
		try {
			const ticket = await pb.collection('tickets').getOne(c.ticket);
			const to = assigneesOf(ticket).filter((u) => u !== c.author);
			if (!to.length) continue;
			const author = await pb.collection('users').getOne(c.author).catch(() => null);
			for (const u of to)
				await pushToUser(u, {
					title: `New comment from ${nameOf(author)}`,
					body: ticket.title,
					tag: `ticket-${ticket.id}`,
					url: `/tickets/${ticket.id}`
				});
		} catch {
			/* ticket/author lookup failed — skip */
		}
	}
}

/** Log in as the notifier's own superuser account. */
async function login() {
	await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
	console.log(`[push] authenticated to ${PB_URL}`);
}

async function main() {
	await login();
	await seed();
	const run = async () => {
		try {
			// Logins expire. If ours has, log in again before polling.
			if (!pb.authStore.isValid) await login();
			await poll();
		} catch (e) {
			console.warn('[push] poll error:', e?.message ?? e);
		}
	};
	setInterval(run, Number(POLL_SECONDS) * 1000);
}

process.on('unhandledRejection', (e) =>
	console.warn('[push] unhandledRejection:', (e && e.message) || e)
);
main().catch((e) => {
	console.error('[push] fatal:', e?.message ?? e);
	process.exit(1);
});
