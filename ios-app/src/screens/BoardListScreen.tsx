import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import type { Board } from '@/api/types';

interface Props {
  onOpenBoard: (board: Board) => void;
  onOpenDashboard: () => void;
}

export function BoardListScreen({ onOpenBoard, onOpenDashboard }: Props) {
  const t = useTheme();
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api.boards();
      setBoards(list);
    } catch (err) {
      Alert.alert('Could not load boards', String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createBoard = async () => {
    if (!newName.trim()) return;
    try {
      const b = await api.createBoard(newName.trim());
      setBoards((prev) => [...prev, b]);
      setNewName('');
      setCreating(false);
    } catch (err) {
      Alert.alert('Could not create board', String(err));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: t.textMuted }]}>
            Hi {user?.name ?? user?.username ?? 'there'}
          </Text>
          <Text style={[styles.title, { color: t.text }]}>Your boards</Text>
        </View>
        <Pressable onPress={() => logout()} hitSlop={10}>
          <Text style={{ color: t.accent, fontWeight: font.weight.semibold }}>
            Sign out
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onOpenDashboard}
        style={({ pressed }) => [
          styles.dashboardCard,
          {
            backgroundColor: t.surfaceElevated,
            opacity: pressed ? 0.8 : 1,
            borderColor: t.border,
          },
        ]}
      >
        <Text style={[styles.dashboardLabel, { color: t.textMuted }]}>
          Overview
        </Text>
        <Text style={[styles.dashboardTitle, { color: t.text }]}>
          Dashboard →
        </Text>
      </Pressable>

      <FlatList
        data={boards}
        keyExtractor={(b) => String(b.id)}
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
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          !loading ? (
            <Text style={[styles.empty, { color: t.textMuted }]}>
              No boards yet. Create your first one below.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenBoard(item)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.rowTitle, { color: t.text }]}>
              {item.name}
            </Text>
            <Text style={{ color: t.textMuted }}>›</Text>
          </Pressable>
        )}
      />

      {creating ? (
        <View style={styles.createBox}>
          <TextField
            label="Board name"
            value={newName}
            onChangeText={setNewName}
            autoFocus
            placeholder="e.g. Personal"
          />
          <View style={styles.createButtons}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setCreating(false);
                setNewName('');
              }}
              style={{ flex: 1 }}
            />
            <Button
              label="Create"
              onPress={createBoard}
              disabled={!newName.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <Button
          label="+ New board"
          onPress={() => setCreating(true)}
          style={{ marginBottom: spacing.lg }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  greeting: { fontSize: font.size.sm },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  dashboardCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  dashboardLabel: {
    fontSize: font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  dashboardTitle: { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xxl,
    fontSize: font.size.md,
  },
  createBox: { marginBottom: spacing.lg },
  createButtons: { flexDirection: 'row', gap: spacing.sm },
});
