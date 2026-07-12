<script lang="ts">
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/Icon.svelte';
	import {
		STATUSES,
		PRIORITIES,
		CATEGORIES,
		type Ticket,
		type Comment,
		type UserRec,
		type Status
	} from '$lib/types';

	const id = page.params.id as string;

	let ticket = $state<Ticket | null>(null);
	let comments = $state<Comment[]>([]);
	let users = $state<UserRec[]>([]);
	let error = $state('');
	let title = $state('');
	let description = $state('');
	let newComment = $state('');
	let posting = $state(false);
	let confirmDel = $state(false);

	async function loadTicket() {
		try {
			ticket = await pb
				.collection('tickets')
				.getOne<Ticket>(id, { expand: 'assignee,created_by,done_by' });
			title = ticket.title;
			description = ticket.description ?? '';
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
		pb.collection('users')
			.getFullList<UserRec>()
			.then((u) => (users = u))
			.catch(() => {});
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
			await pb.collection('tickets').update(id, data);
		} catch (e) {
			error = (e as Error).message;
			loadTicket();
		}
	}
	function setStatus(s: Status) {
		const d: Partial<Ticket> = { status: s };
		if (s === 'Done') {
			d.done_at = new Date().toISOString();
			d.done_by = auth.user?.id;
		} else if (ticket?.status === 'Done') {
			d.done_at = '';
			d.done_by = '';
		}
		patch(d);
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
			await pb.collection('comments').create({ ticket: id, author: auth.user?.id, body: b });
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

	const who = (u?: UserRec) => u?.name || u?.email?.split('@')[0] || '—';
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
		<label>Assignee
			<select value={ticket.assignee ?? ''} onchange={(e) => patch({ assignee: e.currentTarget.value })}>
				<option value="">Unassigned</option>
				{#each users as u (u.id)}<option value={u.id}>{who(u)}</option>{/each}
			</select>
		</label>
		<label>Due
			<input type="date" value={ticket.due_date ? ticket.due_date.slice(0, 10) : ''} onchange={(e) => patch({ due_date: e.currentTarget.value })} />
		</label>
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
