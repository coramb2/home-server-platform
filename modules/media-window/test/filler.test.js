import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWindow } from '../src/window.js';
import { parseRanges } from '../src/ranges.js';

const NOW = new Date('2026-11-20T00:00:00Z');

// One long season, episode N = absolute N (like a simple anime season).
function eps(count) {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		seasonNumber: 1,
		episodeNumber: i + 1,
		absoluteEpisodeNumber: i + 1,
		monitored: false,
		hasFile: false,
		airDateUtc: '2010-01-01T00:00:00Z'
	}));
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const filler = (ask, skip = '', download = '') => ({
	ask: parseRanges(ask, 't'),
	skip: parseRanges(skip, 't'),
	download: parseRanges(download, 't')
});
const plan = (episodes, f) =>
	planWindow({
		episodes,
		watched: new Set(),
		show: { startSeason: 1, startEpisode: 1, batchSize: 10, triggerAt: 3, seriesEnded: true, filler: f },
		now: NOW
	});

test('parseRanges: ranges and single numbers', () => {
	assert.deepEqual([...parseRanges('3-5, 9', 't')], [3, 4, 5, 9]);
	assert.throws(() => parseRanges('3-x', 't'));
	assert.throws(() => parseRanges('9-3', 't'));
});

test('skipped stretch is jumped over', () => {
	const r = plan(eps(30), filler('4-8', '4-8'));
	assert.equal(r.action, 'extend');
	assert.deepEqual(r.monitorIds, [1, 2, 3, ...range(9, 15)]);
});

test('decided "download" stretch is included', () => {
	const r = plan(eps(30), filler('4-8', '', '4-8'));
	assert.deepEqual(r.monitorIds, range(1, 10));
});

test('undecided stretch: canon before it only', () => {
	const r = plan(eps(30), filler('4-8'));
	assert.equal(r.action, 'extend');
	assert.deepEqual(r.monitorIds, [1, 2, 3]);
});

test('undecided stretch right ahead: waiting_for_decision', () => {
	const e = eps(30);
	for (const ep of e.slice(0, 3)) ep.hasFile = true;
	const r = plan(e, filler('4-8'));
	assert.equal(r.action, 'waiting_for_decision');
	assert.deepEqual(r.monitorIds, []);
});

test('skipped episodes on disk do not count as in the window', () => {
	const e = eps(30);
	for (const ep of e.slice(3, 8)) ep.hasFile = true; // 4-8 on disk but skipped
	const r = plan(e, filler('4-8', '4-8'));
	assert.deepEqual(r.monitorIds, [1, 2, 3, ...range(9, 15)]);
});

test('missing absolute number with filler rules: error, nothing monitored', () => {
	const e = eps(30);
	e[0].absoluteEpisodeNumber = null;
	const r = plan(e, filler('4-8', '4-8'));
	assert.equal(r.action, 'error');
	assert.deepEqual(r.monitorIds, []);
});
