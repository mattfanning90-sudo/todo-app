import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  Text,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { Nav, BoardStackParams } from '@/navigation/types';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SectionCard } from '@/components/SectionCard';
import { TextField } from '@/components/TextField';
import { useTheme, spacing, font } from '@/theme';
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

  const revokeInvite = (inv: BoardInvite) => {
    Alert.alert('Revoke invite?', `Cancel the pending invite for ${inv.invitee_email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.revokeInvite(board.id, inv.id);
            setInvites((prev) => prev.filter((i) => i.id !== inv.id));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } catch (err) {
            Alert.alert('Could not revoke invite', String(err));
          }
        },
      },
    ]);
  };

  const displayName = (m: BoardMember) => m.name || m.username || m.email;

  const initials = (m: BoardMember) => {
    const name = m.name || m.username || m.email;
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Screen padded={false}>
      <ScreenHeader variant="detail" title="Members" onBack={goBack} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.lg }}
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
      >
        {/* Loading / error states only — do NOT pass empty, as that would hide the invite form */}
        <ScreenState loading={loading}>
          {/* Members section */}
          <SectionCard eyebrow={`Members (${members.length})`}>
            {members.length === 0 ? (
              <Text style={{ color: t.textMuted, fontSize: font.size.sm, padding: spacing.sm }}>
                Just you so far — invite someone below.
              </Text>
            ) : (
              members.map((m, index) => (
                <ListRow
                  key={m.id}
                  title={displayName(m)}
                  subtitle={m.name ? m.email : undefined}
                  divider={index < members.length - 1}
                  leading={
                    <AvatarInitials
                      initials={initials(m)}
                      bg={t.accent + '22'}
                      color={t.accent}
                    />
                  }
                  trailing={
                    isOwner ? (
                      <Text
                        onPress={() => removeMember(m)}
                        style={{ color: t.danger, fontSize: font.size.sm, fontWeight: font.weight.medium }}
                      >
                        Remove
                      </Text>
                    ) : undefined
                  }
                />
              ))
            )}
          </SectionCard>
        </ScreenState>

        {/* Pending invites (owner only) — outside ScreenState so always rendered */}
        {isOwner && invites.length > 0 && (
          <SectionCard eyebrow={`Pending invites (${invites.length})`}>
            {invites.map((inv, index) => (
              <ListRow
                key={inv.id}
                title={inv.invitee_email}
                subtitle="Invite pending"
                divider={index < invites.length - 1}
                leading={<Icon name="mail" label="" size={20} color={t.textMuted} />}
                trailing={
                  <Text
                    onPress={() => revokeInvite(inv)}
                    style={{ color: t.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium }}
                  >
                    Revoke
                  </Text>
                }
              />
            ))}
          </SectionCard>
        )}

        {/* Invite form (owner only) — outside ScreenState so always rendered for owners */}
        {isOwner && (
          <Card padded>
            <TextField
              label="Email address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              onSubmitEditing={invite}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
            />
            <Button
              label={inviting ? 'Sending…' : 'Send invite'}
              onPress={invite}
              disabled={!inviteEmail.trim() || inviting}
              loading={inviting}
            />
            <Text style={{ color: t.textMuted, fontSize: font.size.sm, lineHeight: 18, marginTop: spacing.sm }}>
              If they already have an account they'll be added immediately. Otherwise they'll
              receive an email invite.
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function AvatarInitials({
  initials,
  bg,
  color,
}: {
  initials: string;
  bg: string;
  color: string;
}) {
  return (
    <Text
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: bg,
        color,
        fontSize: font.size.sm,
        fontWeight: font.weight.bold,
        textAlign: 'center',
        lineHeight: 36,
        overflow: 'hidden',
      }}
    >
      {initials}
    </Text>
  );
}
