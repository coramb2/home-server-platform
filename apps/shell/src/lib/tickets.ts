// Small helpers shared by the board, the ticket page and the dashboard.
import type { RepeatMode, Ticket, UserRec } from './types';

const DAY = 864e5;

/** Display name: name, else the part of the email before @ (own email only). */
export const who = (u?: UserRec) => u?.name || u?.email?.split('@')[0] || '—';

export const initials = (u?: UserRec) => who(u).slice(0, 2).toUpperCase();

/** "Cora", "Cora & Kam", or "Everyone" when every user is on it. */
export function assigneeLabel(t: Ticket, allUsers: UserRec[]): string {
	const list = t.expand?.assignee ?? [];
	if (!list.length) return 'Unassigned';
	if (allUsers.length > 1 && allUsers.every((u) => t.assignee.includes(u.id))) return 'Everyone';
	return list.map(who).join(' & ');
}

// ── dates ─────────────────────────────────────────────────────────
// Date-only values are stored at 12:00 UTC so they're the same calendar day
// in every US time zone. Always *display* them in UTC for the same reason.

/** "2026-11-20" (from <input type=date>) -> what PocketBase stores. */
export const toPBDate = (yyyyMmDd: string) => (yyyyMmDd ? `${yyyyMmDd} 12:00:00.000Z` : '');

const parse = (pb: string) => new Date(pb.replace(' ', 'T'));

export const fmtDay = (pb?: string) =>
	pb ? parse(pb).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

/** Noon UTC of the local calendar day (matches the server's "today"). */
function todayNoon(now = new Date()) {
	return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}
const dayNoon = (pb: string) => {
	const [y, m, d] = pb.slice(0, 10).split('-').map(Number);
	return Date.UTC(y, m - 1, d, 12);
};

/** Waiting off the board until its reminder window opens. */
export const isUpcoming = (t: Ticket, now = Date.now()) =>
	!!t.show_from && parse(t.show_from).getTime() > now;

export const repeats = (t: Ticket) => (t.repeat_days ?? 0) > 0;

/** Due chip: tone + text, or null when there's no due date / it's done. */
export function dueChip(t: Ticket): { tone: 'over' | 'today' | 'soon' | 'later'; text: string } | null {
	if (!t.due_date || t.status === 'Done') return null;
	const diff = Math.round((dayNoon(t.due_date) - todayNoon()) / DAY);
	if (diff < 0) return { tone: 'over', text: `overdue ${-diff}d` };
	if (diff === 0) return { tone: 'today', text: 'due today' };
	if (diff <= 2) return { tone: 'soon', text: diff === 1 ? 'due tomorrow' : 'due in 2d' };
	return { tone: 'later', text: `due ${fmtDay(t.due_date)}` };
}

export function every(days?: number) {
	if (!days) return '';
	if (days === 1) return 'daily';
	if (days % 365 === 0) return days === 365 ? 'yearly' : `every ${days / 365}y`;
	if (days % 30 === 0) return days === 30 ? 'monthly' : `every ${days / 30}mo`;
	if (days % 7 === 0) return days === 7 ? 'weekly' : `every ${days / 7}wk`;
	return `every ${days}d`;
}

/**
 * Preview of when the next one would be due if marked Done today.
 * Display only — the server (pb_hooks/repeat_lib.js) decides for real.
 */
export function previewNext(days: number, mode: RepeatMode, due?: string): string {
	const t = todayNoon();
	let next: number;
	if (mode === 'fixed' && due) {
		next = dayNoon(due) + days * DAY;
		while (next <= t) next += days * DAY;
	} else next = t + days * DAY;
	return fmtDay(new Date(next).toISOString().replace('T', ' '));
}
