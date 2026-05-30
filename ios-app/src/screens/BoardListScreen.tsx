import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import type { Board, MemberBoard } from '@/api/types';
import type { Nav } from '@/navigation/types';

interface Props {
  onOpenBoard?: (board: Board) => void;
  onOpenDashboard?: () => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
  onOpenNotifications?: () => void;
}

export function BoardListScreen({
  onOpenBoard,
  onOpenDashboard,
  onOpenSettings,
  onOpenSearch,
  onOpenNotifications,
}: Props) {
  const nav = useNavigation<Nav>();
  const openBoard = onOpenBoard ?? ((board: Board) => nav.navigate('Board', { board }));
  const openDashboard = onOpenDashboard ?? (() => {});  // no Dashboard in new nav; no-op
  const openSettings = onOpenSettings ?? (() => nav.navigate('Settings'));
  const openSearch = onOpenSearch ?? (() => nav.navigate('Search'));
  const openNotifications = onOpenNotifications ?? (() => nav.navigate('Notifications'));
  const t = useTheme();
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [memberships, setMemberships] = useState<MemberBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [owned, shared, notifs] = await Promise.all([
        api.boards(),
        api.memberships().catch(() => [] as MemberBoard[]),
        api.notifications().catch(() => []),
      ]);
      setBoards(owned);
      setMemberships(shared);
      setUnreadCount(notifs.filter((n) => !n.read).length);
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

  const handleBoardLongPress = (item: Board) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: item.name,
        options: ['Rename', 'Delete', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (idx) => {
        if (idx === 0) {
          // Rename
          Alert.prompt(
            'Rename board',
            'Enter a new name:',
            async (newName: string) => {
              if (!newName?.trim()) return;
              try {
                const updated = await api.renameBoard(item.id, newName.trim());
                setBoards((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
              } catch (err) {
                Alert.alert('Could not rename board', String(err));
              }
            },
            'plain-text',
            item.name
          );
        } else if (idx === 1) {
          // Delete
          Alert.alert(
            `Delete "${item.name}"?`,
            'All tasks on this board will be permanently deleted.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api.deleteBoard(item.id);
                    setBoards((prev) => prev.filter((b) => b.id !== item.id));
                  } catch (err) {
                    Alert.alert('Could not delete board', String(err));
                  }
                },
              },
            ]
          );
        }
      }
    );
  };

  const renderBoardRow = (item: Board, shared?: MemberBoard) => (
    <Pressable
      key={item.id}
      testID={`board-row-${item.id}`}
      onPress={() => openBoard(item)}
      onLongPress={() => !shared && handleBoardLongPress(item)}
      delayLongPress={400}
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
      <View style={{ flex: 1 }}>
        <Text style={[styles.boardName, { color: t.text }]}>{item.name}</Text>
        {shared && (
          <Text style={[styles.boardOwner, { color: t.textMuted }]}>
            {shared.owner_username || shared.owner_email}
          </Text>
        )}
      </View>
      <Text style={[styles.boardChevron, { color: t.textLight }]}>›</Text>
    </Pressable>
  );

  const hasShared = memberships.length > 0;

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: t.accent }]}>
            <Text style={styles.logoCheck}>✓</Text>
          </View>
          <Text style={[styles.logoText, { color: t.text }]}>Todo</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={openSearch} hitSlop={12} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, { color: t.textMuted }]}>⌕</Text>
          </Pressable>
          <Pressable onPress={openNotifications} hitSlop={12} style={styles.iconBtn}>
            <View>
              <Text style={[styles.iconBtnText, { color: t.textMuted }]}>🔔</Text>
              {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: t.danger }]}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
          <Pressable onPress={openSettings} hitSlop={12} style={styles.iconBtn}>
            <Text style={[styles.iconBtnText, { color: t.textMuted }]}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={[]}
        keyExtractor={() => '__placeholder__'}
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        ListHeaderComponent={
          <>
            {/* User greeting */}
            <View style={styles.greeting}>
              <Text style={[styles.greetingSub, { color: t.textMuted }]}>
                Hi {user?.name ?? user?.username ?? 'there'} 👋
              </Text>
            </View>

            {/* Dashboard card */}
            <Pressable
              onPress={openDashboard}
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

            {/* My Boards */}
            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>
              {hasShared ? 'My Boards' : 'Boards'}
            </Text>

            {boards.length === 0 && !loading && (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: t.textMuted }]}>
                  No boards yet. Create one below.
                </Text>
              </View>
            )}

            {boards.map((b) => (
              <View key={b.id} style={{ marginBottom: spacing.sm }}>
                {renderBoardRow(b)}
              </View>
            ))}

            {/* Create board form / button */}
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

            {/* Shared with me section */}
            {hasShared && (
              <>
                <View style={[styles.sectionDivider, { borderTopColor: t.border }]} />
                <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Shared with me</Text>
                {memberships.map((b) => (
                  <View key={b.id} style={{ marginBottom: spacing.sm }}>
                    {renderBoardRow(b, b)}
                  </View>
                ))}
              </>
            )}
          </>
        }
        renderItem={() => null}
      />

      {/* Sign out */}
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
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
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
  sectionDivider: {
    borderTopWidth: 1,
    marginVertical: spacing.lg,
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
  boardName: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  boardOwner: { fontSize: font.size.xs, marginTop: 2 },
  boardChevron: { fontSize: 20 },
  emptyWrap: { paddingTop: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center' },
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
