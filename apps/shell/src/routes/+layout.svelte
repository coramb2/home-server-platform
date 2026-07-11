<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth, logout } from '$lib/auth.svelte';

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Tickets', icon: '🎫' },
		{ href: '/network', label: 'Network', icon: '📡' },
		{ href: '/media', label: 'Media', icon: '🎬' }
	];

	// Auth guard: bounce to /login when signed out (except on the login page).
	$effect(() => {
		if (!auth.user && page.url.pathname !== '/login') {
			goto('/login');
		}
	});

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else if auth.user}
	<div class="app">
		<header class="topbar">
			<div class="brand">
				<span class="logo">🏠</span>
				<span class="name">HouseOS</span>
			</div>
			<nav class="tabs">
				{#each tabs as tab (tab.href)}
					<a href={tab.href} class="tab" class:active={isActive(tab.href)}>
						<span class="tab-icon">{tab.icon}</span>
						<span class="tab-label">{tab.label}</span>
					</a>
				{/each}
			</nav>
			<div class="user">
				<span class="who" title={auth.user.email}>{auth.user.name || auth.user.email}</span>
				<button class="btn logout" onclick={logout}>Sign out</button>
			</div>
		</header>
		<main class="content">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem max(1rem, env(safe-area-inset-left)) 0.6rem max(1rem, env(safe-area-inset-left));
		padding-top: max(0.6rem, env(safe-area-inset-top));
		background: rgba(15, 17, 23, 0.85);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.2px;
	}
	.logo {
		font-size: 1.25rem;
	}
	.name {
		font-size: 1.05rem;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		margin: 0 auto;
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		color: var(--muted);
		font-weight: 600;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.tab:hover {
		color: var(--text);
		background: var(--surface-2);
	}
	.tab.active {
		color: var(--text);
		background: var(--surface-3);
	}
	.user {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.who {
		color: var(--muted);
		font-size: 0.9rem;
		max-width: 12ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.logout {
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
	}
	.content {
		flex: 1;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 1rem max(1rem, env(safe-area-inset-left)) 2rem;
	}

	@media (max-width: 640px) {
		.tab-label {
			display: none;
		}
		.who {
			display: none;
		}
		.name {
			display: none;
		}
		.tabs {
			gap: 0.5rem;
		}
	}
</style>
