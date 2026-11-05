// Repeating tickets: work out the next occurrence and file it.
// require()'d inside hook handlers (handlers run in isolated scope and can't
// share top-level functions). Pure date math is separate from the database
// work so it's easy to read and test.

const DAY = 86400000;

// Date-only values are stored at 12:00 UTC: the same calendar day in every
// US time zone, so "Nov 10" never shows as "Nov 9".
function noon(y, m, d) {
	return Date.UTC(y, m, d, 12);
}

// "2026-11-20 12:00:00.000Z" (or "2026-11-20 00:00:00.000Z") -> noon of that date.
function dayOf(pbDate) {
	const [y, m, d] = pbDate.slice(0, 10).split('-').map(Number);
	return noon(y, m - 1, d);
}

// Today's date where the household lives. The container's TZ
// (America/New_York) decides what "today" is, not UTC.
function today(nowMs) {
	const n = new Date(nowMs);
	return noon(n.getFullYear(), n.getMonth(), n.getDate());
}

function toPB(ms) {
	return new Date(ms).toISOString().replace('T', ' ');
}

/**
 * When is the next one due, and when should it appear on the board?
 * fixed            -> due date + every N days; skip cycles already in the past
 *                     (missed weeks aren't queued up).
 * after_completion -> today + N days.
 * A fixed ticket with no due date behaves like after_completion.
 */
function nextDates(o) {
	const every = o.every * DAY;
	const t = today(o.nowMs);
	let next;
	if (o.mode === 'fixed' && o.due) {
		next = dayOf(o.due) + every;
		while (next <= t) next += every;
	} else {
		next = t + every;
	}
	return { due: toPB(next), showFrom: toPB(next - (o.remind || 0) * DAY) };
}

// Successor's ext_key. The unique index on ext_key means a ticket can only
// ever have one successor, even if two requests race.
const keyFor = (id) => 'repeat:' + id;

function findSuccessor(app, rec) {
	try {
		return app.findFirstRecordByData('tickets', 'ext_key', keyFor(rec.id));
	} catch (_) {
		return null;
	}
}

/** Ticket just moved to Done: file the next occurrence (once). */
function fileNext(app, rec) {
	const every = rec.getInt('repeat_days');
	if (every < 1 || findSuccessor(app, rec)) return null;

	const d = nextDates({
		every: every,
		mode: rec.getString('repeat_mode') || 'fixed',
		remind: rec.getInt('remind_days'),
		due: rec.getString('due_date'),
		nowMs: Date.now()
	});

	const n = new Record(rec.collection());
	for (const f of ['title', 'description', 'category', 'priority', 'repeat_mode', 'created_by']) {
		n.set(f, rec.get(f));
	}
	n.set('assignee', rec.getStringSlice('assignee'));
	n.set('repeat_days', every);
	n.set('remind_days', rec.getInt('remind_days'));
	n.set('series', rec.getString('series') || rec.id);
	n.set('status', 'Open');
	n.set('due_date', d.due);
	n.set('show_from', d.showFrom);
	n.set('ext_key', keyFor(rec.id));
	app.save(n);
	return n;
}

/**
 * Ticket reopened (Done -> anything else): take back the successor it filed,
 * but only if nobody has touched it yet (still Open, no comments). If someone
 * has, keep it; marking this one Done again won't file a duplicate.
 */
function takeBack(app, rec) {
	const s = findSuccessor(app, rec);
	if (!s || s.getString('status') !== 'Open') return false;
	const comments = app.findRecordsByFilter('comments', 'ticket = {:id}', '', 1, 0, { id: s.id });
	if (comments.length) return false;
	app.delete(s);
	return true;
}

/**
 * When should this ticket appear on the board? Server-owned, never trusted
 * from the browser (otherwise anyone could hide a ticket with a future date).
 * Only occurrences the server filed (or migrated) wait for their reminder
 * window; tickets people file by hand are visible right away.
 */
function showFromFor(rec) {
	const key = rec.getString('ext_key');
	const filed = key.indexOf('repeat:') === 0 || key.indexOf('migrated:') === 0;
	const due = rec.getString('due_date');
	if (rec.getInt('repeat_days') < 1 || !filed || !due) return '';
	return toPB(dayOf(due) - rec.getInt('remind_days') * DAY);
}

module.exports = { nextDates, fileNext, takeBack, showFromFor };
