<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { pb } from '$lib/pb';
	import { fetchNetwork, type NetOverview } from '$lib/network';
	import type { Ticket } from '$lib/types';

	let net = $state<NetOverview | null>(null);
	let loaded = $state(false);
	let secTickets = $state<Ticket[]>([]);

	$effect(() => {
		let alive = true;
		const loadSec = async () => {
			try {
				const t = await pb.collection('tickets').getFullList<Ticket>({
					filter: pb.filter('category = {:c} && status != {:s}', { c: 'security', s: 'Done' }),
					sort: '-created',
					expand: 'assignee'
				});
				if (alive) secTickets = t;
			} catch {
				/* not signed in / offline — leave as is */
			}
		};
		const tick = async () => {
			const n = await fetchNetwork();
			if (alive) {
				net = n;
				loaded = true;
			}
			loadSec();
		};
		tick();
		const id = setInterval(tick, 5000);
		return () => {
			alive = false;
			clearInterval(id);
		};
	});

	function fmtNum(n: number | null): string {
		if (n == null) return '—';
		if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
		if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
		return `${Math.round(n)}`;
	}

	const trendMax = $derived(Math.max(1, ...(net?.trend.map((t) => t.value) ?? [1])));
	const protoTotal = $derived((net?.protocols ?? []).reduce((a, p) => a + p.value, 0) || 1);
	const talkerMax = $derived(Math.max(1, ...(net?.talkers.map((t) => t.packets) ?? [1])));

	const statusTone = $derived(
		net?.status === 'live' ? 'ok' : net?.status === 'idle' ? 'idle' : 'plan'
	);
	const protoColors = ['#a78bfa', '#60a5fa', '#2dd4bf', '#fbbf24', '#f472b6', '#fb7185'];
</script>

