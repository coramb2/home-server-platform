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
	<form class="card panel" onsubmit={submit}>
		<div class="brand">
			<svg width="34" height="34" viewBox="0 0 512 512" aria-hidden="true">
				<defs>
					<linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stop-color="#8b5cf6" />
						<stop offset="1" stop-color="#ec4899" />
					</linearGradient>
				</defs>
				<rect width="512" height="512" rx="120" fill="rgba(20,20,44,0.9)" />
				<path d="M256 108 132 214v190h84V300h80v104h84V214z" fill="url(#lg)" />
				<circle cx="256" cy="250" r="30" fill="#0b0f1e" />
			</svg>
			<span>House<span class="grad-text">OS</span></span>
		</div>
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
		max-width: 370px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 2rem;
		box-shadow: var(--glow-violet);
	}
	.brand {
		font-size: 1.55rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.sub {
		margin: 0 0 0.5rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.submit {
		margin-top: 0.25rem;
		padding: 0.75rem;
	}
	.error {
		color: var(--red);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
