/// <reference path="../pb_data/types.d.ts" />

// Server-side stamps: who filed, who commented, who finished and when.
// The browser may send these fields, but we always overwrite them here,
// so they can't be faked. (Rules say *if* a request is allowed; hooks
// decide *what* gets saved.)

// ── tickets: create ──────────────────────────────────────────────
onRecordCreateRequest((e) => {
	// e.auth = the signed-in record. Only stamp real people, not superusers.
	if (e.auth && e.auth.collection().name === 'users') {
		e.record.set('created_by', e.auth.id);
	}
	// Filed directly as Done? Stamp it. Otherwise make sure it's empty.
	if (e.record.getString('status') === 'Done') {
		e.record.set('done_at', new DateTime()); // server clock, not the phone's
		e.record.set('done_by', e.auth && e.auth.collection().name === 'users' ? e.auth.id : '');
	} else {
		e.record.set('done_at', '');
		e.record.set('done_by', '');
	}
	e.next(); // hand over to PocketBase to validate + save. Forget this and nothing saves.
}, 'tickets');

// ── tickets: update ──────────────────────────────────────────────
onRecordUpdateRequest((e) => {
	const before = e.record.original(); // the record as it is in the database
	e.record.set('created_by', before.getString('created_by')); // never changes

	const was = before.getString('status');
	const now = e.record.getString('status');

	if (now === 'Done' && was !== 'Done') {
		// just finished -> stamp it
		e.record.set('done_at', new DateTime());
		e.record.set('done_by', e.auth && e.auth.collection().name === 'users' ? e.auth.id : '');
	} else if (now === 'Done') {
		// still Done (e.g. title edited) -> keep the original stamps
		e.record.set('done_at', before.get('done_at'));
		e.record.set('done_by', before.getString('done_by'));
	} else {
		// not Done (reopened, or never done) -> clear
		e.record.set('done_at', '');
		e.record.set('done_by', '');
	}
	e.next();
}, 'tickets');

// ── comments ─────────────────────────────────────────────────────
onRecordCreateRequest((e) => {
	if (e.auth && e.auth.collection().name === 'users') {
		e.record.set('author', e.auth.id);
	}
	e.next();
}, 'comments');

onRecordUpdateRequest((e) => {
	// You may edit your comment's text, not who wrote it or which ticket it's on.
	e.record.set('author', e.record.original().getString('author'));
	e.record.set('ticket', e.record.original().getString('ticket'));
	e.next();
}, 'comments');
