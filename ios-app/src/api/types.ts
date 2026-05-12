export interface User {
  id: number;
  email: string;
  name: string | null;
  username: string;
  digest_frequency: 'none' | 'daily' | 'weekly' | 'biweekly';
}

export interface Board {
  id: number;
  owner_user_id: number;
  name: string;
  slug: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export type Stage = 'backlog' | 'progress' | 'done';
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
  archived_at: string | null;
  completed_at: string | null;
  position: number;
  board_id: number;
}

export interface DashboardData {
  trend: { date: string; completed: number }[];
  byPriority: Record<Priority, number>;
  byCategory: { name: string; color: string; count: number }[];
  counts: { open: number; inProgress: number; overdue: number };
}
