// planWindow: decides which episodes to monitor next.
// Pure: no network, no clock, no database. Same input -> same output.

const key = (season, episode) => `S${season}E${episode}`;

export function planWindow({ episodes, watched, show, now }) {
	// 1. Main episodes in viewing order. Season 0 (specials) and skipped filler are left out.
	const skip = show.filler?.skip ?? new Set();
	const eps = episodes
		.filter((ep) => ep.seasonNumber > 0)
		.filter((ep) => !skip.has(ep.absoluteEpisodeNumber))
		.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
	// 2. Where the show starts for us.
	const startIdx = eps.findIndex(
		(ep) => ep.seasonNumber === show.startSeason && ep.episodeNumber === show.startEpisode
	);
	if (startIdx === -1) {
		return {
			action: 'error',
			monitorIds: [],
			reason: `start S${show.startSeason}E${show.startEpisode} not found`
		};
	}

	// 3. Furthest watched episode at or after the start (startIdx - 1 = nothing watched yet).
	let furthest = startIdx - 1;
	for (let i = startIdx; i < eps.length; i++) {
		if (watched.has(key(eps[i].seasonNumber, eps[i].episodeNumber))) furthest = i;
	}

	// 4. What's already lined up: on disk OR wanted (still downloading).
	const ahead = eps.slice(furthest + 1);
	const inWindow = ahead.filter((ep) => ep.hasFile || ep.monitored);
	if (inWindow.length > show.triggerAt) {
		return { action: 'none', monitorIds: [], reason: `${inWindow.length} in window` };
	}

	// 5. The next batch: after the last lined-up episode, aired, not yet there or wanted.
	//    With filler rules: stop before any episode that still needs a decision.
	const lastIn = inWindow.length > 0 ? eps.indexOf(inWindow[inWindow.length - 1]) : furthest;
	const candidates = eps
		.slice(lastIn + 1)
		.filter((ep) => !ep.hasFile && !ep.monitored)
		.filter((ep) => ep.airDateUtc && new Date(ep.airDateUtc) <= now);

	const next = [];
	let blocked = null;
	for (const ep of candidates) {
		if (next.length >= show.batchSize) break;
		if (show.filler) {
			const abs = ep.absoluteEpisodeNumber;
			if (!Number.isInteger(abs)) {
				blocked = { action: 'error', reason: `S${ep.seasonNumber}E${ep.episodeNumber} has no absolute number` };
				break;
			}
			if (show.filler.ask.has(abs) && !show.filler.download.has(abs)) {
				blocked = { action: 'waiting_for_decision', reason: `episode ${abs} needs a filler decision` };
				break;
			}
		}
		next.push(ep);
	}

	if (next.length === 0 && blocked) {
		return { action: blocked.action, monitorIds: [], reason: blocked.reason };
	}

	// 6. Nothing to add: finished show, or waiting for new episodes to air.
	if (next.length === 0) {
		return {
			action: show.seriesEnded ? 'complete' : 'waiting_for_air',
			monitorIds: [],
			reason: 'nothing left to add'
		};
	}

	return {
		action: 'extend',
		monitorIds: next.map((ep) => ep.id),
		reason: `${inWindow.length} in window, adding ${next.length}`
	};
}
