<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { type Ticket } from '$lib/types';
	import Icon from '$lib/Icon.svelte';

	let tickets = $state<Ticket[]>([]);
	let health = $state<'checking' | 'online' | 'offline'>('checking');
	let loading = $state(true);

	async function load() {
		try {
			tickets = await pb
				.collection('tickets')
				.getFullList<Ticket>({ sort: '-created', expand: 'assignee,done_by' });
		} catch {
			/* leave prior data */
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
		pb.health
			.check()
			.then(() => (health = 'online'))
			.catch(() => (health = 'offline'));
		let cancel: (() => void) | undefined;
		let t: ReturnType<typeof setTimeout>;
		pb.collection('tickets')
			.subscribe('*', () => {
				clearTimeout(t);
				t = setTimeout(load, 150);
			})
			.then((c) => (cancel = c));
		return () => {
			clearTimeout(t);
			cancel?.();
		};
	});

	function fmt(ms: number) {
		if (!isFinite(ms) || ms < 0) return '—';
		const m = Math.round(ms / 60000);
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 6) / 10;
		if (h < 48) return `${h}h`;
		return `${Math.round(h / 24)}d`;
	}
	const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

	const stats = $derived.by(() => {
		const done = tickets.filter((t) => t.status === 'Done' && t.done_at);
		const durs = done
			.map((t) => new Date(t.done_at as string).getTime() - new Date(t.created).getTime())
			.filter((x) => x >= 0);
		const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
		const weekAgo = Date.now() - 7 * 864e5;
		return {
			total: tickets.length,
			open: tickets.filter((t) => t.status === 'Open').length,
			prog: tickets.filter((t) => t.status === 'In Progress').length,
			done: done.length,
			doneWeek: done.filter((t) => new Date(t.done_at as string).getTime() >= weekAgo).length,
			avg: durs.length ? fmt(avg) : '—'
		};
	});

	const series = $derived.by(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const rows: { key: string; created: number; done: number }[] = [];
		for (let i = 13; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			rows.push({ key: dayKey(d), created: 0, done: 0 });
		}
		const idx = new Map(rows.map((r, i) => [r.key, i]));
		for (const t of tickets) {
			const ci = idx.get(dayKey(t.created));
			if (ci !== undefined) rows[ci].created++;
			if (t.done_at) {
				const di = idx.get(dayKey(t.done_at));
				if (di !== undefined) rows[di].done++;
			}
		}
		const max = Math.max(1, ...rows.map((r) => Math.max(r.created, r.done)));
		return { rows, max };
	});

	const scoreboard = $derived.by(() => {
		const m = new Map<string, { name: string; count: number; total: number }>();
		for (const t of tickets) {
			if (t.status !== 'Done' || !t.done_at || !t.done_by) continue;
			const name =
				t.expand?.done_by?.name || t.expand?.done_by?.email?.split('@')[0] || 'someone';
			const dur = new Date(t.done_at).getTime() - new Date(t.created).getTime();
			const e = m.get(t.done_by) ?? { name, count: 0, total: 0 };
			e.count++;
			if (dur >= 0) e.total += dur;
			m.set(t.done_by, e);
		}
		return [...m.values()]
			.map((e) => ({ name: e.name, count: e.count, avg: e.count ? fmt(e.total / e.count) : '—' }))
			.sort((a, b) => b.count - a.count);
	});

	const recent = $derived(tickets.slice(0, 6));

	const services = $derived([
		{
			name: 'Tickets',
			icon: 'ticket',
			status: health === 'online' ? 'Online' : health === 'offline' ? 'Offline' : '…',
			tone: health === 'online' ? 'ok' : health === 'offline' ? 'bad' : 'idle'
		},
		{ name: 'Notifications', icon: 'bell', status: 'Ready', tone: 'idle' },
		{ name: 'Network', icon: 'activity', status: 'Planned', tone: 'plan' },
		{ name: 'Media', icon: 'media', status: 'Planned', tone: 'plan' },
		{ name: 'Host metrics', icon: 'server', status: 'Connect agent', tone: 'plan' }
	]);

	const statusColor: Record<string, string> = {
		Open: 'var(--violet)',
		'In Progress': 'var(--blue)',
		Waiting: 'var(--amber)',
		Done: 'var(--teal)',
		Backlog: 'var(--faint)'
	};
	const who = (u?: { name?: string; email?: string }) =>
		u?.name || u?.email?.split('@')[0] || '—';
</script>

<div class="head">
	<div>
		<h1>Overview</h1>
		<p class="sub">Welcome back{auth.user?.name ? `, ${auth.user.name}` : ''}.</p>
	</div>
	<span class="badge" class:off={health === 'offline'}>
		{health === 'online' ? 'All systems go' : health === 'offline' ? 'Backend offline' : 'Checking…'}
	</span>
</div>

<div class="tiles">
	<div class="tile"><div class="tile-num">{stats.total}</div><div class="tile-label">Total tickets</div></div>
	<div class="tile"><div class="tile-num" style="color:var(--violet)">{stats.open}</div><div class="tile-label">Open</div></div>
	<div class="tile"><div class="tile-num" style="color:var(--blue)">{stats.prog}</div><div class="tile-label">In progress</div></div>
	<div class="tile"><div class="tile-num" style="color:var(--teal)">{stats.doneWeek}</div><div class="tile-label">Done this week</div></div>
	<div class="tile"><div class="tile-num grad-text">{stats.avg}</div><div class="tile-label">Avg time to done</div></div>
