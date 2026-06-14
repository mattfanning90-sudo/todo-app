import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { Nav, BoardStackParams } from '@/navigation/types';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useTheme, spacing, font } from '@/theme';
import { api } from '@/api/client';
import type { Board, Task } from '@/api/types';

interface Props {
  board?: Board;
  onBack?: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function stageLabel(stage: string): string {
  return stage === 'in_progress' ? 'In Progress' : stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function ArchivedScreen({ board: boardProp, onBack }: Props) {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<BoardStackParams, 'Archived'>>();
  const board = boardProp ?? route.params?.board;
  const goBack = onBack ?? (() => nav.goBack());
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

  const stageColor = (stage: string): string => {
    if (stage === 'in_progress') return t.stage.in_progress;
    if (stage === 'done') return t.stage.done;
    return t.stage.backlog;
  };

  return (
    <Screen padded={false}>
      <ScreenHeader variant="detail" title="Archived" onBack={goBack} />

      <ScreenState loading={loading}>
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
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: t.textMuted }]}>Nothing archived</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = stageColor(item.stage);
            const badgeBg = color + '20';
            return (
              <Card padded>
                {/* Title with strikethrough */}
                <Text style={[styles.taskTitle, { color: t.textMuted }]} numberOfLines={2}>
                  {item.text}
                </Text>

                {/* Meta row: stage badge + archived date */}
                <View style={styles.metaRow}>
                  <View style={[styles.stageBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.stageBadgeText, { color }]}>
                      {stageLabel(item.stage)}
                    </Text>
                  </View>
                  {item.archived_at ? (
                    <Text style={[styles.archivedDate, { color: t.textLight }]}>
                      Archived {formatDate(item.archived_at)}
                    </Text>
                  ) : null}
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                  <Button
                    label="Restore"
                    variant="secondary"
                    onPress={() => restore(item)}
                    style={{ flex: 1, height: 44, backgroundColor: t.accentMuted, borderColor: t.accent + '44', borderWidth: 1 }}
                  />
                  <Button
                    label="Delete"
                    variant="destructive"
                    onPress={() => remove(item)}
                    style={{ flex: 1, height: 44 }}
                  />
                </View>
              </Card>
            );
          }}
        />
      </ScreenState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  taskTitle: {
    fontSize: font.size.md,
    lineHeight: 20,
    textDecorationLine: 'line-through',
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  stageBadgeText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  archivedDate: {
    fontSize: font.size.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl * 2,
  },
  emptyText: {
    fontSize: font.size.md,
    textAlign: 'center',
  },
});
