<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	// Placeholder — a future Jellyfin module (movies/shows/music) as its own tab.
</script>

<div class="media panel">
	<h1><Icon name="media" size={22} /> Media</h1>
	<p>A self-hosted movie, show, and music library (Jellyfin) will plug in here as its own module — same platform, same door, its own tab.</p>
	<span class="badge">Future</span>
</div>

<style>
	.media {
		max-width: 620px;
		margin: 2rem auto;
		padding: 1.9rem;
		box-shadow: var(--glow-violet);
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0;
		font-size: 1.4rem;
	}
	p {
		color: var(--muted);
		line-height: 1.7;
	}
</style>
