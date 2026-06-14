import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { Card } from '@/components/Card';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.dashboard();
      setData(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxTrend = Math.max(1, ...(data?.trend.map((d) => d.completed) ?? [0]));

  // Compute max values for progress bar charts
  const maxPriority = Math.max(
    1,
    ...PRIORITY_ORDER.map((p) => data?.byPriority[p] ?? 0),
  );
  const maxCategory = Math.max(
    1,
    ...(data?.byCategory ?? []).map((c) => c.count),
  );

  const totalTasks =
    (data?.counts.open ?? 0) +
    (data?.counts.inProgress ?? 0) +
    (data?.counts.overdue ?? 0);
  const isEmpty = !loading && !error && data != null && totalTasks === 0 &&
    (data.trend ?? []).every((d) => d.completed === 0);

  return (
    <Screen padded={false}>
      <ScreenHeader variant="detail" title="Dashboard" onBack={onBack} />

      <ScreenState
        loading={loading && !refreshing}
        error={error ?? undefined}
        onRetry={() => { setLoading(true); load(); }}
        empty={isEmpty}
        emptyIcon="board"
        emptyTitle="No activity yet."
        emptyBody="Complete a few tasks and your trends will show up here."
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { backgroundColor: t.bg },
          ]}
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
          {/* Stat cards row */}
          <View style={styles.statsRow}>
            <StatCard
              label="Open"
              value={data?.counts.open ?? 0}
              color={t.stage.backlog}
            />
            <StatCard
              label="In Progress"
              value={data?.counts.inProgress ?? 0}
              color={t.accent}
            />
            <StatCard
              label="Overdue"
              value={data?.counts.overdue ?? 0}
              color={t.danger}
            />
          </View>

          {/* 7-day trend bars */}
          <Card padded style={styles.section}>
            <Text style={[styles.sectionEyebrow, { color: t.textMuted }]}>
              Last 7 days
            </Text>
            <View style={styles.trendRow}>
              {(data?.trend ?? []).map((d) => {
                const barH = Math.max(4, (d.completed / maxTrend) * 72);
                return (
                  <View key={d.date} style={styles.trendCol}>
                    {/* count label above bar */}
                    <Text style={[styles.trendCount, { color: d.completed > 0 ? t.text : t.textLight }]}>
                      {d.completed > 0 ? d.completed : ''}
                    </Text>
                    <View style={[styles.trendTrack, { backgroundColor: t.accentMuted }]}>
                      <View
                        style={[
                          styles.trendFill,
                          {
                            height: barH,
                            backgroundColor: t.accent,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.trendLabel, { color: t.textMuted }]}>
                      {d.date.slice(5)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* By priority — horizontal bar chart */}
          <Card padded style={styles.section}>
            <Text style={[styles.sectionEyebrow, { color: t.textMuted }]}>
              By priority
            </Text>
            {PRIORITY_ORDER.map((p) => {
              const count = data?.byPriority[p] ?? 0;
              const pct = count / maxPriority;
              return (
                <BarRow
                  key={p}
                  label={p}
                  value={count}
                  pct={pct}
                  dotColor={t.priority[p]}
                />
              );
            })}
          </Card>

          {/* By category — horizontal bar chart */}
          <Card padded style={styles.section}>
            <Text style={[styles.sectionEyebrow, { color: t.textMuted }]}>
              By category
            </Text>
            {(data?.byCategory ?? []).length === 0 ? (
              <Text style={[styles.emptyHint, { color: t.textMuted }]}>
                No categorised tasks yet.
              </Text>
            ) : (
              data!.byCategory.map((c) => (
                <BarRow
                  key={c.name}
                  label={c.name}
                  value={c.count}
                  pct={c.count / maxCategory}
                  dotColor={c.color}
                />
              ))
            )}
          </Card>
        </ScrollView>
      </ScreenState>
    </Screen>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
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
    <Card padded style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textMuted }]}>{label}</Text>
    </Card>
  );
}

// ─── Horizontal progress bar row ─────────────────────────────────────────────

function BarRow({
  label,
  value,
  pct,
  dotColor,
}: {
  label: string;
  value: number;
  pct: number;
  dotColor: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.barRow}>
      <View style={styles.barMeta}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text
          style={[styles.barLabel, { color: t.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text style={[styles.barValue, { color: t.textMuted }]}>{value}</Text>
      </View>
      {/* track + fill */}
      <View style={[styles.track, { backgroundColor: t.accentMuted }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(pct * 100)}%`,
              backgroundColor: t.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statCard: {
    flex: 1,
  },
  statValue: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
  section: {
    marginBottom: spacing.xs,
  },
  sectionEyebrow: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },

  // Trend (vertical bars)
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  trendCount: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    minHeight: 14,
  },
  trendTrack: {
    width: '80%',
    height: 80,
    borderRadius: radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendFill: {
    borderRadius: radius.sm,
    minHeight: 4,
  },
  trendLabel: {
    fontSize: font.size.xs,
    marginTop: 2,
  },

  // Horizontal bar rows
  barRow: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  barMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  barLabel: {
    flex: 1,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    textTransform: 'capitalize',
  },
  barValue: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
    minWidth: 4,
  },

  emptyHint: {
    fontSize: font.size.md,
    fontStyle: 'italic',
  },
});
