/// <reference path="../pb_data/types.d.ts" />

// Tickets v2 — one kind of ticket, shared by the household.
//
// 1. users: signed-in people can see each other (names, not emails).
// 2. tickets.assignee: one person -> any number of people.
// 3. tickets: optional "repeat" fields. Recurring is now a setting on a
//    ticket, not a separate list. Finishing a repeating ticket files the
//    next one (pb_hooks/repeat.pb.js).
// 4. Existing recurring_tasks templates become repeating tickets. The old
//    collection is locked (superuser-only), not deleted, so nothing is lost.
//    Delete it in a later cleanup once v2 is verified.

const SIGNED_IN_USER = "@request.auth.collectionName = 'users'";
const NOON_UTC = ' 12:00:00.000Z'; // date-only values: same calendar day in every US time zone

const REPEAT_FIELDS = [
	// 0 / empty = doesn't repeat
	{ name: 'repeat_days', type: 'number', min: 0, max: 3650, onlyInt: true },
	// fixed: every Tuesday no matter what. after_completion: 90 days after you last did it.
	{ name: 'repeat_mode', type: 'select', maxSelect: 1, values: ['fixed', 'after_completion'] },
	// show the next one on the board this many days before it's due
	{ name: 'remind_days', type: 'number', min: 0, max: 365, onlyInt: true },
	// hidden from the board until this moment (empty = always visible)
	{ name: 'show_from', type: 'date' },
	// id shared by every occurrence of the same repeating task
	{ name: 'series', type: 'text', max: 30 }
];

migrate(
	(app) => {
		// ── 1. users can see each other ─────────────────────────────
		// Emails stay private: PocketBase hides `email` from everyone but the
		// owner unless that user turns on emailVisibility.
		const users = app.findCollectionByNameOrId('users');
		users.listRule = SIGNED_IN_USER;
		users.viewRule = SIGNED_IN_USER;
		app.save(users);

		// ── 2 + 3. tickets ──────────────────────────────────────────
		const tickets = app.findCollectionByNameOrId('tickets');
		// maxSelect 99 = "many". PocketBase converts each stored "id" to ["id"].
		tickets.fields.getByName('assignee').maxSelect = 99;
		for (const f of REPEAT_FIELDS) tickets.fields.add(new Field(f));
		tickets.indexes = tickets.indexes.concat([
			'CREATE INDEX idx_tickets_show_from ON tickets (show_from)',
			'CREATE INDEX idx_tickets_series ON tickets (series)'
		]);
		app.save(tickets);

		// ── 4. templates -> repeating tickets ───────────────────────
		const templates = app.findAllRecords('recurring_tasks');
		for (const r of templates) {
			const key = 'migrated:' + r.id; // unique ext_key: running twice can't duplicate
			try {
				app.findFirstRecordByData('tickets', 'ext_key', key);
				continue; // already converted
			} catch (_) {
				/* not found -> convert */
			}
			const due = r.getString('next_due').slice(0, 10) + NOON_UTC;
			const t = new Record(tickets);
			t.set('title', r.getString('title'));
			t.set('description', r.getString('description'));
			t.set('category', r.getString('category'));
			t.set('priority', r.getString('priority'));
			t.set('assignee', r.getString('assignee') ? [r.getString('assignee')] : []);
			// Paused templates go to Backlog (off the board) so you can decide later.
			t.set('status', r.getBool('active') ? 'Open' : 'Backlog');
			t.set('due_date', due);
			t.set('show_from', due); // old templates had no reminder: appear on the due date
			t.set('repeat_days', r.getInt('interval_days'));
			t.set('repeat_mode', 'fixed');
			t.set('remind_days', 0);
			t.set('ext_key', key);
			app.save(t);
			t.set('series', t.id); // first of its series
			app.save(t);
		}

		// Lock the old collection: superusers only (null rule = no API access).
		const rt = app.findCollectionByNameOrId('recurring_tasks');
		rt.listRule = null;
		rt.viewRule = null;
		rt.createRule = null;
		rt.updateRule = null;
		rt.deleteRule = null;
		app.save(rt);
	},

	// ── undo ─────────────────────────────────────────────────────────
	(app) => {
		const authed = "@request.auth.id != ''";
		const rt = app.findCollectionByNameOrId('recurring_tasks');
		rt.listRule = rt.viewRule = rt.createRule = rt.updateRule = rt.deleteRule = authed;
		app.save(rt);

		app
			.db()
			.newQuery("DELETE FROM tickets WHERE ext_key LIKE 'migrated:%'")
			.execute();

		const tickets = app.findCollectionByNameOrId('tickets');
		for (const f of REPEAT_FIELDS) {
			const field = tickets.fields.getByName(f.name);
			if (field) tickets.fields.removeById(field.id);
		}
		tickets.indexes = tickets.indexes.filter(
			(i) => !i.includes('idx_tickets_show_from') && !i.includes('idx_tickets_series')
		);
		// Back to one person: PocketBase keeps the first id of each list.
		tickets.fields.getByName('assignee').maxSelect = 1;
		app.save(tickets);

		const users = app.findCollectionByNameOrId('users');
		users.listRule = 'id = @request.auth.id';
		users.viewRule = 'id = @request.auth.id';
		app.save(users);
	}
);
