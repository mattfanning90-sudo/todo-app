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
import { SectionCard } from '@/components/SectionCard';
import { Chip } from '@/components/Chip';
import { Checkbox } from '@/components/Checkbox';
import { DateField } from '@/components/DateField';
import { ListRow } from '@/components/ListRow';
import { Icon } from '@/components/Icon';
import { useTheme, radius, spacing, font } from '@/theme';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '@/api/client';
import type { Board, Category, Priority, Stage, Task, UserSearchResult } from '@/api/types';
import type { Nav, RootStackParamList } from '@/navigation/types';
import type { RouteProp } from '@react-navigation/native';

const STAGES: Stage[] = ['backlog', 'in_progress', 'done'];
const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];
// Web vocabulary — must match public/app.js recurrence <select> options exactly.
const RECURRENCES: string[] = ['none', 'daily', 'weekly', 'monthly', 'after:3', 'after:7', 'after:14', 'after:30'];
const RECURRENCE_LABELS: Record<string, string> = {
  none: 'No repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  'after:3': 'Every 3 days',
  'after:7': 'Every 7 days',
  'after:14': 'Every 14 days',
  'after:30': 'Every 30 days',
};
const CATEGORY_COLORS = [
  '#4285F4', '#34A853', '#EA4335', '#FBBC05',
  '#8B5CF6', '#F59E0B', '#10B981', '#EC4899',
];

interface Props {
  board?: Board;
  task?: Task | null;
  onClose?: (changed: boolean) => void;
}

