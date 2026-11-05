import { pb } from './pb';
import type { UserRec } from './types';

// Everyone in the household, loaded once and shared by every screen.
// (Signed-in users may list each other; emails stay hidden by PocketBase.)
export const people = $state<{ list: UserRec[] }>({ list: [] });

let loading: Promise<void> | null = null;
export function loadPeople() {
	loading ??= pb
		.collection('users')
		.getFullList<UserRec>({ sort: 'name', fields: 'id,name,email' })
		.then((u) => {
			people.list = u;
		})
		.catch(() => {
			loading = null; // try again next time
		});
	return loading;
}