</div>

<div class="panel chart-panel">
	<div class="panel-head">
		<span>Throughput · last 14 days</span>
		<span class="legend">
			<span class="lk"><i style="background:var(--violet)"></i>Filed</span>
			<span class="lk"><i style="background:var(--teal)"></i>Done</span>
		</span>
	</div>
	<div class="chart">
		{#each series.rows as r (r.key)}
			<div class="day" title="{r.key}: {r.created} filed, {r.done} done">
				<div class="bars">
					<div class="bar c" style="height:{(r.created / series.max) * 100}%"></div>
					<div class="bar d" style="height:{(r.done / series.max) * 100}%"></div>
				</div>
			</div>
		{/each}
	</div>
</div>

<div class="cols">
	<div class="panel">
		<div class="panel-head"><span>Modules</span></div>
		<div class="svc">
			{#each services as s (s.name)}
				<div class="svc-row">
					<span class="svc-ic svc-{s.tone}"><Icon name={s.icon} size={17} /></span>
					<span class="svc-name">{s.name}</span>
					<span class="svc-status svc-{s.tone}">{s.status}</span>
				</div>
			{/each}
		</div>
	</div>

	<div class="panel">
		<div class="panel-head"><span><Icon name="trophy" size={15} /> Scoreboard</span></div>
		{#if scoreboard.length === 0}
			<p class="empty">No completed tickets yet.</p>
		{:else}
			<div class="score">
				{#each scoreboard as p, i (p.name)}
					<div class="score-row">
						<span class="rank">{i + 1}</span>
						<span class="score-name">{p.name}</span>
						<span class="score-count">{p.count} done</span>
						<span class="score-avg">avg {p.avg}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<div class="panel">
	<div class="panel-head"><span>Recent activity</span></div>
	{#if loading}
		<p class="empty">Loading…</p>
	{:else if recent.length === 0}
		<p class="empty">Nothing filed yet — head to Tickets to add the first one.</p>
	{:else}
		<div class="recent">
			{#each recent as t (t.id)}
				<div class="rec-row">
					<span class="rec-dot" style="background:{statusColor[t.status]}"></span>
					<span class="rec-title">{t.title}</span>
					<span class="rec-status">{t.status}</span>
					<span class="rec-who">{who(t.expand?.assignee)}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		letter-spacing: -0.3px;
	}
	.sub {
		margin: 0.2rem 0 0;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.badge.off {
		color: var(--red);
		background: rgba(251, 113, 133, 0.12);
		border-color: rgba(251, 113, 133, 0.25);
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.1rem;
	}
	.panel {
		padding: 1rem 1.15rem;
		margin-bottom: 1.1rem;
	}
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.86rem;
		color: var(--ink);
		margin-bottom: 0.9rem;
	}
	.panel-head span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.legend {
		display: flex;
		gap: 0.85rem;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.lk {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.lk i {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		display: inline-block;
	}
	.chart {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 120px;
	}
	.day {
		flex: 1;
		height: 100%;
		display: flex;
		align-items: flex-end;
	}
	.bars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		width: 100%;
		height: 100%;
	}
	.bar {
		flex: 1;
		min-height: 2px;
		border-radius: 3px 3px 0 0;
	}
	.bar.c {
		background: var(--violet);
		box-shadow: 0 0 8px rgba(167, 139, 250, 0.4);
	}
	.bar.d {
		background: var(--teal);
		box-shadow: 0 0 8px rgba(45, 212, 191, 0.4);
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.1rem;
	}
	.cols .panel {
		margin-bottom: 0;
	}
	.svc,
	.score,
	.recent {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.svc-row,
	.rec-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.86rem;
	}
	.svc-ic {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: rgba(167, 139, 250, 0.1);
		color: var(--violet);
	}
	.svc-name {
		flex: 1;
	}
	.svc-status {
		font-size: 0.74rem;
		font-weight: 500;
		padding: 0.12rem 0.5rem;
		border-radius: 999px;
	}
	.svc-ok {
		color: var(--teal);
	}
	.svc-status.svc-ok {
		background: rgba(45, 212, 191, 0.14);
	}
	.svc-bad {
		color: var(--red);
	}
	.svc-status.svc-bad {
		background: rgba(251, 113, 133, 0.14);
	}
	.svc-status.svc-idle {
		color: var(--muted);
		background: rgba(167, 139, 250, 0.1);
	}
	.svc-status.svc-plan {
		color: var(--faint);
		background: rgba(255, 255, 255, 0.04);
	}
	.score-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.86rem;
	}
	.rank {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.72rem;
		font-weight: 600;
		color: #fff;
		background: var(--grad);
	}
	.score-name {
		flex: 1;
	}
	.score-count {
		color: var(--teal);
	}
	.score-avg {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.rec-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
	}
	.rec-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rec-status {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.rec-who {
		color: var(--faint);
		font-size: 0.78rem;
		min-width: 4ch;
		text-align: right;
	}
	.empty {
		color: var(--faint);
		margin: 0.25rem 0;
	}

	@media (max-width: 900px) {
		.tiles {
			grid-template-columns: repeat(2, 1fr);
		}
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
