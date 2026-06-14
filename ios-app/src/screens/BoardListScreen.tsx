import React, { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SectionCard } from '@/components/SectionCard';
import { ListRow } from '@/components/ListRow';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { useTheme, spacing, font } from '@/theme';
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
  const { logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [memberships, setMemberships] = useState<MemberBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    setError(null);
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
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
          Alert.prompt(
            'Rename board',
            'Enter a new name:',
            async (renamed: string) => {
              if (!renamed?.trim()) return;
              try {
                const updated = await api.renameBoard(item.id, renamed.trim());
                setBoards((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
              } catch (err) {
                Alert.alert('Could not rename board', String(err));
              }
            },
            'plain-text',
            item.name
          );
        } else if (idx === 1) {
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

  const hasShared = memberships.length > 0;
  const isEmpty = !loading && !error && boards.length === 0 && !hasShared;

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={styles.headerWrap}>
        <ScreenHeader
          variant="primary"
          title="Boards"
          actions={
            <>
              <Icon name="search" label="Search" onPress={openSearch} />
              <View>
                <Icon
                  name="bell"
                  label="Notifications"
                  onPress={openNotifications}
                />
                {unreadCount > 0 && (
                  <View
                    style={[styles.badge, { backgroundColor: t.danger }]}
                    pointerEvents="none"
                  >
                    <Text style={styles.badgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Icon name="settings" label="Settings" onPress={openSettings} />
            </>
          }
        />
      </View>

      <ScreenState
        loading={loading && boards.length === 0 && !hasShared}
        error={error}
        onRetry={() => { setLoading(true); load(); }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
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
          contentContainerStyle={styles.scrollContent}
        >
          {/* Dashboard entry */}
          <Card onPress={openDashboard} style={styles.dashCard}>
            <Text style={[styles.dashEyebrow, { color: t.accent }]}>OVERVIEW</Text>
            <Text style={[styles.dashTitle, { color: t.accent }]}>Dashboard →</Text>
          </Card>

          {/* My Boards */}
          <SectionCard eyebrow={hasShared ? 'My Boards' : 'Boards'} style={styles.section}>
            {boards.map((b, i) => (
              <ListRow
                key={b.id}
                testID={`board-row-${b.id}`}
                title={b.name}
                leading={<View style={[styles.boardDot, { backgroundColor: t.accent }]} />}
                accessory="chevron"
                divider={i < boards.length - 1}
                onPress={() => openBoard(b)}
                onLongPress={() => handleBoardLongPress(b)}
                accessibilityHint="Long press to rename or delete"
              />
            ))}
            {boards.length === 0 && !creating && (
              <ListRow
                title="No boards yet"
                divider={false}
              />
            )}
          </SectionCard>

          {/* + New board */}
          {creating ? (
            <Card style={styles.createCard}>
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
            </Card>
          ) : (
            <Button
              label="+ New board"
              onPress={() => setCreating(true)}
              style={styles.newBoardBtn}
            />
          )}

          {/* Shared with me */}
          {hasShared && (
            <SectionCard eyebrow="Shared with me" style={styles.section}>
              {memberships.map((b, i) => (
                <ListRow
                  key={b.id}
                  testID={`board-row-${b.id}`}
                  title={b.name}
                  subtitle={b.owner_username || b.owner_email}
                  leading={<View style={[styles.boardDot, { backgroundColor: t.textMuted }]} />}
                  accessory="chevron"
                  divider={i < memberships.length - 1}
                  onPress={() => openBoard(b)}
                />
              ))}
            </SectionCard>
          )}

          {/* Sign out */}
          <SectionCard style={styles.section}>
            <ListRow
              title="Sign out"
              destructive
              divider={false}
              onPress={() => logout()}
            />
          </SectionCard>
        </ScrollView>
      </ScreenState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingTop: spacing.lg,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  dashCard: {
    marginBottom: spacing.lg,
  },
  dashEyebrow: {
    fontSize: font.size.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  dashTitle: {
    fontSize: font.size.lg,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.lg,
  },
  boardDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  newBoardBtn: {
    marginBottom: spacing.lg,
  },
  createCard: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  createButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
