/// <reference path="../pb_data/types.d.ts" />

// Household priorities & categories.
// Converts existing tickets + recurring tasks to the new values, then
// replaces each select field's allowed values. Convert first so no row
// is ever left holding a value the new rules don't accept.

const PRIORITY_MAP = { P1: 'ASAP', P2: 'Sooner than later', P3: 'Floating', P4: 'Floating' };
const CATEGORY_MAP = {
	repair: 'chore',
	errand: 'favor',
	planning: 'project',
	project: 'project',
	fun: 'date',
	'it-server': '', // system categories retired -> cleared
	security: ''
};
const PRIORITIES = ['ASAP', 'Sooner than later', 'Floating']; // most urgent first
const CATEGORIES = ['chore', 'favor', 'project', 'reminder', 'date', 'daily', 'idea'];

// For the undo direction. Lossy on purpose: P4 and P3 both became Floating,
// so they both come back as P3; new-only categories come back empty.
const OLD_PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
const OLD_CATEGORIES = ['repair', 'planning', 'project', 'errand', 'it-server', 'fun', 'security'];
const PRIORITY_BACK = { ASAP: 'P1', 'Sooner than later': 'P2', Floating: 'P3' };
const CATEGORY_BACK = { chore: 'repair', favor: 'errand', project: 'project', date: 'fun' };

// Rewrite every row whose `field` equals an old value.
// {:from} / {:to} are *bound parameters*: PocketBase passes the values
// separately from the SQL text, so they can never be read as SQL.
function remap(app, table, field, map) {
	for (const [from, to] of Object.entries(map)) {
		app
			.db()
			.newQuery(`UPDATE ${table} SET ${field} = {:to} WHERE ${field} = {:from}`)
			.bind({ from, to })
			.execute();
	}
}

// Replace the allowed values of the two select fields.
function setValues(app, name, priorities, categories) {
	const col = app.findCollectionByNameOrId(name);
	col.fields.getByName('priority').values = priorities;
	col.fields.getByName('category').values = categories;
	app.save(col);
}

migrate(
	(app) => {
		for (const t of ['tickets', 'recurring_tasks']) {
			remap(app, t, 'priority', PRIORITY_MAP);
			remap(app, t, 'category', CATEGORY_MAP);
			setValues(app, t, PRIORITIES, CATEGORIES);
		}
	},
	(app) => {
		for (const t of ['tickets', 'recurring_tasks']) {
			remap(app, t, 'priority', PRIORITY_BACK);
			remap(app, t, 'category', CATEGORY_BACK);
			app
				.db()
				.newQuery(`UPDATE ${t} SET category = '' WHERE category IN ('reminder','daily','idea')`)
				.execute();
			setValues(app, t, OLD_PRIORITIES, OLD_CATEGORIES);
		}
	}
);
