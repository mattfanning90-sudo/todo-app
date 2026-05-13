import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import type { Board, Category, Priority, Stage, Task } from '@/api/types';

const STAGES: Stage[] = ['backlog', 'progress', 'done'];
const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];

interface Props {
  board: Board;
  task: Task | null;
  onClose: (changed: boolean) => void;
}

export function TaskDetailScreen({ board, task, onClose }: Props) {
  const t = useTheme();
  const editing = task !== null;
  const [text, setText] = useState(task?.text ?? '');
  const [stage, setStage] = useState<Stage>(task?.stage ?? 'backlog');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'none');
  const [categoryId, setCategoryId] = useState<number | null>(
    task?.category_id ?? null
  );
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const canSave = useMemo(() => text.trim().length > 0, [text]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        board_id: board.id,
        text: text.trim(),
        stage,
        priority,
        category_id: categoryId,
        due_date: dueDate ? dueDate : null,
      };
      if (editing && task) {
        await api.updateTask(task.id, payload);
      } else {
        await api.createTask(payload);
      }
      onClose(true);
    } catch (err) {
      Alert.alert('Could not save task', String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!task) return;
    Alert.alert('Delete task?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(task.id);
            onClose(true);
          } catch (err) {
            Alert.alert('Could not delete', String(err));
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => onClose(false)} hitSlop={10}>
            <Text style={{ color: t.accent, fontSize: font.size.md }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: t.text }]}>
            {editing ? 'Edit task' : 'New task'}
          </Text>
          <Pressable onPress={save} disabled={!canSave || saving} hitSlop={10}>
            <Text
              style={{
                color: canSave ? t.accent : t.textMuted,
                fontSize: font.size.md,
                fontWeight: font.weight.semibold,
              }}
            >
              Save
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <TextField
            label="What needs doing?"
            value={text}
            onChangeText={setText}
            placeholder="e.g. Pay rent tomorrow"
            autoFocus={!editing}
            multiline
          />

          <Section label="Stage">
            <View style={styles.row}>
              {STAGES.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={stage === s}
                  color={t.stage[s]}
                  onPress={() => setStage(s)}
                />
              ))}
            </View>
          </Section>

          <Section label="Priority">
            <View style={styles.row}>
              {PRIORITIES.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  active={priority === p}
                  color={t.priority[p]}
                  onPress={() => setPriority(p)}
                />
              ))}
            </View>
          </Section>

          <Section label="Category">
            <View style={styles.row}>
              <Chip
                label="None"
                active={categoryId === null}
                color={t.textMuted}
                onPress={() => setCategoryId(null)}
              />
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={categoryId === c.id}
                  color={c.color}
                  onPress={() => setCategoryId(c.id)}
                />
              ))}
            </View>
          </Section>

          <TextField
            label="Due date (YYYY-MM-DD)"
            value={dueDate ? dueDate.slice(0, 10) : ''}
            onChangeText={setDueDate}
            placeholder="Optional"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {editing && (
            <Button
              label="Delete task"
              variant="ghost"
              onPress={remove}
              style={{ marginTop: spacing.lg }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          color: t.textMuted,
          fontSize: font.size.sm,
          fontWeight: font.weight.medium,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: spacing.sm,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? color : t.surface,
          borderColor: active ? color : t.border,
        },
      ]}
    >
      <Text
        style={{
          color: active ? '#fff' : t.text,
          textTransform: 'capitalize',
          fontWeight: font.weight.medium,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
});
