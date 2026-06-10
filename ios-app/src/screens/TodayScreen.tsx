// ios-app/src/screens/TodayScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable,
  SafeAreaView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@/api/client';
import type { Board, Task, TodayTask } from '@/api/types';
import { useTheme, spacing, font, radius } from '@/theme';
import { ProgressRing } from '@/components/ProgressRing';
import { TagChip } from '@/components/TagChip';
import type { Nav } from '@/navigation/types';

type Filter = 'all' | 'active' | 'done';

interface Props {
  navigation: Nav;
}

export function TodayScreen({ navigation }: Props) {
  const t = useTheme();
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const load = useCallback(async () => {
    try {
      const data = await api.todayTasks();
      setTasks(data);
    } catch (e) {
      // silently empty on 401 (AuthContext handles redirect)
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
    p === 'high' ? t.tk.prioHigh :
    p === 'medium' ? t.tk.prioMed :
    t.tk.prioLow;

  async function toggleDone(task: TodayTask) {
    const newStage = task.stage === 'done' ? 'backlog' : 'done';
    // Optimistic update
    setTasks(prev => prev.map(tk => tk.id === task.id ? { ...tk, stage: newStage } : tk));
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
    safe: { flex: 1, backgroundColor: t.tk.bg },
    scroll: { flex: 1, padding: spacing.xl },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl },
    eyebrow: { fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.8,
      textTransform: 'uppercase', color: t.tk.muted, marginBottom: 4 },
    h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: t.tk.text },
    chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99,
      backgroundColor: 'rgba(30,30,46,0.06)' },
    chipActive: { backgroundColor: t.tk.accent },
    chipLabel: { fontSize: 13, fontWeight: font.weight.semibold, color: t.tk.muted },
    chipLabelActive: { color: '#fff' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
      backgroundColor: t.tk.card, borderRadius: radius.lg, marginBottom: 10,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
    taskTitle: { fontSize: 15, fontWeight: font.weight.medium, color: t.tk.text },
    taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.55 },
    taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    dueBadge: { fontSize: 12, color: t.tk.muted },
    overdueBadge: { fontSize: 12, color: '#DC2626', fontWeight: font.weight.semibold },
    boardName: { fontSize: 11, color: t.tk.muted },
    prioDot: { width: 7, height: 7, borderRadius: 4 },
    addBtn: { marginTop: spacing.md, padding: 16, borderRadius: radius.lg,
      borderWidth: 2, borderColor: t.tk.line, borderStyle: 'dashed', alignItems: 'center' },
    addLabel: { color: t.tk.muted, fontSize: 14 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.tk.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: spacing.xl, paddingBottom: spacing.xxl },
    sheetTitle: { fontSize: 18, fontWeight: font.weight.bold, color: t.tk.text, marginBottom: spacing.lg },
    input: { borderWidth: 1, borderColor: t.tk.line, borderRadius: radius.md,
      padding: 14, fontSize: 15, color: t.tk.text, marginBottom: spacing.lg },
    submitBtn: { backgroundColor: t.tk.accent, borderRadius: radius.md, padding: 14, alignItems: 'center' },
    submitLabel: { color: '#fff', fontWeight: font.weight.bold, fontSize: 15 },
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
        <Pressable
          style={[s.check, {
            borderColor: done ? t.tk.accent : prioColor(item.priority),
            backgroundColor: done ? t.tk.accent : 'transparent',
          }]}
          onPress={() => toggleDone(item)}
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
              <Text style={s.dueBadge}>{item.due_date}</Text>
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

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        style={s.scroll}
        data={visible}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <View style={s.head}>
              <View>
                <Text style={s.eyebrow}>{dateLabel}</Text>
                <Text style={s.h1}>Today</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable onPress={() => navigation.navigate('Search')} testID="search-btn" hitSlop={8}>
                  <Text style={{ fontSize: 20, color: t.tk.muted }}>⌕</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('Notifications')} testID="bell-btn" hitSlop={8}>
                  <Text style={{ fontSize: 20, color: t.tk.muted }}>🔔</Text>
                </Pressable>
                <ProgressRing pct={pct} size={80} stroke={6} color={t.tk.accent} />
              </View>
            </View>
            <View style={s.chipRow}>
              <FilterChip mode="all" label="All" />
              <FilterChip mode="active" label="Active" />
              <FilterChip mode="done" label="Done" />
            </View>
          </>
        }
        ListFooterComponent={
          <Pressable style={s.addBtn} onPress={() => setQuickAddOpen(true)}>
            <Text style={s.addLabel}>+ Add task…</Text>
          </Pressable>
        }
      />
      <Modal visible={quickAddOpen} transparent animationType="slide"
        onRequestClose={() => setQuickAddOpen(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setQuickAddOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>New Task</Text>
            <TextInput
              style={s.input}
              placeholder="Task title…"
              placeholderTextColor={t.tk.muted}
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
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
