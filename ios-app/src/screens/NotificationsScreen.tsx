import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { Nav } from '@/navigation/types';
import { Screen } from '@/components/Screen';
import { useTheme, radius, spacing, font } from '@/theme';
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

  return (
    <Screen>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} disabled={markingRead} hitSlop={8}>
            <Text style={{ color: t.accent, fontSize: font.size.sm }}>
              {markingRead ? '…' : 'Mark all read'}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: t.textMuted, fontSize: font.size.md }}>No notifications</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          {notifications.map((n) => (
            <View
              key={n.id}
              testID={n.read ? `notif-read-${n.id}` : `notif-unread-${n.id}`}
              style={[
                styles.row,
                {
                  backgroundColor: n.read ? t.surface : t.accentMuted,
                  borderBottomColor: t.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.message,
                    {
                      color: t.text,
                      fontWeight: n.read ? font.weight.regular : font.weight.semibold,
                    },
                  ]}
                >
                  {n.message}
                </Text>
                <Text style={[styles.meta, { color: t.textMuted }]}>
                  {n.from_username ? `@${n.from_username} · ` : ''}{formatDate(n.created_at)}
                </Text>
              </View>
              {!n.read && (
                <View style={[styles.dot, { backgroundColor: t.accent }]} />
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  message: { fontSize: font.size.md, lineHeight: 20 },
  meta: { fontSize: font.size.xs, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
