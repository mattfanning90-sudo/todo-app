import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import type { Board, Category, Priority, Stage, Task } from '@/api/types';

const STAGES: Stage[] = ['backlog', 'in_progress', 'done'];
const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];
const CATEGORY_COLORS = [
  '#4285F4', '#34A853', '#EA4335', '#FBBC05',
  '#8B5CF6', '#F59E0B', '#10B981', '#EC4899',
];

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
  const [categoryId, setCategoryId] = useState<number | null>(task?.category_id ?? null);
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? '');
  const [subtasks, setSubtasks] = useState<{ text: string; done: boolean }[]>(
    task?.subtasks ?? []
  );
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const subtaskInputRef = useRef<TextInput>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    api.categories(board.id).then(setCategories).catch(() => {});
  }, [board.id]);

  const canSave = useMemo(() => text.trim().length > 0, [text]);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload = {
        board_id: board.id,
        text: text.trim(),
        stage,
        priority,
        category_id: categoryId,
        due_date: dueDate ? dueDate : null,
        subtasks,
      };
      if (editing && task) {
        await api.updateTask(task.id, payload);
      } else {
        await api.createTask(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose(true);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not save task', String(err));
    } finally {
      setSaving(false);
    }
  };

  // ── Subtask actions ──────────────────────────────────────────────────────

  const addSubtask = () => {
    const t = newSubtaskText.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { text: t, done: false }]);
    setNewSubtaskText('');
    subtaskInputRef.current?.focus();
  };

  const toggleSubtask = (idx: number) => {
    setSubtasks((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, done: !s.done } : s))
    );
  };

  const removeSubtask = (idx: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Category ─────────────────────────────────────────────────────────────

  const submitNewCategory = async () => {
    const name = newCatName.trim();
    if (!name || savingCategory) return;
    setSavingCategory(true);
    try {
      const created = await api.createCategory(name, newCatColor, board.id);
      setCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
      setNewCatName('');
      setNewCatColor(CATEGORY_COLORS[0]);
      setCreatingCategory(false);
    } catch (err) {
      Alert.alert('Could not create category', String(err));
    } finally {
      setSavingCategory(false);
    }
  };

  // ── Destructive actions ───────────────────────────────────────────────────

  const archive = () => {
    if (!task) return;
    Alert.alert('Archive task?', 'You can restore it from the Archived view on the board.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: async () => {
          try {
            await api.updateTask(task.id, { board_id: board.id, archived: true });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onClose(true);
          } catch (err) {
            Alert.alert('Could not archive', String(err));
          }
        },
      },
    ]);
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
            await api.deleteTask(task.id, board.id);
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
                color: canSave && !saving ? t.accent : t.textMuted,
                fontSize: font.size.md,
                fontWeight: font.weight.semibold,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <TextField
            label="What needs doing?"
            value={text}
            onChangeText={setText}
            placeholder="e.g. Pay rent tomorrow"
            multiline
          />

          <Section label="Stage">
            <View style={styles.row}>
              {STAGES.map((s) => (
                <Chip key={s} label={s} active={stage === s} color={t.stage[s]} onPress={() => setStage(s)} />
              ))}
            </View>
          </Section>

          <Section label="Priority">
            <View style={styles.row}>
              {PRIORITIES.map((p) => (
                <Chip key={p} label={p} active={priority === p} color={t.priority[p]} onPress={() => setPriority(p)} />
              ))}
            </View>
          </Section>

          <Section label="Category">
            <View style={styles.row}>
              <Chip label="None" active={categoryId === null} color={t.textMuted} onPress={() => setCategoryId(null)} />
              {categories.map((c) => (
                <Chip key={c.id} label={c.name} active={categoryId === c.id} color={c.color} onPress={() => setCategoryId(c.id)} />
              ))}
              <Pressable
                onPress={() => setCreatingCategory((v) => !v)}
                style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border, borderStyle: 'dashed' }]}
              >
                <Text style={{ color: t.accent, fontWeight: font.weight.medium }}>
                  {creatingCategory ? '× Cancel' : '+ New'}
                </Text>
              </Pressable>
            </View>

            {creatingCategory && (
              <View style={[styles.newCatForm, { backgroundColor: t.surface, borderColor: t.border }]}>
                <TextField
                  label="Name"
                  value={newCatName}
                  onChangeText={setNewCatName}
                  placeholder="e.g. Home"
                  maxLength={30}
                  autoCapitalize="words"
                />
                <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Color</Text>
                <View style={styles.palette}>
                  {CATEGORY_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setNewCatColor(color)}
                      style={[styles.swatch, { backgroundColor: color, borderColor: color === newCatColor ? t.text : 'transparent' }]}
                    />
                  ))}
                </View>
                <Button
                  label={savingCategory ? 'Adding…' : 'Add category'}
                  onPress={submitNewCategory}
                  disabled={!newCatName.trim() || savingCategory}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            )}
          </Section>

          <TextField
            label="Due date (YYYY-MM-DD)"
            value={dueDate ? dueDate.slice(0, 10) : ''}
            onChangeText={setDueDate}
            placeholder="Optional"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* ── Subtasks ─────────────────────────────────────────────────── */}
          <Section label={`Subtasks${subtasks.length > 0 ? ` (${subtasks.filter((s) => s.done).length}/${subtasks.length})` : ''}`}>
            {subtasks.map((st, idx) => (
              <View
                key={idx}
                style={[styles.subtaskRow, { borderBottomColor: t.border }]}
              >
                <Pressable
                  onPress={() => toggleSubtask(idx)}
                  style={[
                    styles.subtaskCheck,
                    {
                      borderColor: st.done ? t.success : t.borderInput,
                      backgroundColor: st.done ? t.success : 'transparent',
                    },
                  ]}
                >
                  {st.done && <Text style={styles.subtaskCheckmark}>✓</Text>}
                </Pressable>
                <Text
                  style={[
                    styles.subtaskText,
                    {
                      color: st.done ? t.textMuted : t.text,
                      textDecorationLine: st.done ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {st.text}
                </Text>
                <Pressable onPress={() => removeSubtask(idx)} hitSlop={10}>
                  <Text style={[styles.subtaskRemove, { color: t.textLight }]}>×</Text>
                </Pressable>
              </View>
            ))}

            <View style={[styles.subtaskAddRow, { borderColor: t.border }]}>
              <TextInput
                ref={subtaskInputRef}
                value={newSubtaskText}
                onChangeText={setNewSubtaskText}
                onSubmitEditing={addSubtask}
                placeholder="Add subtask…"
                placeholderTextColor={t.textLight}
                returnKeyType="done"
                blurOnSubmit={false}
                style={[styles.subtaskInput, { color: t.text }]}
              />
              <Pressable
                onPress={addSubtask}
                disabled={!newSubtaskText.trim()}
                hitSlop={8}
                style={({ pressed }) => ({
                  opacity: !newSubtaskText.trim() ? 0.3 : pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '700' }}>+</Text>
              </Pressable>
            </View>
          </Section>

          {/* ── Destructive actions ──────────────────────────────────────── */}
          {editing && (
            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Button label="Archive task" variant="ghost" onPress={archive} />
              <Button label="Delete task" variant="ghost" onPress={remove} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[styles.sectionLabel, { color: t.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? color : t.surface, borderColor: active ? color : t.border }]}
    >
      <Text style={{ color: active ? '#fff' : t.text, textTransform: 'capitalize', fontWeight: font.weight.medium }}>
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
  sectionLabel: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  newCatForm: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  // Subtask styles
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subtaskCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subtaskCheckmark: { color: '#fff', fontSize: 10, fontWeight: '700' },
  subtaskText: { flex: 1, fontSize: font.size.md, lineHeight: 20 },
  subtaskRemove: { fontSize: 20, lineHeight: 22 },
  subtaskAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  subtaskInput: { flex: 1, height: 38, fontSize: font.size.md },
});
