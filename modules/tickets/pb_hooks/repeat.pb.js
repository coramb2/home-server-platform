/// <reference path="/home/cora/pbtest/types.d.ts" />

// Repeating tickets. When a ticket with "repeat every N days" is marked Done,
// file the next one. If it's reopened, take that next one back.
// Date math + database work live in repeat_lib.js.

// New tickets from people: visible now, no series yet, no fake ext_key.
onRecordCreateRequest((e) => {
	e.record.set('show_from', '');
	e.record.set('series', '');
	// ext_key is for automation (alert bridge = superuser). People can't set it,
	// or they could claim another ticket's "repeat:<id>" key.
	if (e.auth && e.auth.collection().name === 'users') e.record.set('ext_key', '');
	e.next();
}, 'tickets');

onRecordUpdateRequest((e) => {
	const before = e.record.original();
	const was = before.getString('status');
	const { fileNext, takeBack, showFromFor } = require(`${__hooks}/repeat_lib.js`);

	// Server-owned fields: the browser can't change these.
	e.record.set('ext_key', before.getString('ext_key'));
	e.record.set('series', before.getString('series'));
	// First repeating save: start a series named after this ticket.
	if (e.record.getInt('repeat_days') > 0 && !e.record.getString('series')) {
		e.record.set('series', e.record.id);
	}
	// Recomputed from due date + reminder (so editing either moves it).
	e.record.set('show_from', showFromFor(e.record));

	e.next(); // stamps.pb.js runs, then the ticket is saved

	const now = e.record.getString('status');
	try {
		if (now === 'Done' && was !== 'Done') {
			const n = fileNext(e.app, e.record);
			if (n) console.log('[repeat] ' + e.record.id + ' -> next ' + n.id + ' due ' + n.getString('due_date'));
		} else if (was === 'Done' && now !== 'Done') {
			if (takeBack(e.app, e.record)) console.log('[repeat] ' + e.record.id + ' reopened; next one removed');
		}
	} catch (err) {
		// The status change itself is already saved; log rather than fail it.
		console.log('[repeat] error on ' + e.record.id + ': ' + err);
	}
}, 'tickets');
