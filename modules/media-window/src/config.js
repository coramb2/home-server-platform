import { readFile } from 'node:fs/promises';
import { parseRanges } from './ranges.js';

const LIBRARIES = {
	live_action: { root: '/data/TV Shows/Live Action', seriesType: 'standard' },
	anime: { root: '/data/TV Shows/Anime', seriesType: 'anime' },
	cartoons: { root: '/data/TV Shows/Cartoons', seriesType: 'standard' }
};

function required(name) {
	const v = process.env[name];
	if (!v) throw new Error(`missing env ${name}`);
	return v;
}

function int(value, min, max, fallback, where) {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new Error(`${where} must be a whole number from ${min} to ${max}`);
	}
	return value;
}

export function loadEnv() {
	return {
		sonarr: { url: required('SONARR_URL').replace(/\/$/, ''), apiKey: required('SONARR_API_KEY') },
		plex: { url: required('PLEX_URL').replace(/\/$/, ''), token: required('PLEX_TOKEN') },
		profileId: Number(required('SONARR_PROFILE_ID')),
		showsFile: required('SHOWS_FILE'),
		dryRun: process.env.DRY_RUN !== 'false', // anything except exactly "false" = dry-run
		runOnce: process.env.RUN_ONCE === 'true',
		intervalMin: Number(process.env.INTERVAL_MINUTES ?? 15),
		maxSearches: Number(process.env.MAX_SEARCHES_PER_CYCLE ?? 5)
	};
}

export async function loadShows(file) {
	const raw = JSON.parse(await readFile(file, 'utf8'));
	if (!Array.isArray(raw)) throw new Error('shows file must be a JSON array');
	return raw.map((s, i) => {
		const where = `shows[${i}]`;
		if (!Number.isInteger(s.tvdbId) || s.tvdbId <= 0) throw new Error(`${where}.tvdbId must be a positive whole number`);
		const lib = LIBRARIES[s.library];
		if (!lib) throw new Error(`${where}.library must be one of: ${Object.keys(LIBRARIES).join(', ')}`);
		if (s.path !== undefined) {
			if (typeof s.path !== 'string' || !s.path.startsWith(`${lib.root}/`) || s.path.includes('..')) {
				throw new Error(`${where}.path must be a folder inside ${lib.root}`);
			}
		}
		const batchSize = int(s.batchSize, 1, 25, 10, `${where}.batchSize`);
				let filler;
		if (s.filler !== undefined) {
			if (s.library !== 'anime') throw new Error(`${where}.filler is only for library "anime"`);
			const ask = parseRanges(s.filler.ask, `${where}.filler.ask`);
			const skip = parseRanges(s.filler.skip, `${where}.filler.skip`);
			const download = parseRanges(s.filler.download, `${where}.filler.download`);
			for (const n of [...skip, ...download]) {
				if (!ask.has(n)) throw new Error(`${where}.filler: episode ${n} is decided but not in "ask"`);
				if (skip.has(n) && download.has(n)) throw new Error(`${where}.filler: episode ${n} is in both skip and download`);
			}
			filler = { ask, skip, download };
		}
		return {
			tvdbId: s.tvdbId,
			title: typeof s.title === 'string' ? s.title : `tvdb ${s.tvdbId}`,
			root: lib.root,
			seriesType: lib.seriesType,
			path: s.path,
			startSeason: int(s.startSeason, 1, 999, 1, `${where}.startSeason`),
			startEpisode: int(s.startEpisode, 1, 9999, 1, `${where}.startEpisode`),
			batchSize,
			triggerAt: int(s.triggerAt, 0, batchSize, 3, `${where}.triggerAt`),
			enabled: s.enabled !== false,
			filler
		};
	});
}
