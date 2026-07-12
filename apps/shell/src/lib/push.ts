import { pb } from './pb';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushStatus = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'error';

export function isSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export async function currentStatus(): Promise<PushStatus> {
	if (!isSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	if (Notification.permission !== 'granted') return 'default';
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		return sub ? 'subscribed' : 'default';
	} catch {
		return 'error';
	}
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(b64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

/** Request permission, subscribe, and persist to PocketBase. Returns the new status. */
export async function enablePush(userId: string): Promise<PushStatus> {
	if (!isSupported()) return 'unsupported';
	if (!VAPID_PUBLIC) return 'error';

	const perm = await Notification.requestPermission();
	if (perm === 'denied') return 'denied';
	if (perm !== 'granted') return 'default';

	try {
		const reg = await navigator.serviceWorker.ready;
		let sub = await reg.pushManager.getSubscription();
		if (!sub) {
			sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
			});
		}
		const json = sub.toJSON();
		const keys = json.keys ?? {};
		try {
			await pb.collection('push_subscriptions').create({
				user: userId,
				endpoint: json.endpoint,
				p256dh: keys.p256dh,
				auth: keys.auth,
				ua: navigator.userAgent.slice(0, 400)
			});
		} catch (e) {
			// Unique-endpoint conflict = already registered; anything else re-throws.
			const status = (e as { status?: number }).status;
			if (status !== 400) throw e;
		}
		return 'subscribed';
	} catch {
		return 'error';
	}
}
