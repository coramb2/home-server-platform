<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth, logout } from '$lib/auth.svelte';
	import Icon from '$lib/Icon.svelte';
	import { enablePush, currentStatus, isSupported, type PushStatus } from '$lib/push';

	let { children } = $props();

	let pushStatus = $state<PushStatus>('default');
	let pushBusy = $state(false);

	const tabs = [
		{ href: '/', label: 'Dashboard', icon: 'home' },
		{ href: '/tickets', label: 'Tickets', icon: 'ticket' },
		{ href: '/network', label: 'Network', icon: 'activity' },
		{ href: '/media', label: 'Media', icon: 'media' }
	];

	$effect(() => {
		if (auth.user && isSupported()) currentStatus().then((s) => (pushStatus = s));
	});

	async function toggleAlerts() {
		if (!auth.user || pushBusy || pushStatus === 'subscribed') return;
		pushBusy = true;
		try {
			pushStatus = await enablePush(auth.user.id);
		} finally {
			pushBusy = false;
		}
	}

	const alertLabel = $derived(
		{
			subscribed: 'Alerts on',
			denied: 'Alerts blocked',
			unsupported: 'Alerts unavailable',
			error: 'Enable alerts',
			default: 'Enable alerts'
		}[pushStatus]
	);

	// Auth guard: bounce to /login when signed out (except on the login page).
	$effect(() => {
		if (!auth.user && page.url.pathname !== '/login') {
			goto('/login');
		}
	});

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	function initials(u: { name?: string; email?: string }) {
		return (u.name || u.email || '?').slice(0, 2).toUpperCase();
	}
</script>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else if auth.user}
	<div class="app">
		<header class="topbar">
			<a class="brand" href="/">
				<svg class="logo" width="26" height="26" viewBox="0 0 512 512" aria-hidden="true">
					<defs>
						<linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color="#8b5cf6" />
							<stop offset="1" stop-color="#ec4899" />
						</linearGradient>
					</defs>
					<rect width="512" height="512" rx="120" fill="rgba(20,20,44,0.9)" />
					<path d="M256 108 132 214v190h84V300h80v104h84V214z" fill="url(#hg)" />
					<circle cx="256" cy="250" r="30" fill="#0b0f1e" />
				</svg>
				<span class="name">House<span class="grad-text">OS</span></span>
			</a>
			<nav class="tabs">
				{#each tabs as tab (tab.href)}
					<a href={tab.href} class="tab" class:active={isActive(tab.href)}>
						<Icon name={tab.icon} size={17} />
						<span class="tab-label">{tab.label}</span>
					</a>
				{/each}
			</nav>
			<div class="user">
				{#if isSupported()}
					<button
						class="btn icon-btn alerts"
						class:on={pushStatus === 'subscribed'}
						onclick={toggleAlerts}
						disabled={pushBusy || pushStatus === 'subscribed' || pushStatus === 'denied'}
						aria-label={alertLabel}
						title={alertLabel}
					>
						<Icon name="bell" size={17} />
					</button>
				{/if}
				<span class="avatar" title={auth.user.email}>{initials(auth.user)}</span>
				<span class="who">{auth.user.name || auth.user.email}</span>
				<button class="btn icon-btn" onclick={logout} aria-label="Sign out" title="Sign out">
					<Icon name="logout" size={17} />
				</button>
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
		padding: 0.6rem max(1rem, env(safe-area-inset-left));
		padding-top: max(0.6rem, env(safe-area-inset-top));
		background: rgba(9, 11, 22, 0.72);
		backdrop-filter: blur(16px);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: var(--ink);
	}
	.name {
		font-size: 1.1rem;
		letter-spacing: 0.2px;
	}
	.tabs {
		display: flex;
		gap: 0.35rem;
		margin: 0 auto;
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.9rem;
		border-radius: 999px;
		color: var(--muted);
		font-weight: 500;
		border: 1px solid transparent;
		transition:
			background 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.tab:hover {
		color: var(--ink);
		background: rgba(167, 139, 250, 0.08);
	}
	.tab.active {
		color: var(--ink);
		background: var(--grad-soft);
		border-color: var(--line-strong);
		box-shadow: 0 0 18px rgba(139, 92, 246, 0.22);
	}
	.user {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.72rem;
		font-weight: 600;
		color: #fff;
		background: var(--grad);
	}
	.who {
		color: var(--muted);
		font-size: 0.9rem;
		max-width: 12ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.icon-btn {
		padding: 0.4rem;
	}
	.alerts.on {
		color: var(--violet);
		border-color: var(--line-strong);
		box-shadow: 0 0 14px rgba(139, 92, 246, 0.35);
	}
	.alerts:disabled {
		opacity: 0.85;
		cursor: default;
	}
	.content {
		flex: 1;
		width: 100%;
		max-width: 1240px;
		margin: 0 auto;
		padding: 1.25rem max(1rem, env(safe-area-inset-left)) 2.5rem;
	}

	@media (max-width: 640px) {
		.tab-label,
		.who {
			display: none;
		}
		.tabs {
			gap: 0.5rem;
		}
	}
</style>
