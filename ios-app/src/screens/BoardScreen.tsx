import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Screen } from '@/components/Screen';
import { TaskCard } from '@/components/TaskCard';
import { DragHandle } from '@/components/DragHandle';
import { resolveStageFromBounds } from '@/utils/resolveStageFromBounds';
import type { StageBounds } from '@/utils/resolveStageFromBounds';
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

  // ─── Cross-stage drag state ──────────────────────────────────────────────
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const draggingTaskRef = useRef<Task | null>(null); // ref mirror — readable synchronously in callbacks
  const [targetStage, setTargetStage] = useState<Stage | null>(null);
  const ghostYValue = useRef(new Animated.Value(0)).current;
  const containerTopValue = useRef(new Animated.Value(0)).current;
  const stageBoundsRef = useRef(new Map<Stage, StageBounds>());
  const scrollOffsetRef = useRef(0);
  const kanbanRef = useRef<View>(null);

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
      if (filter === 'all') return stageTasks;
      if (filter === 'today') return stageTasks.filter((tk) => isToday(tk.due_date));
      if (filter === 'overdue') return stageTasks.filter((tk) => isOverdue(tk.due_date));
      if (filter === 'nodate') return stageTasks.filter((tk) => !tk.due_date);
      return stageTasks;
    },
    [filter]
  );

  /** Ordered tasks per stage, with filter applied */
  const stageData = useMemo(
    () => ({
      backlog: applyFilter(
        tasks.filter((tk) => tk.stage === 'backlog' && !tk.archived_at).sort((a, b) => a.position - b.position)
      ),
      in_progress: applyFilter(
        tasks.filter((tk) => tk.stage === 'in_progress' && !tk.archived_at).sort((a, b) => a.position - b.position)
      ),
      done: applyFilter(
        tasks.filter((tk) => tk.stage === 'done' && !tk.archived_at).sort((a, b) => a.position - b.position)
      ),
    }),
    [tasks, applyFilter]
  );

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await api.updateTask(task.id, { board_id: board.id, stage: newStage });
      } catch (err) {
        Alert.alert('Could not move task', String(err));
        load();
      }
    },
    [board.id, load]
  );

  const handleDragEnd = useCallback(
    async (stage: Stage, data: Task[]) => {
      setTasks((prev) => {
        const rest = prev.filter((tk) => tk.stage !== stage || !!tk.archived_at);
        return [...rest, ...data.map((tk, idx) => ({ ...tk, position: idx }))];
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      try {
        await api.reorder(data.map((tk) => tk.id), board.id);
      } catch {
        // best-effort — reload on failure
        load();
      }
    },
    [board.id, load]
  );

  // ─── Cross-stage drag handlers ────────────────────────────────────────────

  const resolveStage = useCallback(
    (absoluteY: number): Stage | null => {
      const containerTop = (containerTopValue as any)._value ?? 0;
      const adjustedY = absoluteY - containerTop + scrollOffsetRef.current;
      return resolveStageFromBounds(adjustedY, stageBoundsRef.current);
    },
    [containerTopValue]
  );

  const handleCrossStageDragStart = useCallback(
    (task: Task, absoluteY: number) => {
      if (draggingTaskRef.current) return;
      draggingTaskRef.current = task;
      setDraggingTask(task);
      setTargetStage(null);
      ghostYValue.setValue(absoluteY);
    },
    [ghostYValue]
  );

  const handleCrossStageDragMove = useCallback(
    (absoluteY: number) => {
      ghostYValue.setValue(absoluteY);
      const stage = resolveStage(absoluteY);
      setTargetStage(stage);
    },
    [ghostYValue, resolveStage]
  );

  const handleCrossStageDragEnd = useCallback(
    async (absoluteY: number) => {
      const task = draggingTaskRef.current;
      if (!task) return;
      const stage = resolveStage(absoluteY);
      if (stage && stage !== task.stage) {
        await moveToStage(task, stage);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      draggingTaskRef.current = null;
      setDraggingTask(null);
      setTargetStage(null);
    },
    [resolveStage, moveToStage]
  );

  // ─── Draggable item renderer ─────────────────────────────────────────────────

  const renderDraggableItem = useCallback(
    (stage: Stage) =>
      ({ item, drag, isActive }: RenderItemParams<Task>) =>
        (
          <ScaleDecorator>
            <View style={[
              { marginBottom: spacing.sm },
              isActive && styles.dragging,
              !isActive && draggingTask?.id === item.id && styles.draggingSource,
            ]}>
              <TaskCard
                task={item}
                category={item.category_id ? categoriesById.get(item.category_id) : undefined}
                onPress={() => !isActive && !draggingTask && onOpenTask(item)}
                onToggleDone={() => toggleDone(item)}
                onLongPress={drag}
                delayLongPress={180}
                dragHandle={
                  <DragHandle
                    onDragStart={(y) => handleCrossStageDragStart(item, y)}
                    onDragMove={handleCrossStageDragMove}
                    onDragEnd={handleCrossStageDragEnd}
                  />
                }
              />
            </View>
          </ScaleDecorator>
        ),
    [categoriesById, onOpenTask, toggleDone, draggingTask,
     handleCrossStageDragStart, handleCrossStageDragMove, handleCrossStageDragEnd]
  );

  // ─── Stage section header ────────────────────────────────────────────────────

  const StageHeader = ({
    stage,
    label,
    isDropTarget,
  }: {
    stage: Stage;
    label: string;
    isDropTarget?: boolean;
  }) => {
    const stageColor = t.stage[stage];
    return (
      <View style={[styles.stageHeader, { backgroundColor: t.bg }]}>
        <View style={[
          styles.stageHeaderInner,
          { borderLeftColor: stageColor },
          isDropTarget && { borderLeftWidth: 4 },
        ]}>
          <View style={styles.stageTitleRow}>
            <Text style={[styles.stageTitle, { color: stageColor }]}>{label}</Text>
            <View style={[styles.stageCountBadge, { backgroundColor: stageColor + '22' }]}>
              <Text style={[styles.stageCountText, { color: stageColor }]}>
                {counts[stage]}
              </Text>
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
        {isDropTarget && (
          <View style={[styles.dropZone, { borderColor: stageColor }]}>
            <Text style={[styles.dropZoneText, { color: stageColor }]}>✦ drop here</Text>
          </View>
        )}
      </View>
    );
  };

  const keyExtractor = (item: Task) => String(item.id);

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
                {
                  backgroundColor: active ? t.accent : t.surface,
                  borderColor: active ? t.accent : t.border,
                },
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickStageRow}
        >
          {STAGES.map((s) => {
            const active = quickStage === s.key;
            const stageColor = t.stage[s.key];
            return (
              <Pressable
                key={s.key}
                onPress={() => setQuickStage(s.key)}
                style={[
                  styles.quickStagePill,
                  {
                    backgroundColor: active ? stageColor + '22' : t.surface,
                    borderColor: active ? stageColor : t.border,
                  },
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
            style={({ pressed }) => ({
              opacity: !quickText.trim() || quickSaving ? 0.35 : pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '700' }}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Kanban ─────────────────────────────────────────────────────────── */}
      <View
        ref={kanbanRef}
        style={{ flex: 1 }}
        onLayout={() => {
          kanbanRef.current?.measure((_x, _y, _w, _h, _px, py) => {
            containerTopValue.setValue(py);
          });
        }}
      >
        <NestableScrollContainer
          scrollEnabled={!draggingTask}
          onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
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
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xs,
            paddingBottom: spacing.xxl * 2,
          }}
          showsVerticalScrollIndicator={false}
        >
          {!loading && tasks.length === 0 && (
            <Text style={[styles.empty, { color: t.textMuted }]}>
              No tasks yet. Tap + to add one.
            </Text>
          )}

          {STAGES.map((s) => {
            const isDropTarget =
              !!draggingTask &&
              targetStage === s.key &&
              targetStage !== draggingTask.stage;
            return (
              <View
                key={s.key}
                testID={`stage-container-${s.key}`}
                onLayout={(e: LayoutChangeEvent) => {
                  const { y, height } = e.nativeEvent.layout;
                  stageBoundsRef.current.set(s.key, { top: y, bottom: y + height });
                }}
              >
                <StageHeader stage={s.key} label={s.label} isDropTarget={isDropTarget} />
                <NestableDraggableFlatList
                  key={`${s.key}-${stageData[s.key].length}`}
                  data={stageData[s.key]}
                  extraData={stageData[s.key]}
                  keyExtractor={keyExtractor}
                  renderItem={renderDraggableItem(s.key)}
                  onDragEnd={({ data }) => handleDragEnd(s.key, data)}
                  activationDistance={20}
                />
              </View>
            );
          })}
        </NestableScrollContainer>

        {/* Ghost card — follows finger during cross-stage drag */}
        {draggingTask && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ghost,
              { top: Animated.subtract(ghostYValue, containerTopValue) as any },
            ]}
          >
            <View style={[styles.ghostCard, { backgroundColor: t.surface, borderColor: t.accent }]}>
              <Text style={[styles.ghostText, { color: t.text }]} numberOfLines={1}>
                {draggingTask.text}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
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
  filterScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  quickAddOuter: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  quickStageRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  quickStagePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  quickInput: {
    flex: 1,
    height: 38,
    fontSize: font.size.md,
  },
  // ── Stage headers ────────────────────────────────────────────────────────────
  stageHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  stageHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
  },
  stageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stageTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stageCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  stageCountText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  dragging: { opacity: 0.9 },
  draggingSource: { opacity: 0.3 },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 6,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  dropZoneText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  ghost: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 999,
  },
  ghostCard: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    opacity: 0.92,
  },
  ghostText: {
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
  },
  empty: {
    textAlign: 'center',
    paddingTop: spacing.xxl,
    fontSize: font.size.md,
  },
});
