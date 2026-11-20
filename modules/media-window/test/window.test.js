import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWindow } from '../src/window.js';

const NOW = new Date('2026-11-19T00:00:00Z');
const SHOW = { startSeason: 1, startEpisode: 1, batchSize: 10, triggerAt: 3, seriesEnded: true };

// 2 seasons x 6 episodes, ids 1-12, all aired, nothing monitored or downloaded.
function makeEpisodes(perSeason = [6, 6]) {
	const eps = [];
	let id = 1;
	perSeason.forEach((count, i) => {
		for (let e = 1; e <= count; e++) {
			eps.push({
				id: id++,
				seasonNumber: i + 1,
				episodeNumber: e,
				monitored: false,
				hasFile: false,
				airDateUtc: '2020-01-01T00:00:00Z'
			});
		}
	});
	return eps;
}

// Change fields on the episodes with these ids.
function set(eps, ids, fields) {
	for (const ep of eps) if (ids.includes(ep.id)) Object.assign(ep, fields);
}

// Ids from..to as an array, e.g. range(1, 3) -> [1, 2, 3].
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Episode ids from..to as watched keys like "S1E1". Only works for this 6-per-season data.
const watchedUpTo = (lastId) =>
	range(1, lastId).map((id) => `S${Math.ceil(id / 6)}E${((id - 1) % 6) + 1}`);

function plan(episodes, watched = [], show = {}) {
	return planWindow({ episodes, watched: new Set(watched), show: { ...SHOW, ...show }, now: NOW });
}

test('fresh show: wants the first 10 episodes', () => {
	const r = plan(makeEpisodes());
	assert.equal(r.action, 'extend');
	assert.deepEqual(r.monitorIds, range(1, 10));
});

test('mid-window: 4 episodes left, so nothing happens', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 10), { monitored: true, hasFile: true });
	const r = plan(eps, watchedUpTo(6));
	assert.equal(r.action, 'none');
});

test('at the trigger: 3 left, so it adds the rest (only 2 exist)', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 10), { monitored: true, hasFile: true });
	const r = plan(eps, watchedUpTo(7));
	assert.equal(r.action, 'extend');
	assert.deepEqual(r.monitorIds, [11, 12]);
});

test('still downloading counts as in the window (no re-trigger every 15 min)', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 10), { monitored: true });
	const r = plan(eps);
	assert.equal(r.action, 'none');
});

test('watched past the window: extends from where they are', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 3), { monitored: true, hasFile: true });
	const r = plan(eps, watchedUpTo(8));
	assert.equal(r.action, 'extend');
	assert.deepEqual(r.monitorIds, range(9, 12));
});

test('existing show: files on disk count as in the window even if unmonitored', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 12), { hasFile: true });
	const r = plan(eps);
	assert.equal(r.action, 'none');
});

test('ended show with everything present: complete', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 12), { monitored: true, hasFile: true });
	const r = plan(eps, watchedUpTo(10));
	assert.equal(r.action, 'complete');
	assert.deepEqual(r.monitorIds, []);
});

test('running show, next episodes not aired yet: waiting_for_air', () => {
	const eps = makeEpisodes();
	set(eps, range(1, 10), { monitored: true, hasFile: true });
	set(eps, [11, 12], { airDateUtc: '2027-01-01T00:00:00Z' });
	const r = plan(eps, watchedUpTo(8), { seriesEnded: false });
	assert.equal(r.action, 'waiting_for_air');
});

test('specials (season 0) are ignored', () => {
	const eps = makeEpisodes();
	eps.push({ id: 99, seasonNumber: 0, episodeNumber: 1, monitored: false, hasFile: false, airDateUtc: '2020-01-01T00:00:00Z' });
	const r = plan(eps, ['S0E1']);
	assert.deepEqual(r.monitorIds, range(1, 10));
});

test('start point in season 2', () => {
	const r = plan(makeEpisodes(), [], { startSeason: 2, startEpisode: 1 });
	assert.deepEqual(r.monitorIds, range(7, 12));
});

test('start point that does not exist: error, nothing monitored', () => {
	const r = plan(makeEpisodes(), [], { startSeason: 5, startEpisode: 1 });
	assert.equal(r.action, 'error');
	assert.deepEqual(r.monitorIds, []);
});
