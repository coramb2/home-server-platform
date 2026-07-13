/// <reference path="../pb_data/types.d.ts" />

// Materialize due recurring_tasks into tickets, then advance next_due.
// Runs daily via cron; also POST /api/recurring-run (superuser) to trigger now.
// The logic lives in recurring_lib.js because cron/router handlers run in
// isolated scope and can't share top-level functions.

cronAdd('recurring', '0 6 * * *', () => {
	const { materialize } = require(`${__hooks}/recurring_lib.js`);
	try {
		const n = materialize();
		if (n) console.log('[recurring] created ' + n + ' ticket(s)');
	} catch (err) {
		console.log('[recurring] cron error: ' + err);
	}
});

routerAdd(
	'POST',
	'/api/recurring-run',
	(e) => {
		const { materialize } = require(`${__hooks}/recurring_lib.js`);
		try {
			return e.json(200, { created: materialize() });
		} catch (err) {
			return e.json(500, { error: '' + err });
		}
	},
	$apis.requireSuperuserAuth()
);
