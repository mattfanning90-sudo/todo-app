import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// Use React Native's core Pressable throughout.
// Previously we used RNGH's Pressable to avoid being swallowed by
// GestureHandlerRootView, but that was specific to the old non-nestable
// DraggableFlatList. With NestableDraggableFlatList, RNGH coordinates
// child touches correctly and using RNGH Pressable inside another RNGH
// gesture causes competition that cancels taps. RN's native Pressable
// (using iOS's native responder system) works correctly inside RNGH.
import { useTheme, radius, spacing, font } from '@/theme';
import type { Category, Stage, Task } from '@/api/types';
import { Checkbox } from '@/components/Checkbox';

const STAGES: Stage[] = ['backlog', 'in_progress', 'done'];
const STAGE_LABELS: Record<Stage, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  done: 'Done',
};

interface Props {
  task: Task;
  category?: Category;
  onPress: () => void;
  onToggleDone?: () => void;
  /** When provided, rendered as a left-edge drag handle strip */
  dragHandle?: ReactNode;
  /** Long-press handler — used by DraggableFlatList to start within-stage drag */
  onLongPress?: () => void;
  /** Delay before long-press fires (default 200ms) */
  delayLongPress?: number;
  /** testID passed to the root pressable for testing */
  testID?: string;
  /** When provided, renders ← / → buttons to move the task between stages */
  onMoveStage?: (target: Stage) => void;
}

// Parse a 'YYYY-MM-DD' date-only string in the LOCAL timezone. `new Date('YYYY-MM-DD')`
// parses as UTC midnight, which lands on the previous calendar day for users west
// of UTC — making due-today look overdue and due-tomorrow look like today.
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dueLabel(
  due: string | null
): { label: string; variant: 'overdue' | 'today' | 'soon' | 'normal' } | null {
  if (!due) return null;
  const d = parseLocalDate(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${-diffDays}d overdue`, variant: 'overdue' };
  if (diffDays === 0) return { label: 'Today', variant: 'today' };
  if (diffDays === 1) return { label: 'Tomorrow', variant: 'soon' };
  if (diffDays < 7) return { label: `${diffDays}d`, variant: 'soon' };
  return {
    label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    variant: 'normal',
  };
}

export function TaskCard({ task, category, onPress, onToggleDone, dragHandle, onLongPress, delayLongPress = 200, testID, onMoveStage }: Props) {
  const t = useTheme();
  const due = dueLabel(task.due_date);
  const isDone = task.stage === 'done';

  const stageIdx = STAGES.indexOf(task.stage);
  const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
  const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;

  const priorityBorder =
    task.priority === 'none' ? 'transparent' : t.priority[task.priority];

  const dueBg =
    due?.variant === 'overdue'
      ? '#FEE2E2'
      : due?.variant === 'today'
      ? '#FEF3C7'
      : due?.variant === 'soon'
      ? '#DCFCE7'
      : t.surfaceElevated;
  const dueFg =
    due?.variant === 'overdue'
      ? '#991B1B'
      : due?.variant === 'today'
      ? '#92400E'
      : due?.variant === 'soon'
      ? '#166534'
      : t.textMuted;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderLeftColor: priorityBorder,
          shadowColor: '#000',
          shadowOpacity: pressed ? 0.12 : 0.05,
          shadowRadius: pressed ? 6 : 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: pressed ? 4 : 1,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.cardRow}>
        {dragHandle}
        <View style={styles.inner}>
          <View style={styles.topRow}>
            {/* Checkbox — 44pt accessible control (role="checkbox", state={checked}) */}
            <Checkbox
              checked={isDone}
              onToggle={() => onToggleDone?.()}
              color={t.priority[task.priority]}
            />

            {/* Task text */}
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={2}
                style={[
                  styles.text,
                  {
                    color: isDone ? t.textMuted : t.text,
                    textDecorationLine: isDone ? 'line-through' : 'none',
                  },
                ]}
              >
                {task.text}
              </Text>
              {!!task.status && (
                <Text
                  testID="task-notes-preview"
                  numberOfLines={1}
                  style={[styles.notesPreview, { color: t.textMuted }]}
                >
                  {'↳ ' + task.status}
                </Text>
              )}
            </View>
          </View>

          {/* Badges row */}
          {(category || due || (task.subtasks?.length ?? 0) > 0 || task.recurrence) && (
            <View style={styles.badges}>
              {category && (
                <View style={[styles.catPill, { backgroundColor: category.color }]}>
                  <Text style={styles.catPillText}>{category.name}</Text>
                </View>
              )}
              {due && (
                <View style={[styles.dueBadge, { backgroundColor: dueBg }]}>
                  <Text style={[styles.dueBadgeText, { color: dueFg }]}>
                    {due.label}
                  </Text>
                </View>
              )}
              {task.subtasks && task.subtasks.length > 0 && (
                <Text style={[styles.subtaskText, { color: t.textLight }]}>
                  {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                </Text>
              )}
              {task.recurrence && (
                <View testID="task-recurrence-badge" style={[styles.recurrenceBadge, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
                  <Text style={styles.recurrenceBadgeText}>🔁</Text>
                </View>
              )}
            </View>
          )}

          {onMoveStage && (
            <View style={styles.moveRow}>
              {prevStage && (
                <Pressable
                  testID="move-back"
                  onPress={() => onMoveStage(prevStage)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.moveBtn, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.moveBtnText, { color: t.textMuted }]}>← {STAGE_LABELS[prevStage]}</Text>
                </Pressable>
              )}
              {nextStage && (
                <Pressable
                  testID="move-forward"
                  onPress={() => onMoveStage(nextStage)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.moveBtn, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.moveBtnText, { color: t.accent }]}>{STAGE_LABELS[nextStage]} →</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  inner: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    lineHeight: 20,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
    marginLeft: 44,
    alignItems: 'center',
  },
  catPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  catPillText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: '#fff',
  },
  dueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dueBadgeText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  subtaskText: {
    fontSize: font.size.xs,
  },
  notesPreview: {
    fontSize: font.size.xs,
    marginTop: 2,
    fontStyle: 'italic',
  },
  recurrenceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  recurrenceBadgeText: {
    fontSize: font.size.xs,
  },
  moveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 8,
    marginLeft: 44,
  },
  moveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  moveBtnText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
});
