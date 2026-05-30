export interface User {
  id: number;
  email: string;
  name: string | null;
  username: string;
  digest_frequency: DigestFrequency;
}

export type DigestFrequency = 'none' | 'daily' | 'weekly' | 'fortnightly';

export interface Board {
  id: number;
  owner_user_id: number;
  name: string;
  slug: string;
}

/** Board returned by /api/boards/memberships — owned by someone else */
export interface MemberBoard extends Board {
  owner_name: string | null;
  owner_email: string;
  owner_username: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export type Stage = 'backlog' | 'in_progress' | 'done';
export type Priority = 'high' | 'medium' | 'low' | 'none';

export interface Task {
  id: number;
  text: string;
  status: string;
  stage: Stage;
  category_id: number | null;
  due_date: string | null;
  priority: Priority;
  recurrence: string | null;
  subtasks: { text: string; done: boolean }[] | null;
  assigned_to_user_id: number | null;
  cal_start: string | null;
  cal_end: string | null;
  archived?: boolean;
  archived_at: string | null;
  completed_at: string | null;
  position: number;
  board_id: number;
}

export interface BoardMember {
  id: number;
  name: string | null;
  email: string;
  username: string;
}

export interface BoardInvite {
  id: number;
  invitee_email: string;
  created_at: string;
  token: string;
}

export interface DashboardData {
  trend: { date: string; completed: number }[];
  byPriority: Record<Priority, number>;
  byCategory: { name: string; color: string; count: number }[];
  counts: { open: number; inProgress: number; overdue: number };
}

export interface SearchHit {
  id: number;
  text: string;
  stage: Stage;
  due_date: string | null;
  priority: Priority;
  board_id: number;
  board_name: string;
  board_owner_id: number;
  cat_name: string | null;
  cat_color: string | null;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  task_id: number | null;
  from_user_id: number | null;
  from_name: string | null;
  from_email: string | null;
  from_username: string | null;
}

/** Minimal user shape returned by /api/users/search */
export interface UserSearchResult {
  id: number;
  name: string | null;
  email: string;
  username: string;
}

export interface TodayTask {
  id: number;
  text: string;
  stage: Stage;
  due_date: string;          // YYYY-MM-DD
  priority: Priority;
  status: string;
  board_id: number;
  board_name: string;
  cat_name: string | null;
  cat_color: string | null;
  completed_at: string | null;
}
