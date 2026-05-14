import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import type { DashboardData, Priority } from '@/api/types';

interface Props {
  onBack: () => void;
}

const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low', 'none'];

export function DashboardScreen({ onBack }: Props) {
  const t = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.dashboard();
      setData(d);
    } catch (err) {
      Alert.alert('Could not load dashboard', String(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxTrend = Math.max(1, ...(data?.trend.map((d) => d.completed) ?? [0]));

  return (
    <Screen padded={false}>
      <View style={[styles.topBar, { paddingHorizontal: spacing.lg }]}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontWeight: font.weight.semibold }}>
            ‹ Boards
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text }]}>Dashboard</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
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
        <View style={styles.statsRow}>
          <Stat label="Open" value={data?.counts.open ?? 0} color={t.stage.backlog} />
          <Stat
            label="In progress"
            value={data?.counts.inProgress ?? 0}
            color={t.stage.in_progress}
          />
          <Stat
            label="Overdue"
            value={data?.counts.overdue ?? 0}
            color={t.danger}
          />
        </View>

        <Card title="Last 7 days">
          <View style={styles.trendRow}>
            {(data?.trend ?? []).map((d) => (
              <View key={d.date} style={styles.trendCol}>
                <View
                  style={[
                    styles.trendBar,
                    {
                      height: Math.max(4, (d.completed / maxTrend) * 80),
                      backgroundColor: t.accent,
                    },
                  ]}
                />
                <Text style={[styles.trendLabel, { color: t.textMuted }]}>
                  {d.date.slice(5)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card title="By priority">
          {PRIORITY_ORDER.map((p) => (
            <Row
              key={p}
              label={p}
              value={data?.byPriority[p] ?? 0}
              color={t.priority[p]}
            />
          ))}
        </Card>

        <Card title="By category">
          {(data?.byCategory ?? []).length === 0 ? (
            <Text style={{ color: t.textMuted }}>No categorised tasks yet.</Text>
          ) : (
            data!.byCategory.map((c) => (
              <Row key={c.name} label={c.name} value={c.count} color={c.color} />
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.stat,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
    >
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textMuted }]}>{label}</Text>
    </View>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
    >
      <Text style={[styles.cardTitle, { color: t.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.rowLabel, { color: t.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: t.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  statValue: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  statLabel: { fontSize: font.size.xs, marginTop: spacing.xs },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
  },
  trendCol: { alignItems: 'center', flex: 1 },
  trendBar: { width: 18, borderRadius: 4 },
  trendLabel: { fontSize: font.size.xs, marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  rowLabel: { flex: 1, fontSize: font.size.md, textTransform: 'capitalize' },
  rowValue: { fontSize: font.size.md, fontWeight: font.weight.semibold },
});