<div class="net">
	<header class="nhead">
		<div>
			<h1><Icon name="activity" size={22} /> Network</h1>
			<p class="sub">Live traffic and threats from the home analyzer.</p>
		</div>
		{#if net}
			<span class="badge net-{statusTone}"
				>{net.status === 'live' ? 'Capturing' : net.status === 'idle' ? 'Idle' : 'No data'}</span
			>
		{:else if loaded}
			<span class="badge off">Offline</span>
		{/if}
	</header>

	{#if !net}
		<div class="panel disconnected">
			<Icon name="activity" size={26} />
			<div>
				<p class="dc-title">{loaded ? 'Analyzer not connected' : 'Connecting…'}</p>
				<p class="dc-sub">
					The Network tab reads the traffic analyzer's API at <code>/api/network</code>. It appears
					unreachable or not authorized. Bring the analyzer up behind the platform and this lights up
					with live charts.
				</p>
			</div>
		</div>
	{:else}
		<div class="tiles">
			<div class="tile"><div class="tile-num" style="color:var(--violet)">{fmtNum(net.packetsPerSec)}</div><div class="tile-label">Packets / s</div></div>
			<div class="tile"><div class="tile-num" style="color:var(--blue)">{net.deviceCount ?? '—'}</div><div class="tile-label">Devices</div></div>
			<div class="tile"><div class="tile-num" style="color:{net.openAlerts ? 'var(--red)' : 'var(--teal)'}">{net.openAlerts ?? '—'}</div><div class="tile-label">Open alerts</div></div>
			<div class="tile"><div class="tile-num grad-text">{fmtNum(net.totalPackets)}</div><div class="tile-label">Packets (run)</div></div>
		</div>

		<div class="panel">
			<div class="panel-head"><span>Throughput · recent runs</span>{#if net.iface}<span class="muted">{net.iface}</span>{/if}</div>
			{#if net.trend.length}
				<div class="chart">
					{#each net.trend as t, i (i)}
						<div class="day" title="{t.label}: {fmtNum(t.value)} packets">
							<div class="bar" style="height:{(t.value / trendMax) * 100}%"></div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty">No runs yet.</p>
			{/if}
		</div>

		<div class="cols">
			<div class="panel">
				<div class="panel-head"><span>Protocol mix</span></div>
				{#if net.protocols.length}
					<div class="protos">
						{#each net.protocols as p, i (p.name)}
							<div class="proto">
								<span class="proto-name">{p.name}</span>
								<div class="proto-track">
									<div
										class="proto-fill"
										style="width:{(p.value / protoTotal) * 100}%;background:{protoColors[i % protoColors.length]}"
									></div>
								</div>
								<span class="proto-val">{Math.round((p.value / protoTotal) * 100)}%</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty">—</p>
				{/if}
			</div>

			<div class="panel">
				<div class="panel-head"><span>Top talkers</span></div>
				{#if net.talkers.length}
					<div class="talkers">
						{#each net.talkers as d (d.name)}
							<div class="talker">
								<span class="talker-name">{d.name}</span>
								<div class="talker-track">
									<div class="talker-fill" style="width:{(d.packets / talkerMax) * 100}%"></div>
								</div>
								<span class="talker-val">{fmtNum(d.packets)}</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty">—</p>
				{/if}
			</div>
		</div>

		<p class="note">
			Curated security alerts from the analyzer auto-file as <code>security</code> tickets — listed
			below (deduped, no notification spam).
		</p>
	{/if}

	<section class="panel secpanel">
		<div class="panel-head">
			<span><Icon name="ticket" size={15} /> Security tickets</span>
			<span class="seccount">{secTickets.length}</span>
		</div>
		{#if secTickets.length === 0}
			<p class="empty">No open security alerts.</p>
		{:else}
			<div class="sec-list">
				{#each secTickets as t (t.id)}
					<a class="sec-row" href="/tickets/{t.id}">
						{#if t.priority}<span class="pri pri-{t.priority}">{t.priority}</span>{/if}
						<span class="sec-title">{t.title}</span>
						<span class="sec-status">{t.status}</span>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.net {
		max-width: 900px;
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
	.net-ok {
		color: var(--teal);
		background: rgba(45, 212, 191, 0.12);
		border-color: rgba(45, 212, 191, 0.25);
	}
	.net-idle {
		color: var(--violet);
		background: rgba(167, 139, 250, 0.12);
		border-color: rgba(167, 139, 250, 0.28);
	}
	.badge.off,
	.net-plan {
		color: var(--red);
		background: rgba(251, 113, 133, 0.12);
		border-color: rgba(251, 113, 133, 0.25);
	}
	.disconnected {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		color: var(--muted);
	}
	.disconnected :global(svg) {
		color: var(--violet);
		flex: none;
	}
	.dc-title {
		margin: 0 0 0.25rem;
		color: var(--ink);
		font-weight: 500;
	}
	.dc-sub {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.1rem;
	}
	.panel {
		padding: 1rem 1.15rem;
		margin-bottom: 1.1rem;
	}
	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.86rem;
		color: var(--ink);
		margin-bottom: 0.9rem;
	}
	.muted {
		color: var(--faint);
		font-family: var(--mono);
		font-size: 0.78rem;
	}
	.chart {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 110px;
	}
	.day {
		flex: 1;
		height: 100%;
		display: flex;
		align-items: flex-end;
	}
	.bar {
		width: 100%;
		min-height: 2px;
		border-radius: 3px 3px 0 0;
		background: var(--violet);
		box-shadow: 0 0 8px rgba(167, 139, 250, 0.4);
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.1rem;
	}
	.cols .panel {
		margin-bottom: 0;
	}
	.protos,
	.talkers {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.proto,
	.talker {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.84rem;
	}
	.proto-name,
	.talker-name {
		width: 34%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.talker-name {
		font-family: var(--mono);
		font-size: 0.78rem;
	}
	.proto-track,
	.talker-track {
		flex: 1;
		height: 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 999px;
		overflow: hidden;
	}
	.proto-fill,
	.talker-fill {
		height: 100%;
		border-radius: 999px;
	}
	.talker-fill {
		background: linear-gradient(90deg, var(--violet), var(--pink));
	}
	.proto-val,
	.talker-val {
		width: 3.5ch;
		text-align: right;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.empty {
		color: var(--faint);
		text-align: center;
		margin: 0.4rem 0;
	}
	.note {
		margin-top: 1.25rem;
		color: var(--faint);
		font-size: 0.85rem;
	}
	code {
		background: rgba(167, 139, 250, 0.14);
		color: var(--violet);
		padding: 0.05rem 0.4rem;
		border-radius: 5px;
	}
	.secpanel {
		padding: 1rem 1.15rem;
		margin-top: 1.1rem;
	}
	.seccount {
		background: rgba(251, 113, 133, 0.16);
		color: var(--red);
		border-radius: 999px;
		padding: 0 0.5rem;
		font-size: 0.75rem;
	}
	.sec-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.sec-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: 9px;
		color: var(--ink);
		background: var(--panel-2);
	}
	.sec-row:hover {
		border-color: var(--line-strong);
	}
	.pri {
		flex: none;
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0.1rem 0.36rem;
		border-radius: 5px;
		color: #0b0f1e;
	}
	.pri-P1 {
		background: var(--red);
	}
	.pri-P2 {
		background: var(--amber);
	}
	.pri-P3 {
		background: var(--violet);
	}
	.pri-P4 {
		background: var(--teal);
	}
	.sec-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sec-status {
		color: var(--muted);
		font-size: 0.78rem;
	}
	@media (max-width: 720px) {
		.tiles {
			grid-template-columns: repeat(2, 1fr);
		}
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
