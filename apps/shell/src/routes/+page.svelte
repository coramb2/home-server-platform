<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { BOARD, PRIORITIES, type Ticket, type Status } from '$lib/types';

	let tickets = $state<Ticket[]>([]);
	let loading = $state(true);
	let error = $state('');
	let quickTitle = $state('');
	let adding = $state(false);

	async function load() {
		try {
			tickets = await pb.collection('tickets').getFullList<Ticket>({
				sort: '-created',
				expand: 'assignee,done_by'
			});
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

	async function quickAdd(e: SubmitEvent) {
		e.preventDefault();
		const title = quickTitle.trim();
		if (!title || adding) return;
		adding = true;
		try {
			await pb.collection('tickets').create({
				title,
				status: 'Open',
				created_by: auth.user?.id
			});
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
		// optimistic
		Object.assign(ticket, patch);
		tickets = tickets;
		try {
			await pb.collection('tickets').update(ticket.id, patch);
		} catch (e) {
			error = (e as Error).message;
			load();
		}
	}

	function byStatus(s: Status) {
		return tickets.filter((t) => t.status === s);
	}

	function who(u?: { name?: string; email?: string }) {
		return u?.name || u?.email?.split('@')[0] || '—';
	}

	function duration(from: string, to: string) {
		const ms = new Date(to).getTime() - new Date(from).getTime();
		if (!isFinite(ms) || ms < 0) return '';
		const m = Math.round(ms / 60000);
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 6) / 10;
		if (h < 48) return `${h}h`;
		return `${Math.round(h / 24)}d`;
	}
</script>

<div class="board-head">
	<h1>Household board</h1>
	<form class="quick" onsubmit={quickAdd}>
		<input
			class="field"
			placeholder="Quick add a ticket… (just a title)"
			bind:value={quickTitle}
			maxlength="200"
			aria-label="New ticket title"
		/>
		<button class="btn btn-accent" disabled={adding || !quickTitle.trim()}>Add</button>
	</form>
</div>

{#if error}
	<p class="error">{error}</p>
{/if}

{#if loading}
	<p class="muted">Loading…</p>
{:else}
	<div class="columns">
		{#each BOARD as col (col)}
			{@const items = byStatus(col)}
			<section class="column">
				<header class="col-head">
					<span>{col}</span>
					<span class="count">{items.length}</span>
				</header>
				<div class="cards">
					{#each items as t (t.id)}
						<article class="card" class:done={t.status === 'Done'}>
							<div class="card-top">
								{#if t.priority}
									<span class="pri pri-{t.priority}">{t.priority}</span>
								{/if}
								<span class="title">{t.title}</span>
							</div>
							<div class="meta">
								{#if t.category}<span class="chip">{t.category}</span>{/if}
								<span class="assignee">{who(t.expand?.assignee)}</span>
								{#if t.status === 'Done' && t.done_at}
									<span class="ttd" title="Time from filed to done">
										⏱ {duration(t.created, t.done_at)} · {who(t.expand?.done_by)}
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
									<button class="btn done-btn" onclick={() => setStatus(t, 'Done')}>✓ Done</button>
								{/if}
							</div>
						</article>
					{/each}
					{#if items.length === 0}
						<p class="empty">—</p>
					{/if}
				</div>
			</section>
		{/each}
	</div>
{/if}

<style>
	.board-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	h1 {
		font-size: 1.3rem;
		margin: 0;
	}
	.quick {
		display: flex;
		gap: 0.5rem;
		flex: 1;
		min-width: 260px;
	}
	.error {
		color: var(--p1);
		background: rgba(255, 107, 107, 0.1);
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
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		min-height: 120px;
	}
	.col-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 700;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted);
		margin-bottom: 0.75rem;
	}
	.count {
		background: var(--surface-3);
		color: var(--text);
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
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.7rem;
		box-shadow: var(--shadow);
	}
	.card.done {
		opacity: 0.72;
	}
	.card-top {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.title {
		font-weight: 600;
		line-height: 1.3;
	}
	.card.done .title {
		text-decoration: line-through;
		text-decoration-color: var(--faint);
	}
	.pri {
		flex: none;
		font-size: 0.68rem;
		font-weight: 800;
		padding: 0.1rem 0.35rem;
		border-radius: 5px;
		color: #0f1117;
	}
	.pri-P1 {
		background: var(--p1);
	}
	.pri-P2 {
		background: var(--p2);
	}
	.pri-P3 {
		background: var(--p3);
	}
	.pri-P4 {
		background: var(--p4);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.55rem;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.chip {
		background: var(--surface-3);
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
	}
	.ttd {
		color: var(--p4);
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.7rem;
	}
	.status-select {
		flex: 1;
		padding: 0.35rem 0.4rem;
		background: var(--surface-3);
		border: 1px solid var(--border);
		border-radius: 7px;
		font-size: 0.8rem;
	}
	.done-btn {
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--border);
	}
	.done-btn:hover {
		background: var(--surface-3);
	}
	.empty {
		color: var(--faint);
		text-align: center;
		margin: 0.5rem 0;
	}

	@media (max-width: 820px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
