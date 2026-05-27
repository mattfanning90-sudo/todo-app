import React from 'react';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
// Use React Native's core Pressable throughout.
// Previously we used RNGH's Pressable to avoid being swallowed by
// GestureHandlerRootView, but that was specific to the old non-nestable
// DraggableFlatList. With NestableDraggableFlatList, RNGH coordinates
// child touches correctly and using RNGH Pressable inside another RNGH
// gesture causes competition that cancels taps. RN's native Pressable
// (using iOS's native responder system) works correctly inside RNGH.
import { useTheme, radius, spacing, font } from '@/theme';
import type { Category, Stage, Task } from '@/api/types';

const STAGE_LABELS: Record<Stage, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  done: 'Done',
};

const ALL_STAGES: Stage[] = ['backlog', 'in_progress', 'done'];

interface Props {
  task: Task;
  category?: Category;
  onPress: () => void;
  onToggleDone?: () => void;
  /** When provided, a "Move to…" pill appears on the card */
  onMoveToStage?: (stage: Stage) => void;
  /** Long-press handler — used by DraggableFlatList to start a drag */
  onLongPress?: () => void;
  /** Delay before long-press fires (default 200ms) */
  delayLongPress?: number;
  /** testID passed to the root pressable for testing */
  testID?: string;
}

function dueLabel(
  due: string | null
): { label: string; variant: 'overdue' | 'today' | 'soon' | 'normal' } | null {
  if (!due) return null;
  const d = new Date(due);
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

export function TaskCard({ task, category, onPress, onToggleDone, onMoveToStage, onLongPress, delayLongPress = 200, testID }: Props) {
  const t = useTheme();
  const due = dueLabel(task.due_date);
  const isDone = task.stage === 'done';

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

  const handleMovePress = () => {
    const targets = ALL_STAGES.filter((s) => s !== task.stage);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Move to…',
        options: [...targets.map((s) => STAGE_LABELS[s]), 'Cancel'],
        cancelButtonIndex: targets.length,
      },
      (idx) => {
        if (idx < targets.length) onMoveToStage?.(targets[idx]);
      }
    );
  };

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
      <View style={styles.inner}>
        <View style={styles.topRow}>
          {/* Checkbox — inner Pressable wins the responder automatically */}
          <Pressable
            onPress={() => onToggleDone?.()}
            hitSlop={8}
            style={[
              styles.checkbox,
              {
                borderColor: isDone ? t.success : t.borderInput,
                backgroundColor: isDone ? t.success : 'transparent',
              },
            ]}
          >
            {isDone && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>

          {/* Task text */}
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
        </View>

        {/* Badges row */}
        {(category || due || (task.subtasks?.length ?? 0) > 0 || onMoveToStage) && (
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

            {/* Move-to-stage pill — only shown when callback is wired */}
            {onMoveToStage && (
              <Pressable
                onPress={handleMovePress}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.movePill,
                  {
                    backgroundColor: t.surfaceElevated,
                    borderColor: t.border,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.movePillText, { color: t.textMuted }]}>Move →</Text>
              </Pressable>
            )}
          </View>
        )}
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
  inner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkmark: { color: '#fff', fontSize: 10, fontWeight: '700' },
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
    marginLeft: 26,
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
  movePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  movePillText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
});