export function TaskDetailScreen({ board: boardProp, task: taskProp, onClose }: Props) {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const board = boardProp ?? route.params?.board;
  const task = taskProp !== undefined ? taskProp : (route.params?.task ?? null);
  const close = onClose ?? ((_changed: boolean) => nav.goBack());
  const t = useTheme();
  const editing = task !== null;

  // Core fields
  const [text, setText] = useState(task?.text ?? '');
  const [stage, setStage] = useState<Stage>(task?.stage ?? 'backlog');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'none');
  const [categoryId, setCategoryId] = useState<number | null>(task?.category_id ?? null);
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? '');

  // Notes / status
  const [status, setStatus] = useState<string>(task?.status ?? '');

  // Recurrence
  const [recurrence, setRecurrence] = useState<string>(task?.recurrence ?? 'none');

  // Assigned-to
  const [assignedToUserId, setAssignedToUserId] = useState<number | null>(
    task?.assigned_to_user_id ?? null
  );
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [assignedUserLabel, setAssignedUserLabel] = useState<string>(
    task?.assigned_to_username ?? task?.assigned_to_name ?? ''
  );
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calendar
  const [calStart, setCalStart] = useState<string>(task?.cal_start ?? '');
  const [calEnd, setCalEnd] = useState<string>(task?.cal_end ?? '');

  // Subtasks
  const [subtasks, setSubtasks] = useState<{ id?: number; text: string; done: boolean }[]>(
    task?.subtasks ?? []
  );
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const subtaskInputRef = useRef<TextInput>(null);

  // Share
  const [shareQuery, setShareQuery] = useState('');
  const [shareResults, setShareResults] = useState<UserSearchResult[]>([]);
  const [sharing, setSharing] = useState(false);
  const shareSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Category management
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    api.categories(board.id).then(setCategories).catch(() => {});
  }, [board.id]);

  // Live user search
  useEffect(() => {
    if (userQuery.length < 2) {
      setUserResults([]);
      return;
    }
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    userSearchTimeout.current = setTimeout(async () => {
      try {
        const results = await api.searchUsers(userQuery);
        setUserResults(results);
      } catch {
        setUserResults([]);
      }
    }, 300);
    return () => {
      if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    };
  }, [userQuery]);

  // Live share user search
  useEffect(() => {
    if (shareQuery.length < 2) {
      setShareResults([]);
      return;
    }
    if (shareSearchTimeout.current) clearTimeout(shareSearchTimeout.current);
    shareSearchTimeout.current = setTimeout(async () => {
      try {
        const results = await api.searchUsers(shareQuery);
        setShareResults(results);
      } catch {
        setShareResults([]);
      }
    }, 300);
    return () => {
      if (shareSearchTimeout.current) clearTimeout(shareSearchTimeout.current);
    };
  }, [shareQuery]);

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
        status,
        recurrence: recurrence === 'none' ? null : recurrence,
        assigned_to_user_id: assignedToUserId,
        cal_start: calStart || null,
        cal_end: calEnd || null,
        subtasks,
      };
      if (editing && task) {
        await api.updateTask(task.id, payload);
      } else {
        await api.createTask(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      close(true);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not save task', String(err));
    } finally {
      setSaving(false);
    }
  };

  // ── Subtask actions ──────────────────────────────────────────────────────────

  const addSubtask = () => {
    const st = newSubtaskText.trim();
    if (!st) return;
    setSubtasks((prev) => {
      const ids = prev.map((s) => s.id).filter((x): x is number => Number.isFinite(x as number));
      const nextId = (ids.length ? Math.max(...ids) : 0) + 1;
      return [...prev, { id: nextId, text: st, done: false }];
    });
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

  // ── Category ─────────────────────────────────────────────────────────────────

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

  const deleteCategory = (cat: Category) => {
    Alert.alert(
      `Delete "${cat.name}"?`,
      'Tasks in this category will have their category removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteCategory(cat.id, board.id);
              setCategories((prev) => prev.filter((c) => c.id !== cat.id));
              if (categoryId === cat.id) setCategoryId(null);
            } catch (err) {
              Alert.alert('Could not delete category', String(err));
            }
          },
        },
      ]
    );
  };

  // ── Destructive actions ───────────────────────────────────────────────────────

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
            close(true);
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
            close(true);
          } catch (err) {
            Alert.alert('Could not delete', String(err));
          }
        },
      },
    ]);
  };

  const shareWithUser = async (u: UserSearchResult) => {
    if (!task || sharing) return;
    setSharing(true);
    setShareQuery('');
    setShareResults([]);
    try {
      await api.shareTask(task.id, u.id, board.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Shared', `Shared with @${u.username}`);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not share task', String(err));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* ── Top bar ────────────────────────────────────────────────────────── */}
        <View style={[styles.topBar, { borderBottomColor: t.border }]}>
          <Pressable onPress={() => close(false)} hitSlop={10} style={styles.topBarSide}>
            <Text style={{ color: t.accent, fontSize: font.size.md }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.topBarTitle, { color: t.text }]} numberOfLines={1}>
            {editing ? 'Edit task' : 'New task'}
          </Text>
          <Pressable
            onPress={save}
            disabled={!canSave || saving}
            hitSlop={10}
            style={styles.topBarSide}
          >
            <Text
              style={{
                color: canSave && !saving ? t.accent : t.textMuted,
                fontSize: font.size.md,
                fontWeight: font.weight.semibold,
                textAlign: 'right',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Content ──────────────────────────────────────────────────────── */}
          <SectionCard eyebrow="Content" style={styles.card}>
            <View style={styles.cardInner}>
              <TextField
                label="What needs doing?"
                value={text}
                onChangeText={setText}
                placeholder="e.g. Pay rent tomorrow"
                multiline
              />
              <TextField
                label="Notes"
                value={status}
                onChangeText={setStatus}
                placeholder="Notes or status details…"
                multiline
              />
            </View>
          </SectionCard>

          {/* ── Organize ─────────────────────────────────────────────────────── */}
          <SectionCard eyebrow="Organize" style={styles.card}>
            <View style={styles.cardInner}>
              {/* Stage */}
              <Text style={[styles.rowLabel, { color: t.textMuted }]}>Stage</Text>
              <View style={styles.chipRow}>
                {STAGES.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    active={stage === s}
                    color={t.stage[s]}
                    mode="choice"
                    onPress={() => setStage(s)}
                  />
                ))}
              </View>

              {/* Priority */}
              <Text style={[styles.rowLabel, { color: t.textMuted }]}>Priority</Text>
              <View style={styles.chipRow}>
                {PRIORITIES.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    active={priority === p}
                    color={t.priority[p]}
                    mode="choice"
                    onPress={() => setPriority(p)}
                  />
                ))}
              </View>

              {/* Category */}
              <Text style={[styles.rowLabel, { color: t.textMuted }]}>Category</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="None"
                  active={categoryId === null}
                  color={t.textMuted}
                  mode="choice"
                  onPress={() => setCategoryId(null)}
                />
                {categories.map((c) => (
                  <View key={c.id} style={styles.catChipWrap}>
                    <Chip
                      label={c.name}
                      active={categoryId === c.id}
                      color={c.color}
                      mode="choice"
                      onPress={() => setCategoryId(c.id)}
                    />
                    <Pressable
                      onPress={() => deleteCategory(c)}
                      hitSlop={6}
                      testID={`delete-category-${c.id}`}
                      style={styles.catDeleteBtn}
                    >
                      <Icon name="close" label={`Delete ${c.name}`} size={10} color={t.danger} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => setCreatingCategory((v) => !v)}
                  style={[
                    styles.newCatChip,
                    { backgroundColor: t.chipMuted, borderColor: t.border },
                  ]}
                >
                  <Icon
                    name={creatingCategory ? 'close' : 'plus'}
                    label={creatingCategory ? 'Cancel' : 'New category'}
                    size={13}
                    color={t.accent}
                  />
                  <Text style={{ color: t.accent, fontWeight: font.weight.semibold, fontSize: 13, marginLeft: 4 }}>
                    {creatingCategory ? 'Cancel' : 'New'}
                  </Text>
                </Pressable>
              </View>

              {creatingCategory && (
                <View style={[styles.newCatForm, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
                  <TextField
                    label="Name"
                    value={newCatName}
                    onChangeText={setNewCatName}
                    placeholder="e.g. Home"
                    maxLength={30}
                    autoCapitalize="words"
                  />
                  <Text style={[styles.rowLabel, { color: t.textMuted }]}>Color</Text>
                  <View style={styles.palette}>
                    {CATEGORY_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => setNewCatColor(color)}
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: color,
                            borderColor: color === newCatColor ? t.text : 'transparent',
                          },
                        ]}
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

              {/* Recurrence */}
              <Text style={[styles.rowLabel, { color: t.textMuted }]}>Recurrence</Text>
              <View style={styles.chipRow}>
                {RECURRENCES.map((r) => (
                  <Chip
                    key={r}
                    label={RECURRENCE_LABELS[r] ?? r}
                    active={recurrence === r}
                    color={t.accent}
                    mode="choice"
                    onPress={() => setRecurrence(r)}
                  />
                ))}
                {/* Render a read-only chip for any legacy value not in the web set */}
                {recurrence !== 'none' && !RECURRENCES.includes(recurrence) && (
                  <Chip
                    key={`legacy-${recurrence}`}
                    label={recurrence}
                    active
                    color={t.textMuted}
                    mode="choice"
                    onPress={() => {}}
                  />
                )}
              </View>
            </View>
          </SectionCard>

          {/* ── Schedule ─────────────────────────────────────────────────────── */}
          <SectionCard eyebrow="Schedule" style={styles.card}>
            <View style={styles.cardInner}>
              <DateField
                label="Due date"
                value={dueDate ? dueDate.slice(0, 10) : ''}
                onChange={setDueDate}
                placeholder="No due date"
              />
              <DateField
                label="Calendar start"
                value={calStart ? calStart.slice(0, 10) : ''}
                onChange={setCalStart}
                placeholder="No start date"
              />
              <DateField
                label="Calendar end"
                value={calEnd ? calEnd.slice(0, 10) : ''}
                onChange={setCalEnd}
                placeholder="No end date"
              />
            </View>
          </SectionCard>

          {/* ── Assign ───────────────────────────────────────────────────────── */}
          <SectionCard eyebrow="Assign" style={styles.card}>
            {assignedToUserId ? (
              <View style={styles.assignedWrap}>
                <View style={[styles.assignedPill, { backgroundColor: t.accentMuted, borderColor: t.accent }]}>
                  <Text style={{ color: t.accent, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                    {assignedUserLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={() => { setAssignedToUserId(null); setAssignedUserLabel(''); setUserQuery(''); }}
                  hitSlop={8}
                >
                  <Icon name="close" label="Remove assignee" size={18} color={t.danger} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.cardInner}>
                <View style={[styles.searchRow, { borderColor: t.borderInput, backgroundColor: t.surface }]}>
                  <Icon name="search" label="" size={16} color={t.textLight} />
                  <TextInput
                    value={userQuery}
                    onChangeText={setUserQuery}
                    placeholder="Search user by name or email…"
                    placeholderTextColor={t.textLight}
                    style={[styles.searchInput, { color: t.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {userQuery.length > 0 && (
                    <Pressable onPress={() => { setUserQuery(''); setUserResults([]); }} hitSlop={8}>
                      <Icon name="close" label="Clear search" size={14} color={t.textLight} />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
            {!assignedToUserId && userResults.length > 0 && (
              <View>
                {userResults.map((u, idx) => (
                  <ListRow
                    key={u.id}
                    title={u.username}
                    subtitle={u.name ?? undefined}
                    divider={idx < userResults.length - 1}
                    onPress={() => {
                      setAssignedToUserId(u.id);
                      setAssignedUserLabel(u.username);
                      setUserQuery('');
                      setUserResults([]);
                    }}
                  />
                ))}
              </View>
            )}
          </SectionCard>

          {/* ── Subtasks ─────────────────────────────────────────────────────── */}
          <SectionCard
            eyebrow={`Subtasks${subtasks.length > 0 ? ` (${subtasks.filter((s) => s.done).length}/${subtasks.length})` : ''}`}
            style={styles.card}
          >
            <View>
              {subtasks.map((st, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.subtaskRow,
                    idx < subtasks.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: t.border,
                    },
                  ]}
                >
                  <Checkbox
                    checked={st.done}
                    onToggle={() => toggleSubtask(idx)}
                    color={t.success}
                  />
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
                    <Icon name="close" label={`Remove subtask`} size={16} color={t.textLight} />
                  </Pressable>
                </View>
              ))}

              {/* Add subtask row */}
              <View style={[styles.subtaskAddRow, { borderTopColor: t.border }]}>
                <Icon name="plus" label="" size={16} color={t.textLight} />
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
                  <Text style={{ color: t.accent, fontSize: font.size.md, fontWeight: font.weight.bold }}>
                    Add
                  </Text>
                </Pressable>
              </View>
            </View>
          </SectionCard>

          {/* ── Share (edit mode only) ───────────────────────────────────────── */}
          {editing && (
            <SectionCard eyebrow="Share" style={styles.card}>
              <View style={styles.cardInner}>
                <Text style={[styles.rowLabel, { color: t.textMuted }]}>
                  Share to someone's board
                </Text>
                <View style={[styles.searchRow, { borderColor: sharing ? t.textMuted : t.borderInput, backgroundColor: t.surface }]}>
                  <Icon name="search" label="" size={16} color={t.textLight} />
                  <TextInput
                    value={shareQuery}
                    onChangeText={setShareQuery}
                    placeholder={sharing ? 'Sharing…' : 'Find someone to share with…'}
                    placeholderTextColor={t.textLight}
                    style={[styles.searchInput, { color: t.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!sharing}
                  />
                  {shareQuery.length > 0 && !sharing && (
                    <Pressable onPress={() => { setShareQuery(''); setShareResults([]); }} hitSlop={8}>
                      <Icon name="close" label="Clear search" size={14} color={t.textLight} />
                    </Pressable>
                  )}
                </View>
              </View>
              {shareResults.length > 0 && (
                <View>
                  {shareResults.map((u, idx) => (
                    <ListRow
                      key={u.id}
                      title={u.username}
                      subtitle={u.name ?? undefined}
                      divider={idx < shareResults.length - 1}
                      onPress={() => shareWithUser(u)}
                    />
                  ))}
                </View>
              )}
            </SectionCard>
          )}

          {/* ── Destructive footer (edit mode only) ──────────────────────────── */}
          {editing && (
            <View style={styles.destructiveFooter}>
              <Button
                label="Archive task"
                variant="secondary"
                onPress={archive}
              />
              <Button
                label="Delete task"
                variant="destructive"
                onPress={remove}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
  },
  topBarSide: {
    width: 70,
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  card: {
    // gap between cards comes from ScrollView gap
  },
  cardInner: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  catChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catDeleteBtn: {
    marginLeft: -4,
    marginTop: -10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  newCatForm: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  assignedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  assignedPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: font.size.md,
    height: 44,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.lg,
  },
  subtaskText: {
    flex: 1,
    fontSize: font.size.md,
    lineHeight: 20,
  },
  subtaskAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  subtaskInput: {
    flex: 1,
    height: 40,
    fontSize: font.size.md,
  },
  destructiveFooter: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
