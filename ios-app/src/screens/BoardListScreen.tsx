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
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

export function BoardListScreen({
  onOpenBoard,
  onOpenDashboard,
  onOpenSettings,
  onOpenSearch,
}: Props) {
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
    <Screen padded={false}>
      {/* Header — matches the web app-header */}
      <View style={[styles.header, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: t.accent }]}>
            <Text style={styles.logoCheck}>✓</Text>
          </View>
          <Text style={[styles.logoText, { color: t.text }]}>Todo</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={onOpenSearch} hitSlop={12} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, { color: t.textMuted }]}>⌕</Text>
          </Pressable>
          <Pressable onPress={onOpenSettings} hitSlop={12} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, { color: t.textMuted }]}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        {/* User greeting */}
        <View style={styles.greeting}>
          <Text style={[styles.greetingSub, { color: t.textMuted }]}>
            Hi {user?.name ?? user?.username ?? 'there'} 👋
          </Text>
        </View>

        {/* Dashboard card */}
        <Pressable
          onPress={onOpenDashboard}
          style={({ pressed }) => [
            styles.dashCard,
            {
              backgroundColor: t.accentMuted,
              borderColor: t.accent + '33',
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={[styles.dashLabel, { color: t.accent }]}>Overview</Text>
          <Text style={[styles.dashTitle, { color: t.accent }]}>Dashboard →</Text>
        </Pressable>

        {/* Boards section label */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Boards</Text>

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
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: t.textMuted }]}>
                  No boards yet. Create one below.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onOpenBoard(item)}
              style={({ pressed }) => [
                styles.boardRow,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  shadowColor: '#000',
                  shadowOpacity: pressed ? 0.08 : 0.04,
                  shadowRadius: pressed ? 6 : 2,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: pressed ? 3 : 1,
                },
              ]}
            >
              <View style={[styles.boardDot, { backgroundColor: t.accent }]} />
              <Text style={[styles.boardName, { color: t.text }]}>{item.name}</Text>
              <Text style={[styles.boardChevron, { color: t.textLight }]}>›</Text>
            </Pressable>
          )}
        />

        {creating ? (
          <View style={[styles.createBox, { backgroundColor: t.surface, borderColor: t.border }]}>
            <TextField
              label="Board name"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Personal"
              autoFocus
              onSubmitEditing={createBoard}
            />
            <View style={styles.createButtons}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => { setCreating(false); setNewName(''); }}
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
      </View>

      {/* Sign out link at very bottom */}
      <Pressable onPress={() => logout()} style={styles.signOut}>
        <Text style={[styles.signOutText, { color: t.textMuted }]}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCheck: { color: '#fff', fontSize: 14, fontWeight: '700' },
  logoText: { fontSize: 16, fontWeight: '700' },
  headerRight: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 20 },
  greeting: { paddingTop: spacing.lg, paddingBottom: spacing.md },
  greetingSub: { fontSize: font.size.md },
  dashCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  dashLabel: {
    fontSize: font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    fontWeight: font.weight.semibold,
  },
  dashTitle: { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  sectionLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  boardDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  boardName: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold },
  boardChevron: { fontSize: 20 },
  emptyWrap: { paddingTop: spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: font.size.md, textAlign: 'center' },
  createBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  createButtons: { flexDirection: 'row', gap: spacing.sm },
  signOut: { alignItems: 'center', paddingBottom: spacing.xl },
  signOutText: { fontSize: font.size.sm },
});
