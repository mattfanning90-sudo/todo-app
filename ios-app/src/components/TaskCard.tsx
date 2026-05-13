import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, spacing, font } from '@/theme';
import type { Category, Task } from '@/api/types';

interface Props {
  task: Task;
  category?: Category;
  onPress: () => void;
  onToggleDone?: () => void;
}

function dueLabel(due: string | null): { label: string; overdue: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const diffDays = Math.round(
    (d.getTime() - now.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return { label: `${-diffDays}d overdue`, overdue: true };
  if (diffDays === 0) return { label: 'Today', overdue: false };
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false };
  if (diffDays < 7) return { label: `${diffDays}d`, overdue: false };
  return {
    label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    overdue: false,
  };
}

export function TaskCard({ task, category, onPress, onToggleDone }: Props) {
  const t = useTheme();
  const due = dueLabel(task.due_date);
  const priorityColor = t.priority[task.priority] ?? t.priority.none;
  const isDone = task.stage === 'done';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.priorityStrip, { backgroundColor: priorityColor }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleDone?.();
            }}
            hitSlop={8}
            style={[
              styles.checkbox,
              {
                borderColor: isDone ? t.success : t.border,
                backgroundColor: isDone ? t.success : 'transparent',
              },
            ]}
          >
            {isDone && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
          <Text
            numberOfLines={2}
            style={[
              styles.text,
              {
                color: t.text,
                textDecorationLine: isDone ? 'line-through' : 'none',
                opacity: isDone ? 0.6 : 1,
              },
            ]}
          >
            {task.text}
          </Text>
        </View>

        {(category || due || task.subtasks?.length) ? (
          <View style={styles.metaRow}>
            {category && (
              <View
                style={[
                  styles.chip,
                  { backgroundColor: category.color + '22', borderColor: category.color + '55' },
                ]}
              >
                <Text style={[styles.chipText, { color: category.color }]}>
                  {category.name}
                </Text>
              </View>
            )}
            {due && (
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: due.overdue ? t.danger + '22' : t.surfaceElevated,
                    borderColor: due.overdue ? t.danger + '55' : t.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: due.overdue ? t.danger : t.textMuted },
                  ]}
                >
                  {due.label}
                </Text>
              </View>
            )}
            {task.subtasks && task.subtasks.length > 0 && (
              <Text style={[styles.chipText, { color: t.textMuted }]}>
                {task.subtasks.filter((s) => s.done).length}/
                {task.subtasks.length} subtasks
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 64,
  },
  priorityStrip: { width: 3 },
  body: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmark: { color: 'white', fontSize: 12, fontWeight: '700' },
  text: { flex: 1, fontSize: font.size.md, lineHeight: 20 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginLeft: 28,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  chipText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
});
