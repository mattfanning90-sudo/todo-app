// ios-app/src/navigation/types.ts
// Shared param lists + Nav type — imported by screens and by RootNavigator (Task 7).
// Lives here to avoid a circular dep: screens → this file; RootNavigator → this file.
import {
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import type { Board, Task } from '@/api/types';

// ── Per-stack param lists ────────────────────────────────────────────────────

export type TodayStackParams = {
  Today: undefined;
  Search: undefined;
  Notifications: undefined;
  TaskDetail: { board: Board; task: Task | null };
};

export type BoardStackParams = {
  Board: { board?: Board };   // board optional — BoardScreen resolves default
  TaskDetail: { board: Board; task: Task | null };
  Archived: { board: Board };
  BoardMembers: { board: Board };
  Search: undefined;
  Notifications: undefined;
  BoardList: undefined;
};

export type ProfileStackParams = {
  Profile: undefined;
  Settings: undefined;
  Appearance: undefined;
  BoardList: undefined;
  Search: undefined;
  Notifications: undefined;
  Import: undefined;
};

// ── Unified nav type ─────────────────────────────────────────────────────────
// Merges all stacks so screens can call navigation.navigate() without casting.
export type RootStackParamList = TodayStackParams &
  BoardStackParams &
  ProfileStackParams & {
    Login: undefined;
  };

export type Nav = NativeStackNavigationProp<RootStackParamList>;
