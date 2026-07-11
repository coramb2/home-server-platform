import { pb } from './pb';
import type { UserRec } from './types';

// Reactive mirror of PocketBase's auth state.
export const auth = $state<{ user: UserRec | null }>({
	user: (pb.authStore.record as UserRec) ?? null
});

pb.authStore.onChange(() => {
	auth.user = (pb.authStore.record as UserRec) ?? null;
});

export function logout() {
	pb.authStore.clear();
}
