// ios-app/src/screens/ProfileScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  Alert, Linking, Pressable, SafeAreaView,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useTheme, spacing, font, radius } from '@/theme';
import type { DashboardData, User } from '@/api/types';
import type { Nav } from '@/navigation/types';

interface Props {
  navigation: Nav;
}

export function ProfileScreen({ navigation }: Props) {
  const t = useTheme();
  const { logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);

  useFocusEffect(useCallback(() => {
    api.me().then(setUser).catch(() => {});
    api.dashboard().then(setDash).catch(() => {});
  }, []));

  const initial = (user?.name ?? user?.email ?? '?')[0].toUpperCase();
  const stats = dash?.stats;
  const counts = dash?.counts;

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    scroll: { padding: spacing.xl },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: spacing.xl },
    h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: t.text },
    headerIcons: { flexDirection: 'row', gap: spacing.lg },
    headerIcon: { fontSize: 22, color: t.textMuted },
    profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
      backgroundColor: t.surface, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 22, fontWeight: font.weight.bold },
    profileName: { fontSize: 20, fontWeight: font.weight.bold, color: t.text },
    profileEmail: { fontSize: 13, color: t.textMuted, marginTop: 2 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
    statBox: { flex: 1, minWidth: '45%', borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
    statVal: { fontSize: 28, fontWeight: font.weight.bold },
    statLabel: { fontSize: 12, marginTop: 4 },
    settingsCard: { backgroundColor: t.surface, borderRadius: radius.lg, overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    settingsHead: { fontSize: 11, fontWeight: font.weight.bold, letterSpacing: 0.7,
      textTransform: 'uppercase', color: t.textMuted, padding: spacing.lg, paddingBottom: spacing.sm },
    setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: spacing.lg, borderTopWidth: 1, borderTopColor: t.border },
    setLabel: { fontSize: 15, color: t.text },
    chevron: { fontSize: 20 },
  });

  function StatBox({ value, label }: { value: number | undefined; label: string }) {
    return (
      <View style={[s.statBox, { backgroundColor: t.surface }]}>
        <Text style={[s.statVal, { color: t.accent }]}>{value ?? 0}</Text>
        <Text style={[s.statLabel, { color: t.textMuted }]}>{label}</Text>
      </View>
    );
  }

  function SettingRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
    return (
      <Pressable style={s.setRow} onPress={onPress}>
        <Text style={[s.setLabel, danger && { color: '#DC2626' }]}>{label}</Text>
        <Text style={[s.chevron, { color: t.textMuted }]}>›</Text>
      </Pressable>
    );
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert('Error', 'Could not sign out.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header with search + bell icons */}
        <View style={s.headerRow}>
          <Text style={s.h1}>Profile</Text>
          <View style={s.headerIcons}>
            <Pressable onPress={() => navigation.navigate('Search')} hitSlop={10}>
              <Text style={s.headerIcon}>⌕</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10}>
              <Text style={s.headerIcon}>🔔</Text>
            </Pressable>
          </View>
        </View>

        {/* Profile card */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View>
            <Text style={s.profileName}>{user?.name ?? user?.username ?? ''}</Text>
            <Text style={s.profileEmail}>{user?.email ?? ''}</Text>
          </View>
        </View>

        {/* Stats 2×2 grid */}
        <View style={s.statGrid}>
          <StatBox value={stats?.done_total} label="Done" />
          <StatBox value={stats?.completed_week} label="This week" />
          <StatBox value={counts?.open} label="Open" />
          <StatBox value={counts?.overdue} label="Overdue" />
        </View>

        {/* Comprehensive settings list */}
        <View style={s.settingsCard}>
          <Text style={s.settingsHead}>Settings</Text>
          <SettingRow label="Notifications" onPress={() => navigation.navigate('Settings')} />
          <SettingRow label="Boards" onPress={() => navigation.navigate('BoardList')} />
          <SettingRow label="Search" onPress={() => navigation.navigate('Search')} />
          <SettingRow
            label="Export data"
            onPress={() => Linking.openURL(`${api.baseUrl}/api/export`)}
          />
          <SettingRow
            label="About"
            onPress={() => Alert.alert('Taskly', 'Cross-platform task manager.')}
          />
          <SettingRow label="Sign out" danger onPress={handleLogout} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
