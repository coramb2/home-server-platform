import { requestJson } from './http.js';

export function createSonarr({ url, apiKey }) {
	const call = (path, opts = {}) =>
		requestJson(`${url}/api/v3${path}`, { ...opts, headers: { 'X-Api-Key': apiKey } });

	return {
		async findSeries(tvdbId) {
			const list = await call(`/series?tvdbId=${tvdbId}`);
			return (list ?? []).find((s) => s.tvdbId === tvdbId) ?? null;
		},

		async addSeries({ tvdbId, qualityProfileId, rootFolderPath, path, seriesType }) {
			const found = await call(`/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`);
			if (!found?.length) throw new Error(`tvdb ${tvdbId} not found in Sonarr lookup`);
			const body = {
				...found[0],
				qualityProfileId,
				seriesType,
				monitored: true,
				seasonFolder: true,
				monitorNewItems: 'none',
				addOptions: { monitor: 'none', searchForMissingEpisodes: false, searchForCutoffUnmetEpisodes: false }
			};
			if (path) body.path = path;
			else body.rootFolderPath = rootFolderPath;
			return call('/series', { method: 'POST', body });
		},

		getEpisodes: (seriesId) => call(`/episode?seriesId=${seriesId}`),

		setMonitored: (episodeIds, monitored) =>
			call('/episode/monitor', { method: 'PUT', body: { episodeIds, monitored } }),

		searchEpisodes: (episodeIds) =>
			call('/command', { method: 'POST', body: { name: 'EpisodeSearch', episodeIds } })
	};
}
