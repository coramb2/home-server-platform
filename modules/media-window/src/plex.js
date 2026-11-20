import { requestJson } from './http.js';

export function createPlex({ url, token }) {
	const call = (path) => requestJson(`${url}${path}`, { headers: { 'X-Plex-Token': token } });

	return {
		// tvdbId -> ratingKey for every show in every TV library (Live Action, Anime & Cartoons).
		async showIndex() {
			const sections = await call('/library/sections');
			const index = new Map();
			for (const dir of sections.MediaContainer.Directory ?? []) {
				if (dir.type !== 'show') continue;
				const all = await call(`/library/sections/${dir.key}/all?includeGuids=1`);
				for (const show of all.MediaContainer.Metadata ?? []) {
					for (const g of show.Guid ?? []) {
						const m = /^tvdb:\/\/(\d+)$/.exec(g.id);
						if (m) index.set(Number(m[1]), show.ratingKey);
					}
				}
			}
			return index;
		},

		// Set of "S<season>E<episode>" keys watched at least once.
		async watchedKeys(ratingKey) {
			const leaves = await call(`/library/metadata/${ratingKey}/allLeaves`);
			const keys = new Set();
			for (const ep of leaves.MediaContainer.Metadata ?? []) {
				if ((ep.viewCount ?? 0) > 0) keys.add(`S${ep.parentIndex}E${ep.index}`);
			}
			return keys;
		}
	};
}
