/// <reference path="../pb_data/types.d.ts" />

// Make ext_key unique, so automation (recurring cron, alerts) can never
// file the same ticket twice — the database refuses the duplicate.
// "WHERE ext_key != ''" makes it a *partial* index: PocketBase stores an
// empty text field as '' (not NULL), so without it every human-filed
// ticket (all with '') would collide with each other.
migrate(
	(app) => {
		const tickets = app.findCollectionByNameOrId('tickets');
		tickets.indexes = tickets.indexes
			.filter((i) => !i.includes('idx_tickets_ext_key'))
			.concat(["CREATE UNIQUE INDEX idx_tickets_ext_key ON tickets (ext_key) WHERE ext_key != ''"]);
		app.save(tickets);
	},
	// "down": how to undo this migration
	(app) => {
		const tickets = app.findCollectionByNameOrId('tickets');
		tickets.indexes = tickets.indexes
			.filter((i) => !i.includes('idx_tickets_ext_key'))
			.concat(['CREATE INDEX idx_tickets_ext_key ON tickets (ext_key)']);
		app.save(tickets);
	}
);
