import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { TaskCard } from '@/components/TaskCard';
import { Button } from '@/components/Button';
import { useTheme, radius, spacing, font } from '@/theme';
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

const STAGE_EMPTY: Record<Stage, string> = {
  backlog: 'Nothing here yet. Tap + Add task below.',
  in_progress: 'Drag a backlog task here when you start it.',
  done: 'Tasks you complete will land here.',
};

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
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
}

export function BoardScreen({ board, onBack, onOpenTask }: Props) {
  const t = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stage, setStage] = useState<Stage>('backlog');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const quickInputRef = useRef<TextInput | null>(null);

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

  const stageTasks = useMemo(() => {
    const base = tasks
      .filter((task) => task.stage === stage && !task.archived_at)
      .sort((a, b) => a.position - b.position);

    if (filter === 'all') return base;
    if (filter === 'today') return base.filter((t) => isToday(t.due_date));
    if (filter === 'overdue') return base.filter((t) => isOverdue(t.due_date));
    if (filter === 'nodate') return base.filter((t) => !t.due_date);
    return base;
  }, [tasks, stage, filter]);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { backlog: 0, in_progress: 0, done: 0 };
    tasks.forEach((task) => {
      if (!task.archived_at) c[task.stage] = (c[task.stage] ?? 0) + 1;
    });
    return c;
  }, [tasks]);

  const submitQuickAdd = async () => {
    const text = quickText.trim();
    if (!text || quickSaving) return;
    setQuickSaving(true);
    try {
      const created = await api.createTask({
        board_id: board.id,
        text,
        stage,
      });
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

  const toggleDone = async (task: Task) => {
    const newStage: Stage = task.stage === 'done' ? 'backlog' : 'done';
    setTasks((prev) =>
      prev.map((u) => (u.id === task.id ? { ...u, stage: newStage } : u))
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.updateTask(task.id, { board_id: board.id, stage: newStage });
    } catch (err) {
      Alert.alert('Could not update task', String(err));
      load();
    }
  };

  const onDragEnd = async ({ data }: { data: Task[] }) => {
    const orderedIds = data.map((task) => task.id);
    setTasks((prev) => {
      const newPosition = new Map(data.map((task, idx) => [task.id, idx]));
      return prev.map((task) =>
        newPosition.has(task.id)
          ? { ...task, position: newPosition.get(task.id)! }
          : task
      );
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await api.reorder(orderedIds, board.id);
    } catch (err) {
      Alert.alert('Could not reorder', String(err));
      load();
    }
  };

  const renderTask = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Task>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          disabled={isActive}
          delayLongPress={150}
          style={{ marginBottom: spacing.sm }}
        >
          <TaskCard
            task={item}
            category={
              item.category_id ? categoriesById.get(item.category_id) : undefined
            }
            onPress={() => onOpenTask(item)}
            onToggleDone={() => toggleDone(item)}
          />
        </Pressable>
      </ScaleDecorator>
    ),
    [categoriesById, onOpenTask]
  );

  return (
    <Screen padded={false}>
      {/* Header */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: t.surface, borderBottomColor: t.border },
        ]}
      >
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Boards</Text>
        </Pressable>
        <Text style={[styles.boardName, { color: t.text }]} numberOfLines={1}>
          {board.name}
        </Text>
        <Pressable onPress={() => onOpenTask(null)} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '600' }}>
            +
          </Text>
        </Pressable>
      </View>

      {/* Stage tabs */}
      <View style={[styles.stageBar, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stageScroll}
        >
          {STAGES.map((s) => {
            const active = s.key === stage;
            return (
              <Pressable
                key={s.key}
                onPress={() => { setStage(s.key); setFilter('all'); }}
                style={[
                  styles.stageTab,
                  active && { borderBottomColor: t.stage[s.key], borderBottomWidth: 2 },
                ]}
              >
                <Text
                  style={[
                    styles.stageTabText,
                    { color: active ? t.stage[s.key] : t.textMuted, fontWeight: active ? font.weight.semibold : font.weight.regular },
                  ]}
                >
                  {s.label}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    { backgroundColor: active ? t.stage[s.key] + '22' : t.surfaceElevated },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: font.size.xs,
                      color: active ? t.stage[s.key] : t.textMuted,
                      fontWeight: font.weight.semibold,
                    }}
                  >
                    {counts[s.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Filter pills — matches the web's filter row */}
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
              <Text
                style={{
                  fontSize: font.size.sm,
                  fontWeight: font.weight.medium,
                  color: active ? '#fff' : t.textMuted,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Quick-add input */}
      <View style={[styles.quickAddWrap, { paddingHorizontal: spacing.lg }]}>
        <View
          style={[
            styles.quickAddRow,
            { backgroundColor: t.surface, borderColor: t.border },
          ]}
        >
          <TextInput
            ref={quickInputRef}
            value={quickText}
            onChangeText={setQuickText}
            onSubmitEditing={submitQuickAdd}
            placeholder={`Quick-add to ${STAGES.find((s) => s.key === stage)?.label ?? ''}`}
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
            <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '700' }}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Task list */}
      <DraggableFlatList
        data={stageTasks}
        keyExtractor={(task) => String(task.id)}
        onDragEnd={onDragEnd}
        activationDistance={10}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xxl * 2,
        }}
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
        ListEmptyComponent={
          !loading ? (
            <Text style={[styles.empty, { color: t.textMuted }]}>
              {filter !== 'all'
                ? 'No tasks match this filter.'
                : STAGE_EMPTY[stage]}
            </Text>
          ) : null
        }
        renderItem={renderTask}
      />
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
  stageBar: {
    borderBottomWidth: 1,
  },
  stageScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  stageTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: -1, // sit on the border
  },
  stageTabText: {
    fontSize: font.size.md,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  filterBar: {
    flexGrow: 0,
    paddingVertical: spacing.sm,
  },
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
  quickAddWrap: { marginBottom: spacing.sm },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  quickInput: {
    flex: 1,
    height: 40,
    fontSize: font.size.md,
  },
  empty: {
    textAlign: 'center',
    paddingTop: spacing.xxl,
    fontSize: font.size.md,
  },
});
