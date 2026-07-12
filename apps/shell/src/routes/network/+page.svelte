<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	// Placeholder — Sprint 5 rebuilds this against the traffic-analyzer's
	// /api/network/* endpoints (live stats, alerts) with real charts, and wires
	// curated alerts into security tickets.

	// Decorative preview sparkline (static) — hints at the live graphs to come.
	const spark = [8, 14, 9, 20, 16, 28, 22, 34, 26, 40, 30, 46, 38, 33, 44, 52, 41, 48];
	const w = 520;
	const h = 90;
	const max = Math.max(...spark);
	const pts = spark
		.map((v, i) => `${(i / (spark.length - 1)) * w},${h - (v / max) * (h - 10) - 5}`)
		.join(' ');
</script>

<div class="net">
	<header class="nhead">
		<div>
			<h1><Icon name="activity" size={22} /> Network</h1>
			<p class="sub">Live traffic and threat monitoring from the home analyzer.</p>
		</div>
		<span class="badge">Planned · Sprint 5</span>
	</header>

	<div class="grid">
		<div class="tile"><div class="tile-num" style="color:var(--violet)">—</div><div class="tile-label">Packets / s</div></div>
		<div class="tile"><div class="tile-num" style="color:var(--blue)">—</div><div class="tile-label">Devices</div></div>
		<div class="tile"><div class="tile-num" style="color:var(--amber)">—</div><div class="tile-label">Open alerts</div></div>
		<div class="tile"><div class="tile-num" style="color:var(--teal)">—</div><div class="tile-label">Blocked (24h)</div></div>
	</div>

	<div class="chart panel">
		<div class="chart-head"><span>Throughput</span><span class="muted">preview</span></div>
		<svg viewBox="0 0 {w} {h}" preserveAspectRatio="none" class="spark">
			<defs>
				<linearGradient id="ng" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="rgba(167,139,250,0.35)" />
					<stop offset="1" stop-color="rgba(167,139,250,0)" />
				</linearGradient>
			</defs>
			<polygon points="0,{h} {pts} {w},{h}" fill="url(#ng)" />
			<polyline points={pts} fill="none" stroke="#a78bfa" stroke-width="2" stroke-linejoin="round" />
		</svg>
	</div>

	<ul class="list">
		<li>Live packet rate, protocol mix, and top talkers</li>
		<li>Open security alerts with allowlisting and resolution</li>
		<li>Curated alerts auto-file as <code>security</code> tickets (deduped, no spam)</li>
	</ul>
</div>

<style>
	.net {
		max-width: 760px;
		margin: 0 auto;
	}
	.nhead {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1.4rem;
	}
	.sub {
		margin: 0.2rem 0 0;
		color: var(--muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.chart {
		padding: 1rem 1.1rem 0.6rem;
		margin-bottom: 1.25rem;
	}
	.chart-head {
		display: flex;
		justify-content: space-between;
		font-size: 0.82rem;
		color: var(--ink);
		margin-bottom: 0.4rem;
	}
	.muted {
		color: var(--faint);
	}
	.spark {
		width: 100%;
		height: 90px;
		display: block;
	}
	.list {
		color: var(--muted);
		line-height: 1.9;
		padding-left: 1.1rem;
	}
	code {
		background: rgba(167, 139, 250, 0.14);
		color: var(--violet);
		padding: 0.05rem 0.4rem;
		border-radius: 5px;
	}
	@media (max-width: 640px) {
		.grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
