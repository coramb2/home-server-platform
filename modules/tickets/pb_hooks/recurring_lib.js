// Shared logic for the recurring hook. Handlers registered via cronAdd/routerAdd
// run in isolated scope and can't see each other's top-level functions, so this
// is require()'d inside each handler. $app, Record, Date etc. are available on
// the handler's runtime at call time.
function materialize() {
	const nowStr = new Date().toISOString().replace('T', ' '); // PB datetime format
	const due = $app.findRecordsByFilter(
		'recurring_tasks',
		'active = true && next_due <= {:now}',
		'next_due',
		200,
		0,
		{ now: nowStr }
	);
	const ticketsCol = $app.findCollectionByNameOrId('tickets');
	let created = 0;
	for (const r of due) {
		const t = new Record(ticketsCol);
		t.set('title', r.get('title'));
		t.set('description', r.get('description'));
		t.set('status', 'Open');
		t.set('category', r.get('category'));
		t.set('priority', r.get('priority'));
		t.set('assignee', r.get('assignee'));
		t.set('ext_key', 'recurring:' + r.id + ':' + r.getString('next_due'));
		$app.save(t);
		created++;

		// Advance from now by interval_days (no backlog storms if it was overdue).
		const iv = r.getInt('interval_days') || 1;
		const next = new Date(Date.now() + iv * 86400000);
		r.set('next_due', next.toISOString());
		r.set('last_created', new Date().toISOString());
		$app.save(r);
	}
	return created;
}

module.exports = { materialize };
