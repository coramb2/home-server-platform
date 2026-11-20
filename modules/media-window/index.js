import { loadEnv, loadShows } from './src/config.js';
import { createSonarr } from './src/sonarr.js';
import { createPlex } from './src/plex.js';
import { planWindow } from './src/window.js';

const env = loadEnv();
const sonarr = createSonarr(env.sonarr);
const plex = createPlex(env.plex);
const log = (...args) => console.log(new Date().toISOString(), ...args);

async function runCycle() {
	const shows = await loadShows(env.showsFile); // re-read every cycle: edit the file, no restart needed

	let plexIndex;
	try {
		plexIndex = await plex.showIndex();
	} catch (e) {
		log('Plex unreachable, skipping this cycle:', e.message); // never act without watch state
		return;
	}

	let searches = 0;
	for (const show of shows.filter((s) => s.enabled)) {
		try {
			let series = await sonarr.findSeries(show.tvdbId);
			if (!series) {
				if (env.dryRun) {
					log(`[dry-run] ${show.title}: would add to Sonarr at ${show.path ?? show.root}`);
					continue;
				}
				series = await sonarr.addSeries({
					tvdbId: show.tvdbId,
					qualityProfileId: env.profileId,
					rootFolderPath: show.root,
					path: show.path,
					seriesType: show.seriesType
				});
				log(`${series.title}: added to Sonarr (id ${series.id}), episodes load by the next cycle`);
				continue;
			}

			const episodes = await sonarr.getEpisodes(series.id);
			if (!episodes?.length) {
				log(`${series.title}: Sonarr has no episodes yet, waiting`);
				continue;
			}

			const ratingKey = plexIndex.get(show.tvdbId);
			const watched = ratingKey ? await plex.watchedKeys(ratingKey) : new Set(); // not in Plex yet = nothing watched

			const plan = planWindow({
				episodes,
				watched,
				show: { ...show, seriesEnded: series.status === 'ended' },
				now: new Date()
			});
			if (plan.action !== 'extend') {
				log(`${series.title}: ${plan.action} (${plan.reason})`);
				continue;
			}

			const names = plan.monitorIds
				.map((id) => episodes.find((e) => e.id === id))
				.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`)
				.join(' ');

			if (env.dryRun) {
				log(`[dry-run] ${series.title}: would monitor + search ${names} (${plan.reason})`);
				continue;
			}
			if (searches >= env.maxSearches) {
				log(`${series.title}: search limit reached, deferred to next cycle`);
				continue; // don't monitor without searching, or the window would think it's handled
			}
			await sonarr.setMonitored(plan.monitorIds, true);
			await sonarr.searchEpisodes(plan.monitorIds);
			searches++;
			log(`${series.title}: monitored + searching ${names} (${plan.reason})`);
		} catch (e) {
			log(`${show.title}: ERROR ${e.message}`); // one broken show doesn't stop the others
		}
	}
}

process.on('SIGTERM', () => process.exit(0)); // clean stop in Docker

log(`media-window starting (dry-run: ${env.dryRun}, every ${env.intervalMin} min)`);
while (true) {
	try {
		await runCycle();
	} catch (e) {
		log('cycle failed:', e.message);
	}
	if (env.runOnce) break;
	await new Promise((r) => setTimeout(r, env.intervalMin * 60_000));
}
