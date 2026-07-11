<script lang="ts">
	import { pb } from '$lib/pb';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await pb.collection('users').authWithPassword(email, password);
			goto('/');
		} catch {
			error = 'Incorrect email or password.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="wrap">
	<form class="card" onsubmit={submit}>
		<div class="brand"><span class="logo">🏠</span> HouseOS</div>
		<p class="sub">Household platform · sign in</p>
		<input class="field" type="email" placeholder="Email" bind:value={email} autocomplete="username" required />
		<input
			class="field"
			type="password"
			placeholder="Password"
			bind:value={password}
			autocomplete="current-password"
			required
		/>
		{#if error}<p class="error">{error}</p>{/if}
		<button class="btn btn-accent submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
	</form>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}
	.card {
		width: 100%;
		max-width: 360px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.75rem;
		box-shadow: var(--shadow);
	}
	.brand {
		font-size: 1.4rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.sub {
		margin: 0 0 0.5rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.submit {
		margin-top: 0.25rem;
		padding: 0.7rem;
	}
	.error {
		color: var(--p1);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
