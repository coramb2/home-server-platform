<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { BOARD, type Ticket, type Status } from '$lib/types';
	import Icon from '$lib/Icon.svelte';

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

	async function load() {
		try {
			tickets = await pb
				.collection('tickets')
				.getFullList<Ticket>({ sort: '-created', expand: 'assignee,done_by' });
			error = '';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
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

	const stats = $derived.by(() => {
		const done = tickets.filter((t) => t.status === 'Done' && t.done_at);
		const durs = done
			.map((t) => new Date(t.done_at as string).getTime() - new Date(t.created).getTime())
			.filter((ms) => ms >= 0);
		const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
		return {
			open: tickets.filter((t) => t.status === 'Open').length,
			prog: tickets.filter((t) => t.status === 'In Progress').length,
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
			await pb.collection('tickets').create({ title, status: 'Open', created_by: auth.user?.id });
			quickTitle = '';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			adding = false;
		}
	}

	async function setStatus(ticket: Ticket, status: Status) {
		const patch: Partial<Ticket> = { status };
		if (status === 'Done') {
			patch.done_at = new Date().toISOString();
			patch.done_by = auth.user?.id;
		} else if (ticket.status === 'Done') {
			patch.done_at = '';
			patch.done_by = '';
		}
		Object.assign(ticket, patch);
		tickets = tickets;
		try {
			await pb.collection('tickets').update(ticket.id, patch);
		} catch (e) {
			error = (e as Error).message;
			load();
		}
	}

	const byStatus = (s: Status) => tickets.filter((t) => t.status === s);
	const who = (u?: { name?: string; email?: string }) =>
		u?.name || u?.email?.split('@')[0] || '—';
	const duration = (from: string, to: string) =>
		fmt(new Date(to).getTime() - new Date(from).getTime());
</script>

<div class="head">
	<div class="title">
		<h1>Household board</h1>
		<p class="sub">Two people, one source of truth. · <a href="/tickets/recurring">Recurring tasks</a></p>
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
	<div class="tile"><div class="tile-num" style="color:var(--violet)">{stats.open}</div><div class="tile-label">Open</div></div>
	<div class="tile"><div class="tile-num" style="color:var(--blue)">{stats.prog}</div><div class="tile-label">In progress</div></div>
	<div class="tile"><div class="tile-num" style="color:var(--teal)">{stats.done}</div><div class="tile-label">Done</div></div>
	<div class="tile">
		<div class="tile-num grad-text">{stats.avg}</div>
		<div class="tile-label">Avg time to done</div>
	</div>
</div>

{#if error}<p class="error">{error}</p>{/if}

{#if loading}
	<p class="muted">Loading…</p>
{:else}
	<div class="columns">
		{#each BOARD as col (col)}
			{@const items = byStatus(col)}
			<section class="column" style="--accent:{accent[col]}">
				<header class="col-head">
					<span class="dot"></span>
					<span class="col-name">{col}</span>
					<span class="count">{items.length}</span>
				</header>
				<div class="cards">
					{#each items as t (t.id)}
						<article class="card" class:done={t.status === 'Done'}>
							<div class="card-top">
								{#if t.priority}<span class="pri pri-{t.priority}">{t.priority}</span>{/if}
								<a class="ct-title" href="/tickets/{t.id}">{t.title}</a>
							</div>
							<div class="meta">
								{#if t.category}<span class="chip">{t.category}</span>{/if}
								<span class="assignee">{who(t.expand?.assignee)}</span>
								{#if t.status === 'Done' && t.done_at}
									<span class="ttd" title="Time from filed to done">
										<Icon name="clock" size={12} />
										{duration(t.created, t.done_at)} · {who(t.expand?.done_by)}
									</span>
								{/if}
							</div>
							<div class="actions">
								<select
									class="status-select"
									value={t.status}
									onchange={(e) => setStatus(t, e.currentTarget.value as Status)}
									aria-label="Change status"
								>
									{#each ['Backlog', 'Open', 'In Progress', 'Waiting', 'Done'] as s (s)}
										<option value={s}>{s}</option>
									{/each}
								</select>
								{#if t.status !== 'Done'}
									<button class="btn done-btn" onclick={() => setStatus(t, 'Done')} aria-label="Mark done">
										<Icon name="check" size={16} />
									</button>
								{/if}
							</div>
						</article>
					{/each}
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
		margin-bottom: 1.4rem;
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
	.ct-title:hover {
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
	.pri-P1 {
		background: var(--red);
		box-shadow: 0 0 10px rgba(251, 113, 133, 0.5);
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
	.ttd {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--teal);
	}
	.actions {
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
