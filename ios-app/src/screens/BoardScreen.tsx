import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { TaskCard } from '@/components/TaskCard';
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

interface KanbanSection {
  stage: Stage;
  label: string;
  data: Task[];
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
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickStage, setQuickStage] = useState<Stage>('backlog');
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

  /** Apply the active filter to a set of stage tasks */
  const applyFilter = useCallback(
    (stageTasks: Task[]) => {
      if (filter === 'all') return stageTasks;
      if (filter === 'today') return stageTasks.filter((t) => isToday(t.due_date));
      if (filter === 'overdue') return stageTasks.filter((t) => isOverdue(t.due_date));
      if (filter === 'nodate') return stageTasks.filter((t) => !t.due_date);
      return stageTasks;
    },
    [filter]
  );

  const sections: KanbanSection[] = useMemo(
    () =>
      STAGES.map((s) => ({
        stage: s.key,
        label: s.label,
        data: applyFilter(
          tasks
            .filter((task) => task.stage === s.key && !task.archived_at)
            .sort((a, b) => a.position - b.position)
        ),
      })),
    [tasks, applyFilter]
  );

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { backlog: 0, in_progress: 0, done: 0 };
    tasks.forEach((task) => {
      if (!task.archived_at) c[task.stage] = (c[task.stage] ?? 0) + 1;
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
    },
    [board.id, load]
  );

  const moveToStage = useCallback(
    async (task: Task, newStage: Stage) => {
      if (task.stage === newStage) return;
      setTasks((prev) =>
        prev.map((u) => (u.id === task.id ? { ...u, stage: newStage } : u))
      );
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

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <View style={{ marginBottom: spacing.sm }}>
        <TaskCard
          task={item}
          category={item.category_id ? categoriesById.get(item.category_id) : undefined}
          onPress={() => onOpenTask(item)}
          onToggleDone={() => toggleDone(item)}
          onMoveToStage={(stage) => moveToStage(item, stage)}
        />
      </View>
    ),
    [categoriesById, onOpenTask, toggleDone, moveToStage]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: KanbanSection }) => {
      const stageColor = t.stage[section.stage];
      return (
        <View style={[styles.sectionHeader, { backgroundColor: t.bg }]}>
          <View
            style={[styles.sectionHeaderInner, { borderLeftColor: stageColor }]}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: stageColor }]}>
                {section.label}
              </Text>
              <View
                style={[
                  styles.sectionCountBadge,
                  { backgroundColor: stageColor + '22' },
                ]}
              >
                <Text style={[styles.sectionCountText, { color: stageColor }]}>
                  {counts[section.stage]}
                </Text>
              </View>
            </View>
            {/* Tap + to focus the quick-add input and target this stage */}
            <Pressable
              onPress={() => {
                setQuickStage(section.stage);
                quickInputRef.current?.focus();
              }}
              hitSlop={10}
            >
              <Text
                style={{ color: stageColor, fontSize: font.size.lg, fontWeight: '700' }}
              >
                +
              </Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [t, counts]
  );

  const renderSectionFooter = () => (
    <View style={{ height: spacing.lg }} />
  );

  const keyExtractor = useCallback((item: Task) => String(item.id), []);

  return (
    <Screen padded={false}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
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

      {/* ── Quick-add bar ────────────────────────────────────────────────── */}
      <View
        style={[
          styles.quickAddOuter,
          { backgroundColor: t.bg, borderBottomColor: t.border },
        ]}
      >
        {/* Stage target selector */}
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
                <Text
                  style={{
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    color: active ? stageColor : t.textMuted,
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Text input + send */}
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
            <Text style={{ color: t.accent, fontSize: font.size.lg, fontWeight: '700' }}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Kanban SectionList ───────────────────────────────────────────── */}
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xs,
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
              No tasks yet. Tap + to add one.
            </Text>
          ) : null
        }
        initialNumToRender={30}
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
  // ── Kanban section headers ─────────────────────────────────────────────────
  sectionHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  sectionCountText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  empty: {
    textAlign: 'center',
    paddingTop: spacing.xxl,
    fontSize: font.size.md,
  },
});
