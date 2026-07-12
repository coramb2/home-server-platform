/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; url?: string; tag?: string } = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data?.text() };
	}
	const title = data.title ?? 'HouseOS';
	event.waitUntil(
		sw.registration.showNotification(title, {
			body: data.body ?? '',
			tag: data.tag,
			icon: '/icon.svg',
			badge: '/icon.svg',
			data: { url: data.url ?? '/' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data?.url as string) || '/';
	event.waitUntil(
		sw.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clients) => {
				const windows = clients as readonly WindowClient[];
				for (const c of windows) {
					c.navigate?.(url);
					return c.focus();
				}
				return sw.clients.openWindow(url);
			})
	);
});
