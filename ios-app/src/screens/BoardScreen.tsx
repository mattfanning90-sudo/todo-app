import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { DropProvider, Draggable, Droppable } from 'react-native-reanimated-dnd';
import { Screen } from '@/components/Screen';
import { TaskCard } from '@/components/TaskCard';
import { useTheme, radius, spacing, font } from '@/theme';
import { useAuth } from '@/auth/AuthContext';
import { api } from '@/api/client';
import type { Board, Category, Stage, Task } from '@/api/types';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

type Filter = 'all' | 'today' | 'overdue' | 'nodate';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'nodate', label: 'No date' },
];

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

interface Props {
  board: Board;
  onBack: () => void;
  onOpenTask: (task: Task | null) => void;
  onOpenArchived: () => void;
  onOpenMembers: () => void;
}

export function BoardScreen({ board, onBack, onOpenTask, onOpenArchived, onOpenMembers }: Props) {
  const t = useTheme();
  const { user } = useAuth();
  const isOwner = user?.id === board.owner_user_id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickStage, setQuickStage] = useState<Stage>('backlog');
  const [quickSaving, setQuickSaving] = useState(false);
  const quickInputRef = useRef<TextInput | null>(null);
  // While a card drags, lift it (and its stage) above the rest so it renders in front.
  const [dragging, setDragging] = useState<{ id: number; stage: Stage } | null>(null);

  const load = useCallback(async () => {
    try {
      const [ts, cs] = await Promise.all([
        api.tasks(board.id),
        api.categories(board.id),
      ]);
      setTasks(ts);
      setCategories(cs);
    } catch (err) {
      Alert.alert('Could not load tasks', String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [board.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const categoriesById = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const applyFilter = useCallback(
    (stageTasks: Task[]) => {
      if (filter === 'today') return stageTasks.filter((tk) => isToday(tk.due_date));
      if (filter === 'overdue') return stageTasks.filter((tk) => isOverdue(tk.due_date));
      if (filter === 'nodate') return stageTasks.filter((tk) => !tk.due_date);
      return stageTasks;
    },
    [filter]
  );

  /** Ordered tasks per stage, with filter applied */
  const stageData = useMemo(() => {
    const byStage = (stage: Stage) =>
      applyFilter(
        tasks.filter((tk) => tk.stage === stage && !tk.archived_at).sort((a, b) => a.position - b.position)
      );
    return {
      backlog: byStage('backlog'),
      in_progress: byStage('in_progress'),
      done: byStage('done'),
    };
  }, [tasks, applyFilter]);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { backlog: 0, in_progress: 0, done: 0 };
    tasks.forEach((tk) => {
      if (!tk.archived_at) c[tk.stage] = (c[tk.stage] ?? 0) + 1;
    });
    return c;
  }, [tasks]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const submitQuickAdd = async () => {
    const text = quickText.trim();
    if (!text || quickSaving) return;
    setQuickSaving(true);
    try {
      const created = await api.createTask({ board_id: board.id, text, stage: quickStage });
      setTasks((prev) => [...prev, created]);
      setQuickText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not add task', String(err));
    } finally {
      setQuickSaving(false);
    }
  };

  const toggleDone = useCallback(
    async (task: Task) => {
      const newStage: Stage = task.stage === 'done' ? 'backlog' : 'done';
      setTasks((prev) => prev.map((u) => (u.id === task.id ? { ...u, stage: newStage } : u)));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await api.updateTask(task.id, { board_id: board.id, stage: newStage });
      } catch (err) {
        Alert.alert('Could not update task', String(err));
        load();
      }
    },
    [board.id, load]
  );

  const moveToStage = useCallback(
    async (task: Task, newStage: Stage) => {
      if (task.stage === newStage) return;
      setTasks((prev) => prev.map((u) => (u.id === task.id ? { ...u, stage: newStage } : u)));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      try {
        await api.updateTask(task.id, { board_id: board.id, stage: newStage });
      } catch (err) {
        Alert.alert('Could not move task', String(err));
        load();
      }
    },
    [board.id, load]
  );

  // ─── Stage section header ────────────────────────────────────────────────────

  const StageHeader = ({ stage, label }: { stage: Stage; label: string }) => {
    const stageColor = t.stage[stage];
    return (
      <View style={[styles.stageHeader, { backgroundColor: t.bg }]}>
        <View style={[styles.stageHeaderInner, { borderLeftColor: stageColor }]}>
          <View style={styles.stageTitleRow}>
            <Text style={[styles.stageTitle, { color: stageColor }]}>{label}</Text>
            <View style={[styles.stageCountBadge, { backgroundColor: stageColor + '22' }]}>
              <Text style={[styles.stageCountText, { color: stageColor }]}>{counts[stage]}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              setQuickStage(stage);
              quickInputRef.current?.focus();
            }}
            hitSlop={10}
          >
            <Text style={{ color: stageColor, fontSize: font.size.lg, fontWeight: '700' }}>+</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Screen padded={false}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Boards</Text>
        </Pressable>
        <Text style={[styles.boardName, { color: t.text }]} numberOfLines={1}>
          {board.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => onOpenTask(null)} hitSlop={10}>
            <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '600' }}>+</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const options = ['Archived tasks', ...(isOwner ? ['Members'] : []), 'Cancel'];
              const cancelIdx = options.length - 1;
              ActionSheetIOS.showActionSheetWithOptions(
                { options, cancelButtonIndex: cancelIdx, title: board.name },
                (idx) => {
                  if (options[idx] === 'Archived tasks') onOpenArchived();
                  else if (options[idx] === 'Members') onOpenMembers();
                }
              );
            }}
            hitSlop={10}
          >
            <Text style={{ color: t.textMuted, fontSize: 20, lineHeight: 24 }}>•••</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Filter pills ────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { backgroundColor: t.bg }]}
        contentContainerStyle={styles.filterScroll}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterPill,
                { backgroundColor: active ? t.accent : t.surface, borderColor: active ? t.accent : t.border },
              ]}
            >
              <Text style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: active ? '#fff' : t.textMuted }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Quick-add bar ────────────────────────────────────────────────── */}
      <View style={[styles.quickAddOuter, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickStageRow}>
          {STAGES.map((s) => {
            const active = quickStage === s.key;
            const stageColor = t.stage[s.key];
            return (
              <Pressable
                key={s.key}
                onPress={() => setQuickStage(s.key)}
                style={[
                  styles.quickStagePill,
                  { backgroundColor: active ? stageColor + '22' : t.surface, borderColor: active ? stageColor : t.border },
                ]}
              >
                <Text style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: active ? stageColor : t.textMuted }}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.quickAddRow, { backgroundColor: t.surface, borderColor: t.border }]}>
          <TextInput
            ref={quickInputRef}
            value={quickText}
            onChangeText={setQuickText}
            onSubmitEditing={submitQuickAdd}
            placeholder={`Add to ${STAGES.find((s) => s.key === quickStage)?.label ?? ''}…`}
            placeholderTextColor={t.textLight}
            returnKeyType="done"
            blurOnSubmit={false}
            editable={!quickSaving}
            style={[styles.quickInput, { color: t.text }]}
          />
          <Pressable
            onPress={submitQuickAdd}
            disabled={!quickText.trim() || quickSaving}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: !quickText.trim() || quickSaving ? 0.35 : pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '700' }}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Kanban: drag a card onto another stage to move it; ←/→ buttons also work ── */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={t.textMuted}
          />
        }
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl * 2 }}
        showsVerticalScrollIndicator={false}
      >
        <DropProvider>
          {!loading && tasks.length === 0 && (
            <Text style={[styles.empty, { color: t.textMuted }]}>No tasks yet. Tap + to add one.</Text>
          )}

          {STAGES.map((s) => (
            <Droppable<{ task: Task }>
              key={s.key}
              droppableId={s.key}
              onDrop={(data) => moveToStage(data.task, s.key)}
              style={[styles.stageDroppable, dragging?.stage === s.key && styles.stageLifted]}
              activeStyle={[styles.stageActive, { borderColor: t.stage[s.key], backgroundColor: t.stage[s.key] + '0d' }]}
            >
              <StageHeader stage={s.key} label={s.label} />
              {stageData[s.key].length === 0 ? (
                <View style={styles.stageEmpty}>
                  <Text style={[styles.stageEmptyText, { color: t.textLight }]}>Drop a task here</Text>
                </View>
              ) : (
                stageData[s.key].map((task) => (
                  <Draggable<{ task: Task }>
                    key={task.id}
                    data={{ task }}
                    preDragDelay={180}
                    onDragStart={() => setDragging({ id: task.id, stage: s.key })}
                    onDragEnd={() => setDragging(null)}
                    style={[styles.draggable, dragging?.id === task.id && styles.draggingCard]}
                  >
                    <TaskCard
                      task={task}
                      category={task.category_id ? categoriesById.get(task.category_id) : undefined}
                      onPress={() => onOpenTask(task)}
                      onToggleDone={() => toggleDone(task)}
                      onMoveStage={(target) => moveToStage(task, target)}
                    />
                  </Draggable>
                ))
              )}
            </Droppable>
          ))}
        </DropProvider>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  boardName: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.size.md,
    fontWeight: font.weight.bold,
    marginHorizontal: spacing.md,
  },
  filterBar: { flexGrow: 0, paddingVertical: spacing.sm },
  filterScroll: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  filterPill: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.xl, borderWidth: 1 },
  quickAddOuter: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  quickStageRow: { flexDirection: 'row', gap: spacing.xs, paddingBottom: spacing.xs },
  quickStagePill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.xl, borderWidth: 1 },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  quickInput: { flex: 1, height: 38, fontSize: font.size.md },
  // ── Stage headers ────────────────────────────────────────────────────────────
  stageHeader: { paddingTop: spacing.md, paddingBottom: spacing.sm },
  stageHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
  },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stageTitle: { fontSize: font.size.sm, fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  stageCountBadge: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, minWidth: 20, alignItems: 'center' },
  stageCountText: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
  // ── Droppable stage + draggable cards ──────────────────────────────────────────
  stageDroppable: { borderRadius: radius.lg, borderWidth: 1, borderColor: 'transparent', marginBottom: spacing.sm, paddingBottom: spacing.xs },
  stageActive: { borderStyle: 'dashed' },
  draggable: { marginBottom: spacing.sm },
  // Lift the dragging card (and its stage) above siblings so it animates in front.
  stageLifted: { zIndex: 10 },
  draggingCard: {
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  stageEmpty: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#e4e4e7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stageEmptyText: { fontSize: font.size.sm },
  empty: { textAlign: 'center', paddingTop: spacing.xxl, fontSize: font.size.md },
});
