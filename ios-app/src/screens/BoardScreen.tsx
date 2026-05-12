import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  { key: 'progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ts, cs] = await Promise.all([
        api.tasks(board.id),
        api.categories(),
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

  const stageTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.stage === stage && !task.archived_at)
        .sort((a, b) => a.position - b.position),
    [tasks, stage]
  );

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { backlog: 0, progress: 0, done: 0 };
    tasks.forEach((task) => {
      if (!task.archived_at) c[task.stage] = (c[task.stage] ?? 0) + 1;
    });
    return c;
  }, [tasks]);

  const toggleDone = async (task: Task) => {
    const newStage: Stage = task.stage === 'done' ? 'backlog' : 'done';
    setTasks((prev) =>
      prev.map((u) => (u.id === task.id ? { ...u, stage: newStage } : u))
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.updateTask(task.id, { stage: newStage });
    } catch (err) {
      Alert.alert('Could not update task', String(err));
      load();
    }
  };

  return (
    <Screen padded={false}>
      <View style={[styles.topBar, { paddingHorizontal: spacing.lg }]}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
            ‹ Boards
          </Text>
        </Pressable>
        <Text style={[styles.boardName, { color: t.text }]}>{board.name}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stageStripContent}
        style={styles.stageStrip}
      >
        {STAGES.map((s) => {
          const active = s.key === stage;
          return (
            <Pressable
              key={s.key}
              onPress={() => setStage(s.key)}
              style={[
                styles.stagePill,
                {
                  backgroundColor: active ? t.stage[s.key] : t.surface,
                  borderColor: active ? t.stage[s.key] : t.border,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? '#fff' : t.text,
                  fontWeight: font.weight.semibold,
                }}
              >
                {s.label}
              </Text>
              <Text
                style={{
                  color: active ? '#fff' : t.textMuted,
                  marginLeft: spacing.xs,
                }}
              >
                {counts[s.key]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={stageTasks}
        keyExtractor={(task) => String(task.id)}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl * 2,
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
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
              Nothing here. Tap + to add a task.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            category={
              item.category_id ? categoriesById.get(item.category_id) : undefined
            }
            onPress={() => onOpenTask(item)}
            onToggleDone={() => toggleDone(item)}
          />
        )}
      />

      <View style={[styles.fabWrap, { paddingHorizontal: spacing.lg }]}>
        <Button label="+ Add task" onPress={() => onOpenTask(null)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  boardName: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  stageStrip: { flexGrow: 0, marginBottom: spacing.md },
  stageStripContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  empty: { textAlign: 'center', paddingVertical: spacing.xxl },
  fabWrap: {
    position: 'absolute',
    bottom: spacing.lg,
    left: 0,
    right: 0,
  },
});
