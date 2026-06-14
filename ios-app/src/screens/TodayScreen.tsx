// ios-app/src/screens/TodayScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { api } from '@/api/client';
import type { Board, Task, TodayTask } from '@/api/types';
import { useTheme, spacing, font, radius } from '@/theme';
import { ProgressRing } from '@/components/ProgressRing';
import { TagChip } from '@/components/TagChip';
import { Icon } from '@/components/Icon';
import { Checkbox } from '@/components/Checkbox';
import { ScreenState } from '@/components/ScreenState';
import type { Nav } from '@/navigation/types';

type Filter = 'all' | 'active' | 'done';

interface Props {
  navigation: Nav;
}

function friendlyDate(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const d = new Date(iso + 'T00:00:00');
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TodayScreen({ navigation }: Props) {
  const t = useTheme();
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.todayTasks();
      setTasks(data);
    } catch (e) {
      setError('Could not load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dueToday = tasks.filter(tk => tk.due_date === todayStr);
  const doneToday = dueToday.filter(tk => tk.stage === 'done').length;
  const pct = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0;

  const visible = tasks.filter(task =>
    filter === 'all' ? true :
    filter === 'done' ? task.stage === 'done' :
    task.stage !== 'done'
  );

  const prioColor = (p: string) =>
    p === 'high' ? t.priority.high :
    p === 'medium' ? t.priority.medium :
    t.priority.low;

  async function toggleDone(task: TodayTask) {
    const newStage = task.stage === 'done' ? 'backlog' : 'done';
    // Optimistic update
    setTasks(prev => prev.map(tk => tk.id === task.id ? { ...tk, stage: newStage } : tk));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.updateTask(task.id, { board_id: task.board_id, stage: newStage });
    } catch {
      // Revert
      setTasks(prev => prev.map(tk => tk.id === task.id ? { ...tk, stage: task.stage } : tk));
      Alert.alert('Error', 'Could not update task.');
    }
  }

  async function submitQuickAdd() {
    const text = quickAddText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      // Get first owned board to post to
      const boards = await api.boards();
      const boardId = boards[0]?.id;
      if (!boardId) { Alert.alert('No board found'); return; }
      await api.createTask({ text, board_id: boardId, stage: 'backlog', due_date: todayStr });
      setQuickAddOpen(false);
      setQuickAddText('');
      load();
    } catch {
      Alert.alert('Error', 'Could not create task.');
    } finally {
      setSubmitting(false);
    }
  }

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    scroll: { flex: 1, padding: spacing.xl },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl },
    eyebrow: { fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.8,
      textTransform: 'uppercase', color: t.textMuted, marginBottom: 4 },
    h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: t.text },
    chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99,
      backgroundColor: 'rgba(30,30,46,0.06)' },
    chipActive: { backgroundColor: t.accent },
    chipLabel: { fontSize: 13, fontWeight: font.weight.semibold, color: t.textMuted },
    chipLabelActive: { color: '#fff' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
      backgroundColor: t.surface, borderRadius: radius.lg, marginBottom: 10,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    taskTitle: { fontSize: 15, fontWeight: font.weight.medium, color: t.text },
    taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.55 },
    taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    dueBadge: { fontSize: 12, color: t.textMuted },
    overdueBadge: { fontSize: 12, color: '#DC2626', fontWeight: font.weight.semibold },
    boardName: { fontSize: 11, color: t.textMuted },
    prioDot: { width: 7, height: 7, borderRadius: 4 },
    addBtn: { marginTop: spacing.md, padding: 16, borderRadius: radius.lg,
      borderWidth: 2, borderColor: t.border, borderStyle: 'dashed', alignItems: 'center' },
    addLabel: { color: t.textMuted, fontSize: 14 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: spacing.xl, paddingBottom: spacing.xxl },
    sheetTitle: { fontSize: 18, fontWeight: font.weight.bold, color: t.text, marginBottom: spacing.lg },
    input: { borderWidth: 1, borderColor: t.border, borderRadius: radius.md,
      padding: 14, fontSize: 15, color: t.text, marginBottom: spacing.lg },
    submitBtn: { backgroundColor: t.accent, borderRadius: radius.md, padding: 14, alignItems: 'center' },
    submitLabel: { color: '#fff', fontWeight: font.weight.bold, fontSize: 15 },
    listContent: { flexGrow: 1 },
  });

  const renderItem = ({ item }: { item: TodayTask }) => {
    const done = item.stage === 'done';
    const overdue = !done && item.due_date && item.due_date < todayStr;

    // Construct minimal Board/Task shapes required by TaskDetailScreen.
    // board.id is all TaskDetailScreen needs (for api.categories); owner_user_id/slug
    // are not used by that screen so we set safe placeholder values.
    const board: Board = { id: item.board_id, owner_user_id: 0, name: item.board_name, slug: '' };
    const task: Task = {
      id: item.id,
      text: item.text,
      stage: item.stage,
      priority: item.priority,
      status: item.status,
      due_date: item.due_date ?? null,
      board_id: item.board_id,
      category_id: item.category_id,
      recurrence: item.recurrence,
      subtasks: item.subtasks,
      assigned_to_user_id: item.assigned_to_user_id,
      cal_start: item.cal_start,
      cal_end: item.cal_end,
      archived_at: null,
      completed_at: item.completed_at,
      position: 0,
    };

    return (
      <View style={s.row}>
        <Checkbox
          checked={done}
          onToggle={() => toggleDone(item)}
          color={prioColor(item.priority)}
          testID={`check-${item.id}`}
        />
        <Pressable
          style={{ flex: 1 }}
          onPress={() => navigation.navigate('TaskDetail', { board, task })}
          testID={`row-${item.id}`}
        >
          <Text style={[s.taskTitle, done && s.taskTitleDone]}>{item.text}</Text>
          <View style={s.taskMeta}>
            {overdue ? (
              <Text style={s.overdueBadge} testID={`overdue-badge-${item.id}`}>Overdue</Text>
            ) : item.due_date ? (
              <Text style={s.dueBadge}>{friendlyDate(item.due_date)}</Text>
            ) : null}
            {item.cat_name && <TagChip name={item.cat_name} color={item.cat_color ?? '#9CA3AF'} />}
            <Text style={s.boardName}>{item.board_name}</Text>
          </View>
        </Pressable>
        <View style={[s.prioDot, { backgroundColor: prioColor(item.priority) }]} />
      </View>
    );
  };

  const FilterChip = ({ mode, label }: { mode: Filter; label: string }) => (
    <Pressable style={[s.chip, filter === mode && s.chipActive]} onPress={() => setFilter(mode)}>
      <Text style={[s.chipLabel, filter === mode && s.chipLabelActive]}>{label}</Text>
    </Pressable>
  );

  const listHeader = (
    <>
      <View style={s.head}>
        <View>
          <Text style={s.eyebrow}>{dateLabel}</Text>
          <Text style={s.h1}>Today</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon
            name="search"
            label="Search"
            onPress={() => navigation.navigate('Search')}
          />
          <Icon
            name="bell"
            label="Notifications"
            onPress={() => navigation.navigate('Notifications')}
          />
          <ProgressRing pct={pct} size={80} stroke={6} color={t.accent} />
        </View>
      </View>
      <View style={s.chipRow}>
        <FilterChip mode="all" label="All" />
        <FilterChip mode="active" label="Active" />
        <FilterChip mode="done" label="Done" />
      </View>
    </>
  );

  const listFooter = (
    <Pressable style={s.addBtn} onPress={() => setQuickAddOpen(true)}>
      <Text style={s.addLabel}>+ Add task…</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScreenState
        loading={loading}
        error={error}
        onRetry={load}
      >
        <FlatList
          style={s.scroll}
          contentContainerStyle={s.listContent}
          data={visible}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: t.textMuted, marginTop: spacing.xl }}>
              Nothing for today 🎉
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={t.accent}
            />
          }
        />
      </ScreenState>
      <Modal visible={quickAddOpen} transparent animationType="slide"
        onRequestClose={() => setQuickAddOpen(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setQuickAddOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>New Task</Text>
              <TextInput
                style={s.input}
                placeholder="Task title…"
                placeholderTextColor={t.textMuted}
                value={quickAddText}
                onChangeText={setQuickAddText}
                onSubmitEditing={submitQuickAdd}
                returnKeyType="done"
                autoFocus
              />
              <Pressable style={s.submitBtn} onPress={submitQuickAdd} disabled={submitting}>
                <Text style={s.submitLabel}>{submitting ? 'Adding…' : 'Add Task'}</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
