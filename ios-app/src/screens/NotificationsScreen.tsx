import React, { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { Nav } from '@/navigation/types';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SectionCard } from '@/components/SectionCard';
import { useTheme, spacing, font } from '@/theme';
import { api } from '@/api/client';
import type { Notification } from '@/api/types';

interface Props {
  onBack?: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function NotificationsScreen({ onBack }: Props) {
  const nav = useNavigation<Nav>();
  const goBack = onBack ?? (() => nav.goBack());
  const t = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.notifications();
      setNotifications(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const markAllRead = async () => {
    if (markingRead) return;
    setMarkingRead(true);
    try {
      await api.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    } finally {
      setMarkingRead(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAction = unreadCount > 0 ? (
    <Pressable onPress={markAllRead} disabled={markingRead} hitSlop={8}>
      <Text style={[styles.actionLabel, { color: t.accent }]}>
        {markingRead ? '…' : 'Mark all read'}
      </Text>
    </Pressable>
  ) : undefined;

  return (
    <Screen padded={false}>
      <ScreenHeader variant="detail" title="Notifications" onBack={goBack} actions={markAllAction} />

      <ScreenState
        loading={loading}
        empty={!loading && notifications.length === 0}
        emptyIcon="bell"
        emptyTitle="You're all caught up"
        emptyBody="Mentions, invites, and assignments show up here."
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <SectionCard style={styles.card}>
            {notifications.map((n, i) => (
              <View
                key={n.id}
                testID={n.read ? `notif-read-${n.id}` : `notif-unread-${n.id}`}
                style={[
                  styles.row,
                  i < notifications.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: t.border,
                  },
                ]}
              >
                {/* leading: coral dot for unread, placeholder for read */}
                <View style={styles.dotWrap}>
                  {!n.read && <View style={[styles.dot, { backgroundColor: t.accent }]} />}
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.message,
                      { color: t.text },
                      !n.read && styles.unread,
                    ]}
                  >
                    {n.message}
                  </Text>
                  <Text style={[styles.meta, { color: t.textMuted }]}>
                    {n.from_username ? `@${n.from_username} · ` : ''}{formatDate(n.created_at)}
                  </Text>
                </View>
              </View>
            ))}
          </SectionCard>
        </ScrollView>
      </ScreenState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  card: { marginBottom: spacing.lg },
  actionLabel: { fontSize: font.size.sm, fontWeight: font.weight.medium },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dotWrap: { width: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  message: { fontSize: font.size.md, fontWeight: font.weight.medium, lineHeight: 20 },
  unread: { fontWeight: font.weight.semibold },
  meta: { fontSize: font.size.sm, marginTop: 2 },
});
