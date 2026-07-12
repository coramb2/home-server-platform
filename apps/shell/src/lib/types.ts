export type Status = 'Backlog' | 'Open' | 'In Progress' | 'Waiting' | 'Done';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export const STATUSES: Status[] = ['Backlog', 'Open', 'In Progress', 'Waiting', 'Done'];
// Columns shown on the board (Backlog is filed but off-board until triaged).
export const BOARD: Status[] = ['Open', 'In Progress', 'Waiting', 'Done'];
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const CATEGORIES = [
	'repair',
	'planning',
	'project',
	'errand',
	'it-server',
	'fun',
	'security'
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
