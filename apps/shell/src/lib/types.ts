export type Status = 'Backlog' | 'Open' | 'In Progress' | 'Waiting' | 'Done';
export type Priority = 'ASAP' | 'Sooner than later' | 'Floating';

export const STATUSES: Status[] = ['Backlog', 'Open', 'In Progress', 'Waiting', 'Done'];
// Columns shown on the board (Backlog is filed but off-board until triaged).
export const BOARD: Status[] = ['Open', 'In Progress', 'Waiting', 'Done'];
// Most urgent first. Must match the select values in the PocketBase migration.
export const PRIORITIES: Priority[] = ['ASAP', 'Sooner than later', 'Floating'];
// CSS-safe names for each priority (class names can't contain spaces).
export const PRIORITY_CLASS: Record<Priority, string> = {
	ASAP: 'asap',
	'Sooner than later': 'sooner',
	Floating: 'floating'
};
export const CATEGORIES = [
	'chore',
	'favor',
	'project',
	'reminder',
	'date',
	'daily',
	'idea'
] as const;

export interface UserRec {
	id: string;
	name?: string;
	email?: string;
}

export interface Ticket {
	id: string;
	title: string;
	description?: string;
	status: Status;
	priority?: Priority | '';
	category?: string;
	assignee?: string;
	created_by?: string;
	due_date?: string;
	done_at?: string;
	done_by?: string;
	attachments?: string[];
	created: string;
	updated: string;
	expand?: {
		assignee?: UserRec;
		created_by?: UserRec;
		done_by?: UserRec;
	};
}

export interface Comment {
	id: string;
	ticket: string;
	author: string;
	body: string;
	created: string;
	updated: string;
	expand?: { author?: UserRec };
}

export interface RecurringTask {
	id: string;
	title: string;
	description?: string;
	category?: string;
	priority?: Priority | '';
	assignee?: string;
	interval_days: number;
	next_due: string;
	active: boolean;
	last_created?: string;
	expand?: { assignee?: UserRec };
}
