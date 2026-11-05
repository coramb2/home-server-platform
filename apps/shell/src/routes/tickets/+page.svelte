<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/Icon.svelte';
	import { people, loadPeople } from '$lib/users.svelte';
	import { BOARD, STATUSES, PRIORITY_CLASS, type Ticket, type Status } from '$lib/types';
	import {
		who,
		initials,
		assigneeLabel,
		isUpcoming,
		repeats,
		dueChip,
		every,
		fmtDay
	} from '$lib/tickets';

	let tickets = $state<Ticket[]>([]);
	let loading = $state(true);
	let error = $state('');
	let quickTitle = $state('');
	let adding = $state(false);

	const accent: Record<Status, string> = {
		Backlog: 'var(--faint)',
		Open: 'var(--violet)',
		'In Progress': 'var(--blue)',
		Waiting: 'var(--amber)',
		Done: 'var(--teal)'
	};

	const EXPAND = 'assignee,done_by';

	async function load() {
		try {
			tickets = await pb
				.collection('tickets')
				.getFullList<Ticket>({ sort: '-created', expand: EXPAND });
			error = '';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
		loadPeople();
		let cancel: (() => void) | undefined;
		let t: ReturnType<typeof setTimeout>;
		pb.collection('tickets')
			.subscribe('*', () => {
				clearTimeout(t);
				t = setTimeout(load, 120);
			})
			.then((c) => (cancel = c));
		return () => {
			clearTimeout(t);
			cancel?.();
		};
	});

	function fmt(ms: number) {
		if (!isFinite(ms) || ms < 0) return '';
		const m = Math.round(ms / 60000);
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 6) / 10;
		if (h < 48) return `${h}h`;
		return `${Math.round(h / 24)}d`;
	}

	// Security tickets (auto-filed by the alert bridge) live on the Network tab.
	// Upcoming = a repeating ticket waiting for its reminder window.
	const household = $derived(tickets.filter((t) => t.category !== 'security'));
	const onBoard = $derived(household.filter((t) => !isUpcoming(t)));
	const upcoming = $derived(
		household
			.filter((t) => isUpcoming(t) && t.status !== 'Backlog' && t.status !== 'Done')
			.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
	);

	// ── filter: lives in the URL (?f=…) so the dashboard can link to it ──
	type View = { key: string; label: string; count?: number };
	const me = $derived(auth.user?.id ?? '');
	const views = $derived<View[]>([
		{ key: '', label: 'All' },
		{ key: 'mine', label: 'Mine', count: onBoard.filter((t) => t.status !== 'Done' && t.assignee.includes(me)).length },
		...BOARD.map((s) => ({ key: s, label: s, count: onBoard.filter((t) => t.status === s).length })),
		{ key: 'repeating', label: 'Repeating', count: household.filter((t) => repeats(t) && t.status !== 'Done').length },
		{ key: 'upcoming', label: 'Upcoming', count: upcoming.length },
		{ key: 'Backlog', label: 'Backlog', count: onBoard.filter((t) => t.status === 'Backlog').length }
	]);
	const f = $derived(page.url.searchParams.get('f') ?? '');

	function setFilter(key: string) {
		const url = new URL(page.url);
		if (key) url.searchParams.set('f', key);
		else url.searchParams.delete('f');
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// What the columns show for the current filter.
	const shown = $derived.by(() => {
		if (f === 'mine') return onBoard.filter((t) => t.assignee.includes(me));
		if (f === 'repeating') return household.filter((t) => repeats(t) && !isUpcoming(t));
		return onBoard;
	});
	// A status filter (or Backlog) shows just that one column; otherwise the full board.
	const columns = $derived<Status[]>(
		(STATUSES as string[]).includes(f) ? [f as Status] : BOARD
	);
	const byStatus = (s: Status) => shown.filter((t) => t.status === s);

	const stats = $derived.by(() => {
		const done = onBoard.filter((t) => t.status === 'Done' && t.done_at);
		const durs = done
			.map((t) => new Date(t.done_at as string).getTime() - new Date(t.created).getTime())
			.filter((ms) => ms >= 0);
		const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
		return {
			open: onBoard.filter((t) => t.status === 'Open').length,
			prog: onBoard.filter((t) => t.status === 'In Progress').length,
			done: done.length,
			avg: durs.length ? fmt(avg) : '—'
		};
	});

	async function quickAdd(e: SubmitEvent) {
		e.preventDefault();
		const title = quickTitle.trim();
		if (!title || adding) return;
		adding = true;
		try {
			// Filed from "Mine"? Assign it to me.
			const assignee = f === 'mine' && me ? [me] : [];
			await pb.collection('tickets').create({ title, status: 'Open', assignee });
			quickTitle = '';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			adding = false;
		}
	}

	async function setStatus(ticket: Ticket, status: Status) {
		ticket.status = status; // show the move right away
		try {
			// The server stamps done_at / done_by (and files the next repeat); use what it saved.
			const saved = await pb
				.collection('tickets')
				.update<Ticket>(ticket.id, { status }, { expand: EXPAND });
			Object.assign(ticket, saved);
		} catch (e) {
			error = (e as Error).message;
			load();
		}
	}

	const duration = (from: string, to: string) =>
		fmt(new Date(to).getTime() - new Date(from).getTime());
</script>

<div class="head">
	<div class="title">
		<h1>Household board</h1>
		<p class="sub">Two people, one source of truth.</p>
	</div>
	<form class="quick" onsubmit={quickAdd}>
		<input
			class="field"
			placeholder="Quick add a ticket… (just a title)"
			bind:value={quickTitle}
			maxlength="200"
			aria-label="New ticket title"
		/>
		<button class="btn btn-accent" disabled={adding || !quickTitle.trim()}>
			<Icon name="plus" size={17} /> Add
		</button>
	</form>
</div>

<div class="stats">
	<button class="tile" class:sel={f === 'Open'} onclick={() => setFilter('Open')}><div class="tile-num" style="color:var(--violet)">{stats.open}</div><div class="tile-label">Open</div></button>
	<button class="tile" class:sel={f === 'In Progress'} onclick={() => setFilter('In Progress')}><div class="tile-num" style="color:var(--blue)">{stats.prog}</div><div class="tile-label">In progress</div></button>
	<button class="tile" class:sel={f === 'Done'} onclick={() => setFilter('Done')}><div class="tile-num" style="color:var(--teal)">{stats.done}</div><div class="tile-label">Done</div></button>
	<div class="tile">
		<div class="tile-num grad-text">{stats.avg}</div>
		<div class="tile-label">Avg time to done</div>
	</div>
</div>

<nav class="filters" aria-label="Filter tickets">
	{#each views as v (v.key)}
		<button class="fchip" class:on={f === v.key} aria-pressed={f === v.key} onclick={() => setFilter(v.key)}>
			{v.label}{#if v.count !== undefined}<span class="fcount">{v.count}</span>{/if}
		</button>
	{/each}
</nav>

{#if error}<p class="error">{error}</p>{/if}

{#snippet card(t: Ticket)}
	{@const due = dueChip(t)}
	<article class="card" class:done={t.status === 'Done'}>
		<div class="card-top">
			{#if t.priority}<span class="pri pri-{PRIORITY_CLASS[t.priority]}">{t.priority}</span>{/if}
			<!-- The title link stretches over the whole card (see .ct-title::after),
			     so a tap anywhere opens the ticket. -->
			<a class="ct-title" href="/tickets/{t.id}">{t.title}</a>
		</div>
		<div class="meta">
			{#if t.category}<span class="chip">{t.category}</span>{/if}
			{#if repeats(t)}<span class="chip rep" title="Repeats"><Icon name="refresh" size={11} /> {every(t.repeat_days)}</span>{/if}
			{#if due}<span class="due due-{due.tone}">{due.text}</span>{/if}
			{#if isUpcoming(t)}<span class="due due-later">appears {fmtDay(t.show_from)}</span>{/if}
			<span class="people" title={assigneeLabel(t, people.list)}>
				{#each t.expand?.assignee ?? [] as u (u.id)}<span class="av">{initials(u)}</span>{/each}
				{#if !t.assignee.length}<span class="unassigned">—</span>{/if}
			</span>
			{#if t.status === 'Done' && t.done_at}
				<span class="ttd" title="Time from filed to done">
					<Icon name="clock" size={12} />
					{duration(t.created, t.done_at)} · {who(t.expand?.done_by)}
				</span>
			{/if}
		</div>
		{#if !isUpcoming(t)}
			<div class="actions">
				<select
					class="status-select"
					value={t.status}
					onchange={(e) => setStatus(t, e.currentTarget.value as Status)}
					aria-label="Change status"
				>
					{#each STATUSES as s (s)}
						<option value={s}>{s}</option>
					{/each}
				</select>
				{#if t.status !== 'Done'}
					<button class="btn done-btn" onclick={() => setStatus(t, 'Done')} aria-label="Mark done">
						<Icon name="check" size={16} />
					</button>
				{/if}
			</div>
		{/if}
	</article>
{/snippet}

{#if loading}
	<p class="muted">Loading…</p>
{:else if f === 'upcoming'}
	<p class="hint">Repeating tickets waiting for their reminder window. They move onto the board by themselves.</p>
	<div class="grid">
		{#each upcoming as t (t.id)}{@render card(t)}{/each}
	</div>
	{#if upcoming.length === 0}<p class="empty">Nothing scheduled.</p>{/if}
{:else}
	<div class="columns" class:single={columns.length === 1}>
		{#each columns as col (col)}
			{@const items = byStatus(col)}
			<section class="column" style="--accent:{accent[col]}">
				<header class="col-head">
					<span class="dot"></span>
					<span class="col-name">{col}</span>
					<span class="count">{items.length}</span>
				</header>
				<div class="cards">
					{#each items as t (t.id)}{@render card(t)}{/each}
					{#if items.length === 0}<p class="empty">—</p>{/if}
				</div>
			</section>
		{/each}
	</div>
{/if}
<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem;
		margin-bottom: 1.1rem;
	}
	.title h1 {
		font-size: 1.4rem;
		margin: 0;
		letter-spacing: -0.3px;
	}
	.sub {
		margin: 0.15rem 0 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.quick {
		display: flex;
		gap: 0.5rem;
		flex: 1;
		min-width: 260px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	button.tile {
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}
	button.tile:hover,
	button.tile.sel {
		border-color: var(--line-strong);
	}
	button.tile.sel {
		box-shadow: var(--glow-violet);
	}
	.filters {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding-bottom: 0.3rem;
		margin-bottom: 1rem;
		scrollbar-width: none;
	}
	.fchip {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.03);
		color: var(--muted);
		font-size: 0.82rem;
	}
	.fchip:hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.fchip.on {
		color: #fff;
		background: var(--grad);
		border-color: transparent;
	}
	.fcount {
		font-size: 0.7rem;
		opacity: 0.75;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 0.8rem;
	}
	.grid,
	.single .cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.6rem;
	}
	.columns.single {
		grid-template-columns: 1fr;
	}
	.error {
		color: var(--red);
		background: rgba(251, 113, 133, 0.1);
		border: 1px solid rgba(251, 113, 133, 0.25);
		padding: 0.6rem 0.85rem;
		border-radius: var(--radius-sm);
	}
	.muted {
		color: var(--muted);
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(4, minmax(220px, 1fr));
		gap: 0.9rem;
	}
	.column {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.8rem;
		min-height: 130px;
		backdrop-filter: blur(10px);
		position: relative;
	}
	.column::before {
		content: '';
		position: absolute;
		top: 0;
		left: 14px;
		right: 14px;
		height: 2px;
		background: var(--accent);
		opacity: 0.65;
		border-radius: 2px;
		box-shadow: 0 0 12px var(--accent);
	}
	.col-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.82rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted);
		margin-bottom: 0.8rem;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent);
	}
	.col-name {
		color: var(--ink);
	}
	.count {
		margin-left: auto;
		background: rgba(167, 139, 250, 0.14);
		color: var(--ink);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-size: 0.75rem;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.card {
		position: relative; /* anchor for the stretched title link */
		cursor: pointer;
		background: var(--panel-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0.75rem;
		transition:
			border-color 0.15s ease,
			transform 0.08s ease;
	}
	.card:hover {
		border-color: var(--line-strong);
		transform: translateY(-1px);
	}
	.card.done {
		opacity: 0.62;
	}
	.card-top {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.ct-title {
		font-weight: 500;
		line-height: 1.3;
		color: var(--ink);
	}
	/* Stretched link: the title's invisible ::after covers the whole card,
	   so tapping anywhere opens it — while it's still a real link
	   (keyboard, long-press, open in new tab all work). */
	.ct-title::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.ct-title:focus-visible {
		outline: none;
	}
	.card:has(.ct-title:focus-visible) {
		border-color: var(--violet);
		box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.22);
	}
	.card:hover .ct-title {
		color: var(--violet);
	}
	.card.done .ct-title {
		text-decoration: line-through;
		text-decoration-color: var(--faint);
	}
	.pri {
		flex: none;
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0.1rem 0.36rem;
		border-radius: 5px;
		color: #0b0f1e;
	}
	.pri-asap {
   	background: var(--red);
   	box-shadow: 0 0 10px rgba(251, 113, 133, 0.5);
   }
   .pri-sooner {
   	background: var(--amber);
   }
   .pri-floating {
   	background: var(--teal);
   }
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.6rem;
		font-size: 0.76rem;
		color: var(--muted);
	}
	.chip {
		background: rgba(167, 139, 250, 0.12);
		color: var(--violet);
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
	}
	.rep {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		background: rgba(96, 165, 250, 0.12);
		color: var(--blue);
	}
	.due {
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
	}
	.due-over {
		color: var(--red);
		background: rgba(251, 113, 133, 0.14);
	}
	.due-today {
		color: var(--amber);
		background: rgba(251, 191, 36, 0.14);
	}
	.due-soon {
		color: var(--amber);
	}
	.people {
		display: inline-flex;
		margin-left: auto;
	}
	.av {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.6rem;
		font-weight: 600;
		color: #fff;
		background: var(--grad);
		border: 2px solid var(--bg-1);
	}
	.av + .av {
		margin-left: -6px;
	}
	.unassigned {
		color: var(--faint);
	}
	.ttd {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--teal);
	}
	.actions {
		position: relative; /* sits above the stretched link, so these still work */
		z-index: 1;
		display: flex;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}
	.status-select {
		flex: 1;
		padding: 0.4rem 0.45rem;
		background: rgba(10, 12, 26, 0.6);
		border: 1px solid var(--line);
		border-radius: 8px;
		font-size: 0.8rem;
	}
	.done-btn {
		padding: 0.4rem 0.55rem;
	}
	.empty {
		color: var(--faint);
		text-align: center;
		margin: 0.4rem 0;
	}

	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 820px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
