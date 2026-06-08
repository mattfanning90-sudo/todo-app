import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { Nav, BoardStackParams } from '@/navigation/types';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import type { Board, BoardInvite, BoardMember } from '@/api/types';

interface Props {
  board?: Board;
  onBack?: () => void;
}

export function BoardMembersScreen({ board: boardProp, onBack }: Props) {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<BoardStackParams, 'BoardMembers'>>();
  const board = boardProp ?? route.params?.board;
  const goBack = onBack ?? (() => nav.goBack());
  const t = useTheme();
  const { user } = useAuth();
  const isOwner = user?.id === board.owner_user_id;

  const [members, setMembers] = useState<BoardMember[]>([]);
  const [invites, setInvites] = useState<BoardInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ms, is] = await Promise.all([
        api.boardMembers(board.id),
        isOwner ? api.boardInvites(board.id) : Promise.resolve([] as BoardInvite[]),
      ]);
      setMembers(ms);
      setInvites(is);
    } catch (err) {
      Alert.alert('Could not load members', String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [board.id, isOwner]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || inviting) return;
    setInviting(true);
    try {
      const result = await api.inviteMember(board.id, email);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (result.joined) {
        Alert.alert('Member added', `${email} has been added to the board.`);
      } else {
        Alert.alert(
          'Invite sent',
          result.inviteLink
            ? `${email} doesn't have an account yet. An invite email has been sent.`
            : `An invite has been sent to ${email}.`
        );
      }
      setInviteEmail('');
      load();
    } catch (err) {
      Alert.alert('Could not invite', String(err));
    } finally {
      setInviting(false);
    }
  };

  const removeMember = (member: BoardMember) => {
    Alert.alert(
      'Remove member?',
      `${member.name || member.username || member.email} will lose access to this board.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeMember(board.id, member.id);
              setMembers((prev) => prev.filter((m) => m.id !== member.id));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            } catch (err) {
              Alert.alert('Could not remove member', String(err));
            }
          },
        },
      ]
    );
  };

  const revokeInvite = (invite: BoardInvite) => {
    Alert.alert('Revoke invite?', `Cancel the pending invite for ${invite.invitee_email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.revokeInvite(board.id, invite.id);
            setInvites((prev) => prev.filter((i) => i.id !== invite.id));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } catch (err) {
            Alert.alert('Could not revoke invite', String(err));
          }
        },
      },
    ]);
  };

  const displayName = (m: BoardMember) =>
    m.name || m.username || m.email;

  const initials = (m: BoardMember) => {
    const name = m.name || m.username || m.email;
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={[styles.topBar, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Members</Text>
        <View style={{ width: 50 }} />
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
          paddingBottom: spacing.xxl * 2,
        }}
        ListHeaderComponent={
          <>
            {/* Board name context */}
            <View style={[styles.boardInfo, { borderBottomColor: t.border }]}>
              <Text style={[styles.boardName, { color: t.text }]}>{board.name}</Text>
              {!isOwner && (
                <Text style={[styles.viewerNote, { color: t.textMuted }]}>
                  You're a member of this board.
                </Text>
              )}
            </View>

            {/* Members section */}
            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>
              Members ({members.length})
            </Text>

            {members.length === 0 && !loading && (
              <Text style={[styles.emptyNote, { color: t.textMuted }]}>
                No other members yet. Invite someone below.
              </Text>
            )}

            {members.map((m) => (
              <View
                key={m.id}
                style={[styles.memberRow, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <View style={[styles.avatar, { backgroundColor: t.accent + '22' }]}>
                  <Text style={[styles.avatarText, { color: t.accent }]}>{initials(m)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: t.text }]}>{displayName(m)}</Text>
                  {m.name && (
                    <Text style={[styles.memberEmail, { color: t.textMuted }]}>{m.email}</Text>
                  )}
                </View>
                {isOwner && (
                  <Pressable
                    onPress={() => removeMember(m)}
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text style={[styles.removeText, { color: t.danger }]}>Remove</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {/* Pending invites (owner only) */}
            {isOwner && invites.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: t.textMuted, marginTop: spacing.lg }]}>
                  Pending invites ({invites.length})
                </Text>
                {invites.map((inv) => (
                  <View
                    key={inv.id}
                    style={[styles.memberRow, { backgroundColor: t.surface, borderColor: t.border }]}
                  >
                    <View style={[styles.avatar, { backgroundColor: t.surfaceElevated }]}>
                      <Text style={[styles.avatarText, { color: t.textMuted }]}>✉</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: t.text }]}>{inv.invitee_email}</Text>
                      <Text style={[styles.memberEmail, { color: t.textMuted }]}>Invite pending</Text>
                    </View>
                    <Pressable
                      onPress={() => revokeInvite(inv)}
                      hitSlop={10}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <Text style={[styles.removeText, { color: t.textMuted }]}>Revoke</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {/* Invite form (owner only) */}
            {isOwner && (
              <>
                <Text style={[styles.sectionLabel, { color: t.textMuted, marginTop: spacing.lg }]}>
                  Invite someone
                </Text>
                <View
                  style={[styles.inviteRow, { backgroundColor: t.surface, borderColor: t.border }]}
                >
                  <TextInput
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    onSubmitEditing={invite}
                    placeholder="Email address"
                    placeholderTextColor={t.textLight}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    style={[styles.inviteInput, { color: t.text }]}
                  />
                </View>
                <Button
                  label={inviting ? 'Sending…' : 'Send invite'}
                  onPress={invite}
                  disabled={!inviteEmail.trim() || inviting}
                  style={{ marginTop: spacing.sm }}
                />
                <Text style={[styles.inviteHint, { color: t.textMuted }]}>
                  If they already have an account they'll be added immediately. Otherwise they'll
                  receive an email invite.
                </Text>
              </>
            )}
          </>
        }
        renderItem={() => null}
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
  headerTitle: { fontSize: font.size.md, fontWeight: font.weight.bold },
  boardInfo: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  boardName: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  viewerNote: { fontSize: font.size.sm },
  sectionLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  emptyNote: { fontSize: font.size.sm, marginBottom: spacing.md },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: font.size.sm, fontWeight: font.weight.bold },
  memberName: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  memberEmail: { fontSize: font.size.sm, marginTop: 1 },
  removeText: { fontSize: font.size.sm, fontWeight: font.weight.medium },
  inviteRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  inviteInput: { height: 44, fontSize: font.size.md },
  inviteHint: {
    fontSize: font.size.sm,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
