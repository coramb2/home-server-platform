<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import Icon from '$lib/Icon.svelte';
	import { CATEGORIES, PRIORITIES, type RecurringTask, type UserRec } from '$lib/types';

	let rules = $state<RecurringTask[]>([]);
	let users = $state<UserRec[]>([]);
	let error = $state('');
	let saving = $state(false);

	// new-rule form
	let title = $state('');
	let interval = $state(90);
	let firstDue = $state(new Date().toISOString().slice(0, 10));
	let category = $state('');
	let priority = $state('');
	let assignee = $state('');

	async function load() {
		try {
			rules = await pb
				.collection('recurring_tasks')
				.getFullList<RecurringTask>({ sort: 'next_due', expand: 'assignee' });
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	$effect(() => {
		load();
		pb.collection('users')
			.getFullList<UserRec>()
			.then((u) => (users = u))
			.catch(() => {});
	});

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t || saving) return;
		saving = true;
		try {
			await pb.collection('recurring_tasks').create({
				title: t,
				interval_days: Math.max(1, Math.round(interval)),
				next_due: firstDue,
				active: true,
				category,
				priority,
				assignee: assignee || null
			});
			title = '';
			await load();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	async function toggle(r: RecurringTask) {
		r.active = !r.active;
		try {
			await pb.collection('recurring_tasks').update(r.id, { active: r.active });
		} catch (e) {
			error = (e as Error).message;
			load();
		}
	}
	async function remove(id: string) {
		try {
			await pb.collection('recurring_tasks').delete(id);
			await load();
		} catch (e) {
			error = (e as Error).message;
		}
	}

	const who = (u?: UserRec) => u?.name || u?.email?.split('@')[0] || 'anyone';
	const fmtDate = (s?: string) =>
		s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
	function every(days: number) {
		if (days % 365 === 0) return `every ${days / 365}y`;
		if (days % 30 === 0) return `every ${days / 30}mo`;
		if (days % 7 === 0) return `every ${days / 7}wk`;
		return `every ${days}d`;
	}
</script>

<a class="back" href="/tickets"><Icon name="ticket" size={15} /> Board</a>

<div class="head">
	<div>
		<h1><Icon name="refresh" size={20} /> Recurring tasks</h1>
		<p class="sub">Templates that auto-file a ticket on schedule — HVAC filter, batteries, the restore drill.</p>
	</div>
</div>

{#if error}<p class="error">{error}</p>{/if}

<form class="panel newrule" onsubmit={add}>
	<input class="field grow" placeholder="Task title (e.g. Replace HVAC filter)" bind:value={title} maxlength="200" />
	<label class="mini">Every
		<input class="field num" type="number" min="1" bind:value={interval} /> days
	</label>
	<label class="mini">First due
		<input class="field" type="date" bind:value={firstDue} />
	</label>
	<select class="field sel" bind:value={category}>
		<option value="">category…</option>
		{#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
	</select>
	<select class="field sel" bind:value={priority}>
		<option value="">priority…</option>
		{#each PRIORITIES as p (p)}<option value={p}>{p}</option>{/each}
	</select>
	<select class="field sel" bind:value={assignee}>
		<option value="">unassigned</option>
		{#each users as u (u.id)}<option value={u.id}>{who(u)}</option>{/each}
	</select>
	<button class="btn btn-accent" disabled={saving || !title.trim()}><Icon name="plus" size={16} /> Add</button>
</form>

<div class="list">
	{#each rules as r (r.id)}
		<div class="rule panel" class:paused={!r.active}>
			<button class="toggle" class:on={r.active} onclick={() => toggle(r)} aria-label={r.active ? 'Pause' : 'Resume'} title={r.active ? 'Active' : 'Paused'}></button>
			<div class="info">
				<span class="rt">{r.title}</span>
				<span class="meta">{every(r.interval_days)} · next {fmtDate(r.next_due)} · {who(r.expand?.assignee)}{#if r.priority} · {r.priority}{/if}{#if r.category} · {r.category}{/if}</span>
			</div>
			<button class="del" onclick={() => remove(r.id)} aria-label="Delete"><Icon name="x" size={16} /></button>
		</div>
	{/each}
	{#if rules.length === 0}
		<p class="empty">No recurring tasks yet. Add one above — it'll file itself on schedule.</p>
	{/if}
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		font-size: 0.88rem;
		margin-bottom: 1rem;
	}
	.back:hover {
		color: var(--ink);
	}
	.head {
		margin-bottom: 1.1rem;
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
		font-size: 0.9rem;
	}
	.error {
		color: var(--red);
		background: rgba(251, 113, 133, 0.1);
		border: 1px solid rgba(251, 113, 133, 0.25);
		padding: 0.6rem 0.85rem;
		border-radius: var(--radius-sm);
	}
	.newrule {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.9rem 1rem;
		margin-bottom: 1.25rem;
	}
	.field {
		padding: 0.55rem 0.65rem;
		background: rgba(10, 12, 26, 0.6);
		border: 1px solid var(--line);
		border-radius: 9px;
		outline: none;
	}
	.field:focus {
		border-color: var(--violet);
	}
	.grow {
		flex: 1;
		min-width: 200px;
	}
	.num {
		width: 4.5rem;
	}
	.sel {
		color: var(--ink);
	}
	.mini {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.rule {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.75rem 0.9rem;
	}
	.rule.paused {
		opacity: 0.55;
	}
	.toggle {
		flex: none;
		width: 40px;
		height: 22px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid var(--line);
		position: relative;
		transition: background 0.15s ease;
	}
	.toggle::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--faint);
		transition: transform 0.15s ease, background 0.15s ease;
	}
	.toggle.on {
		background: var(--grad-soft);
		border-color: var(--line-strong);
	}
	.toggle.on::after {
		transform: translateX(18px);
		background: var(--violet);
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.rt {
		font-weight: 500;
		display: block;
	}
	.meta {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.del {
		flex: none;
		color: var(--faint);
		display: inline-flex;
	}
	.del:hover {
		color: var(--red);
	}
	.empty {
		color: var(--faint);
		text-align: center;
		margin: 1rem 0;
	}
</style>
