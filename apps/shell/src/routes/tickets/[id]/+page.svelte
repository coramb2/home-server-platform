<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/Icon.svelte';
	import { people, loadPeople } from '$lib/users.svelte';
	import { who, toPBDate, fmtDay, isUpcoming, repeats, previewNext } from '$lib/tickets';
	import {
		STATUSES,
		PRIORITIES,
		CATEGORIES,
		type Ticket,
		type Comment,
		type Status,
		type RepeatMode
	} from '$lib/types';

	const id = page.params.id as string;

	let ticket = $state<Ticket | null>(null);
	let comments = $state<Comment[]>([]);
	let error = $state('');
	let title = $state('');
	let description = $state('');
	let newComment = $state('');
	let posting = $state(false);
	let confirmDel = $state(false);
	let next = $state<Ticket | null>(null); // the occurrence this one filed, if any

	const EXPAND = 'assignee,created_by,done_by';

	async function loadTicket() {
		try {
			ticket = await pb
				.collection('tickets')
				.getOne<Ticket>(id, { expand: EXPAND });
			title = ticket.title;
			description = ticket.description ?? '';
			// Repeating + done: find the next one it filed (ext_key "repeat:<this id>").
			next =
				repeats(ticket) && ticket.status === 'Done'
					? await pb
							.collection('tickets')
							.getFirstListItem<Ticket>(pb.filter('ext_key = {:k}', { k: `repeat:${id}` }))
							.catch(() => null)
					: null;
		} catch (e) {
			error = (e as Error).message;
		}
	}
	async function loadComments() {
		comments = await pb.collection('comments').getFullList<Comment>({
			filter: pb.filter('ticket = {:t}', { t: id }),
			sort: 'created',
			expand: 'author'
		});
	}

	$effect(() => {
		loadTicket();
		loadComments();
		loadPeople();
		let c1: (() => void) | undefined;
		let c2: (() => void) | undefined;
		let t: ReturnType<typeof setTimeout>;
		pb.collection('comments')
			.subscribe('*', (e) => {
				if ((e.record as { ticket?: string }).ticket === id) loadComments();
			})
			.then((c) => (c1 = c));
		pb.collection('tickets')
			.subscribe(id, () => {
				clearTimeout(t);
				t = setTimeout(loadTicket, 120);
			})
			.then((c) => (c2 = c));
		return () => {
			c1?.();
			c2?.();
			clearTimeout(t);
		};
	});

	async function patch(data: Partial<Ticket>) {
		if (!ticket) return;
		Object.assign(ticket, data);
		try {
			// Use what the server saved: it owns stamps, show_from and series.
			const saved = await pb.collection('tickets').update<Ticket>(id, data, { expand: EXPAND });
			Object.assign(ticket, saved);
			error = '';
		} catch (e) {
			error = (e as Error).message;
			loadTicket();
		}
	}

	// ── assignees: tap a person to add/remove; "Everyone" = all of them ──
	const everyone = $derived(
		people.list.length > 0 && people.list.every((u) => ticket?.assignee.includes(u.id))
	);
	function toggleAssignee(uid: string) {
		if (!ticket) return;
		const list = ticket.assignee.includes(uid)
			? ticket.assignee.filter((x) => x !== uid)
			: [...ticket.assignee, uid];
		patch({ assignee: list });
	}
	function assignEveryone() {
		patch({ assignee: everyone ? [] : people.list.map((u) => u.id) });
	}

	// ── repeat ──
	const PRESETS = [
		{ days: 1, label: 'Daily' },
		{ days: 7, label: 'Weekly' },
		{ days: 14, label: 'Every 2 weeks' },
		{ days: 30, label: 'Monthly' },
		{ days: 90, label: 'Every 3 months' },
		{ days: 365, label: 'Yearly' }
	];
	function setRepeat(on: boolean) {
		patch(
			on
				? { repeat_days: 7, repeat_mode: ticket?.repeat_mode || 'fixed', remind_days: ticket?.remind_days ?? 0 }
				: { repeat_days: 0 }
		);
	}
	function setDays(v: number) {
		const n = Math.round(v);
		if (n >= 1 && n <= 3650) patch({ repeat_days: n });
	}
	function setRemind(v: number) {
		const n = Math.round(v);
		if (n >= 0 && n <= 365) patch({ remind_days: n });
	}
	function setStatus(s: Status) {
		patch({ status: s }); // server stamps done_at / done_by
    }
	function saveTitle() {
		const t = title.trim();
		if (t && ticket && t !== ticket.title) patch({ title: t });
	}
	function saveDesc() {
		if (ticket && description !== (ticket.description ?? '')) patch({ description });
	}

	async function addComment(e: SubmitEvent) {
		e.preventDefault();
		const b = newComment.trim();
		if (!b || posting) return;
		posting = true;
		try {
			await pb.collection('comments').create({ ticket: id, body: b });
			newComment = '';
		} catch (err) {
			error = (err as Error).message;
		} finally {
			posting = false;
		}
	}
	async function delComment(cid: string) {
		try {
			await pb.collection('comments').delete(cid);
		} catch {
			/* not mine / gone */
		}
	}
	async function uploadFiles(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (!files?.length) return;
		const fd = new FormData();
		for (const f of files) fd.append('attachments+', f);
		try {
			await pb.collection('tickets').update(id, fd);
		} catch (err) {
			error = (err as Error).message;
		}
	}
	async function del() {
		try {
			await pb.collection('tickets').delete(id);
			goto('/tickets');
		} catch (e) {
			error = (e as Error).message;
		}
	}

	const fmtDate = (s?: string) =>
		s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
	const fileUrl = (name: string) => (ticket ? pb.files.getURL(ticket, name) : '');
	const isImg = (n: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(n);
</script>

<a class="back" href="/tickets"><Icon name="ticket" size={15} /> Board</a>

{#if error}<p class="error">{error}</p>{/if}

{#if !ticket}
	<p class="muted">Loading…</p>
{:else}
	<input class="title-input" bind:value={title} onblur={saveTitle} maxlength="200" aria-label="Title" />
	{#if isUpcoming(ticket)}
		<p class="notice"><Icon name="clock" size={15} /> Scheduled — appears on the board {fmtDay(ticket.show_from)}, due {fmtDay(ticket.due_date)}.</p>
	{/if}
	{#if next}
		<p class="notice"><Icon name="refresh" size={15} /> Next one filed: <a href="/tickets/{next.id}">due {fmtDay(next.due_date)}</a></p>
	{/if}
	<p class="byline">
		Filed by {who(ticket.expand?.created_by)} · {fmtDate(ticket.created)}
		{#if ticket.status === 'Done' && ticket.done_at}
			· done by {who(ticket.expand?.done_by)} in
			{Math.max(0, Math.round((new Date(ticket.done_at).getTime() - new Date(ticket.created).getTime()) / 3600000))}h
		{/if}
	</p>

	<div class="fields panel">
		<label>Status
			<select value={ticket.status} onchange={(e) => setStatus(e.currentTarget.value as Status)}>
				{#each STATUSES as s (s)}<option value={s}>{s}</option>{/each}
			</select>
		</label>
		<label>Priority
			<select value={ticket.priority ?? ''} onchange={(e) => patch({ priority: e.currentTarget.value as Ticket['priority'] })}>
				<option value="">—</option>
				{#each PRIORITIES as p (p)}<option value={p}>{p}</option>{/each}
			</select>
		</label>
		<label>Category
			<select value={ticket.category ?? ''} onchange={(e) => patch({ category: e.currentTarget.value })}>
				<option value="">—</option>
				{#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
			</select>
		</label>
		<label>Due
			<input type="date" value={ticket.due_date ? ticket.due_date.slice(0, 10) : ''} onchange={(e) => patch({ due_date: toPBDate(e.currentTarget.value) })} />
		</label>
		<div class="assign" role="group" aria-label="Assignees">
			<span class="lbl">Assigned to</span>
			<div class="pills">
				{#each people.list as u (u.id)}
					{@const on = ticket.assignee.includes(u.id)}
					<button class="pill" class:on aria-pressed={on} onclick={() => toggleAssignee(u.id)}>
						{#if on}<Icon name="check" size={13} />{/if}{who(u)}
					</button>
				{/each}
				{#if people.list.length > 1}
					<button class="pill" class:on={everyone} aria-pressed={everyone} onclick={assignEveryone}>
						<Icon name="users" size={14} /> Everyone
					</button>
				{/if}
			</div>
		</div>
	</div>

	<div class="panel repeat">
		<label class="switch">
			<input type="checkbox" checked={repeats(ticket)} onchange={(e) => setRepeat(e.currentTarget.checked)} />
			<span class="track"></span>
			<span><Icon name="refresh" size={15} /> Repeats</span>
		</label>
		{#if repeats(ticket)}
			<div class="rep-fields">
				<label>Every
					<span class="inline">
						<input type="number" min="1" max="3650" value={ticket.repeat_days} onchange={(e) => setDays(+e.currentTarget.value)} />
						days
						<select value="" onchange={(e) => { setDays(+e.currentTarget.value); e.currentTarget.value = ''; }} aria-label="Preset">
							<option value="" disabled>preset…</option>
							{#each PRESETS as p (p.days)}<option value={p.days}>{p.label}</option>{/each}
						</select>
					</span>
				</label>
				<label>Schedule
					<select value={ticket.repeat_mode || 'fixed'} onchange={(e) => patch({ repeat_mode: e.currentTarget.value as RepeatMode })}>
						<option value="fixed">Fixed (from the due date)</option>
						<option value="after_completion">From when it's done</option>
					</select>
				</label>
				<label>Show early
					<span class="inline">
						<input type="number" min="0" max="365" value={ticket.remind_days ?? 0} onchange={(e) => setRemind(+e.currentTarget.value)} />
						days before due
					</span>
				</label>
			</div>
			{#if ticket.status !== 'Done'}
			<p class="rep-note">
				Mark it Done and the next one is filed for
				<b>{previewNext(ticket.repeat_days ?? 1, (ticket.repeat_mode || 'fixed') as RepeatMode, ticket.due_date)}</b>{#if ticket.remind_days}, showing up {ticket.remind_days}d early{/if}.
				{#if (ticket.repeat_mode || 'fixed') === 'fixed' && !ticket.due_date}<br />Tip: set a due date so the fixed schedule has a starting point.{/if}
			</p>
			{/if}
		{/if}
	</div>

	<div class="panel">
		<div class="panel-head">Description</div>
		<textarea class="desc" bind:value={description} onblur={saveDesc} rows="4" placeholder="Add details…"></textarea>
	</div>

	<div class="panel">
		<div class="panel-head">
			Attachments
			<label class="upload"><Icon name="plus" size={14} /> Add
				<input type="file" accept="image/*,application/pdf" multiple onchange={uploadFiles} hidden />
			</label>
		</div>
		{#if ticket.attachments && ticket.attachments.length}
			<div class="attachments">
				{#each ticket.attachments as name (name)}
					{#if isImg(name)}
						<a href={fileUrl(name)} target="_blank" rel="noreferrer"><img src={fileUrl(name)} alt={name} /></a>
					{:else}
						<a class="file" href={fileUrl(name)} target="_blank" rel="noreferrer"><Icon name="ticket" size={14} /> {name}</a>
					{/if}
				{/each}
			</div>
		{:else}
			<p class="muted small">No attachments.</p>
		{/if}
	</div>

	<div class="panel">
		<div class="panel-head">Comments <span class="count">{comments.length}</span></div>
		<div class="thread">
			{#each comments as c (c.id)}
				<div class="comment">
					<span class="avatar">{who(c.expand?.author).slice(0, 2).toUpperCase()}</span>
					<div class="c-body">
						<div class="c-head">
							<span class="c-author">{who(c.expand?.author)}</span>
							<span class="c-time">{fmtDate(c.created)}</span>
							{#if c.author === auth.user?.id}
								<button class="c-del" onclick={() => delComment(c.id)} aria-label="Delete comment"><Icon name="x" size={13} /></button>
							{/if}
						</div>
						<p class="c-text">{c.body}</p>
					</div>
				</div>
			{/each}
			{#if comments.length === 0}<p class="muted small">No comments yet — start the thread.</p>{/if}
		</div>
		<form class="add" onsubmit={addComment}>
			<textarea class="field" bind:value={newComment} rows="2" placeholder="Write a comment…" maxlength="5000"></textarea>
			<button class="btn btn-accent" disabled={posting || !newComment.trim()}>Comment</button>
		</form>
	</div>

	<div class="danger">
		{#if confirmDel}
			<span>Delete this ticket?</span>
			<button class="btn del-yes" onclick={del}>Yes, delete</button>
			<button class="btn" onclick={() => (confirmDel = false)}>Cancel</button>
		{:else}
			<button class="btn del" onclick={() => (confirmDel = true)}><Icon name="x" size={15} /> Delete ticket</button>
		{/if}
	</div>
{/if}

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
	.small {
		font-size: 0.85rem;
	}
	.title-input {
		width: 100%;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		padding: 0.3rem 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: -0.3px;
		margin: 0 0 0.25rem -0.5rem;
	}
	.title-input:hover {
		border-color: var(--line);
	}
	.title-input:focus {
		outline: none;
		border-color: var(--violet);
		background: rgba(10, 12, 26, 0.5);
	}
	.notice {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0 0 0.6rem;
		padding: 0.55rem 0.8rem;
		border-radius: var(--radius-sm);
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: var(--ink);
		font-size: 0.86rem;
	}
	.assign {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lbl,
	.rep-fields label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: rgba(10, 12, 26, 0.6);
		font-size: 0.88rem;
	}
	.pill:hover {
		border-color: var(--line-strong);
	}
	.pill.on {
		background: var(--grad);
		border-color: transparent;
		color: #fff;
	}
	.repeat {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		cursor: pointer;
		font-size: 0.9rem;
		width: fit-content;
	}
	.switch span:last-child {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.track {
		width: 36px;
		height: 20px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid var(--line);
		position: relative;
		transition: background 0.15s ease;
	}
	.track::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--muted);
		transition: transform 0.15s ease;
	}
	.switch input:checked + .track {
		background: var(--grad);
	}
	.switch input:checked + .track::after {
		transform: translateX(16px);
		background: #fff;
	}
	.switch input:focus-visible + .track {
		box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.35);
	}
	.rep-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
	}
	.rep-fields label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.inline {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		text-transform: none;
		letter-spacing: normal;
		font-size: 0.86rem;
		color: var(--muted);
	}
	.rep-fields input,
	.rep-fields select {
		padding: 0.5rem 0.55rem;
		background: rgba(10, 12, 26, 0.6);
		border: 1px solid var(--line);
		border-radius: 8px;
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: normal;
	}
	.rep-fields input[type='number'] {
		width: 5.5rem;
	}
	.rep-note {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.byline {
		margin: 0 0 1.25rem;
		color: var(--faint);
		font-size: 0.85rem;
	}
	.panel {
		padding: 1rem 1.15rem;
		margin-bottom: 1.1rem;
	}
	.panel-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.86rem;
		color: var(--ink);
		margin-bottom: 0.75rem;
	}
	.count {
		background: rgba(167, 139, 250, 0.14);
		border-radius: 999px;
		padding: 0 0.5rem;
		font-size: 0.75rem;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
	}
	.fields label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted);
	}
	.fields select,
	.fields input {
		padding: 0.5rem 0.55rem;
		background: rgba(10, 12, 26, 0.6);
		border: 1px solid var(--line);
		border-radius: 8px;
		font-size: 0.9rem;
		text-transform: none;
		letter-spacing: normal;
		color: var(--ink);
	}
	.desc {
		width: 100%;
		background: rgba(10, 12, 26, 0.6);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.85rem;
		resize: vertical;
		outline: none;
	}
	.desc:focus {
		border-color: var(--violet);
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: auto;
		font-size: 0.8rem;
		color: var(--violet);
		cursor: pointer;
	}
	.attachments {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.attachments img {
		width: 90px;
		height: 90px;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid var(--line);
	}
	.file {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
	}
	.thread {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin-bottom: 0.9rem;
	}
	.comment {
		display: flex;
		gap: 0.6rem;
	}
	.avatar {
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.68rem;
		font-weight: 600;
		color: #fff;
		background: var(--grad);
	}
	.c-body {
		flex: 1;
	}
	.c-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
	}
	.c-author {
		font-weight: 500;
	}
	.c-time {
		color: var(--faint);
	}
	.c-del {
		margin-left: auto;
		color: var(--faint);
		display: inline-flex;
	}
	.c-del:hover {
		color: var(--red);
	}
	.c-text {
		margin: 0.2rem 0 0;
		white-space: pre-wrap;
		line-height: 1.5;
	}
	.add {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}
	.add .field {
		resize: vertical;
	}
	.danger {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 1.5rem;
	}
	.del {
		color: var(--red);
		border-color: rgba(251, 113, 133, 0.3);
	}
	.del-yes {
		background: var(--red);
		color: #0b0f1e;
		font-weight: 600;
	}
</style>
