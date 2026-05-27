import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import type { Board, Task } from '@/api/types';

interface Props {
  board: Board;
  onBack: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ArchivedScreen({ board, onBack }: Props) {
  const t = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const ts = await api.archivedTasks(board.id);
      setTasks(ts);
    } catch (err) {
      Alert.alert('Could not load archived tasks', String(err));
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

  const restore = (task: Task) => {
    Alert.alert('Restore task?', `"${task.text}" will move back to ${task.stage.replace('_', ' ')}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            await api.updateTask(task.id, { board_id: board.id, archived: false });
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } catch (err) {
            Alert.alert('Could not restore task', String(err));
          }
        },
      },
    ]);
  };

  const remove = (task: Task) => {
    Alert.alert('Delete permanently?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(task.id, board.id);
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          } catch (err) {
            Alert.alert('Could not delete task', String(err));
          }
        },
      },
    ]);
  };

  const stageLabel = (stage: string) =>
    stage === 'in_progress' ? 'In Progress' : stage.charAt(0).toUpperCase() + stage.slice(1);

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={[styles.topBar, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Archived</Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
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
          paddingTop: spacing.md,
          paddingBottom: spacing.xxl * 2,
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: t.text }]}>Nothing archived</Text>
              <Text style={[styles.emptyBody, { color: t.textMuted }]}>
                Tasks archived from the board or auto-archived after completion will appear here.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.cardMain}>
              <Text style={[styles.cardText, { color: t.textMuted }]} numberOfLines={2}>
                {item.text}
              </Text>
              <View style={styles.cardMeta}>
                <View style={[styles.stageBadge, { backgroundColor: t.surfaceElevated }]}>
                  <Text style={[styles.stageBadgeText, { color: t.textMuted }]}>
                    {stageLabel(item.stage)}
                  </Text>
                </View>
                {item.archived_at && (
                  <Text style={[styles.archivedDate, { color: t.textLight }]}>
                    Archived {formatDate(item.archived_at)}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                onPress={() => restore(item)}
                style={[styles.actionBtn, { backgroundColor: t.accentMuted, borderColor: t.accent + '44' }]}
              >
                <Text style={{ color: t.accent, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                  Restore
                </Text>
              </Pressable>
              <Pressable
                onPress={() => remove(item)}
                style={[styles.actionBtn, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
              >
                <Text style={{ color: t.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        )}
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
  headerTitle: {
    fontSize: font.size.md,
    fontWeight: font.weight.bold,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardMain: { gap: spacing.xs },
  cardText: {
    fontSize: font.size.md,
    lineHeight: 20,
    textDecorationLine: 'line-through',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  stageBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  stageBadgeText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  archivedDate: { fontSize: font.size.xs },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingTop: spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  emptyBody: { fontSize: font.size.md, textAlign: 'center', lineHeight: 22 },
});
