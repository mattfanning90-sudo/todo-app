import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import { useTheme, radius, spacing, font } from '@/theme';
import { api, ApiError } from '@/api/client';
import type { Board, SearchHit } from '@/api/types';
import type { Nav } from '@/navigation/types';

interface Props {
  onBack?: () => void;
  onOpenBoard?: (board: Board) => void;
}

const DEBOUNCE_MS = 280;

export function SearchScreen({ onBack, onOpenBoard }: Props) {
  const nav = useNavigation<Nav>();
  const goBack = onBack ?? (() => nav.goBack());
  const openBoard = onOpenBoard ?? ((board: Board) => nav.navigate('Board', { board }));
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const hits = await api.search(q, controller.signal);
      setResults(hits);
      setSearched(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setResults([]);
        setSearched(true);
      }
      // AbortError on supersession — ignore silently.
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  const onChange = (text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(text.trim()), DEBOUNCE_MS);
  };

  const openHit = (hit: SearchHit) => {
    // Reconstruct enough of a Board for BoardScreen to fetch its data.
    // We don't have slug on the search hit; BoardScreen never reads it.
    const board: Board = {
      id: hit.board_id,
      owner_user_id: hit.board_owner_id,
      name: hit.board_name,
      slug: '',
    };
    openBoard(board);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text }]}>Search</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChange}
          placeholder="Search across all your boards…"
          placeholderTextColor={t.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.input, { color: t.text }]}
        />
        {loading ? <ActivityIndicator color={t.textMuted} /> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(hit) => String(hit.id)}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.textMuted }]}>
            {query.trim().length < 2
              ? 'Type at least 2 characters to search.'
              : searched && !loading
              ? 'No tasks match that.'
              : ' '}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openHit(item)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowText, { color: t.text }]} numberOfLines={2}>
                {item.text}
              </Text>
              <Text style={[styles.rowMeta, { color: t.textMuted }]} numberOfLines={1}>
                {item.board_name}
                {item.cat_name ? ` · ${item.cat_name}` : ''}
                {item.due_date ? ` · ${item.due_date}` : ''}
              </Text>
            </View>
            <View
              style={[
                styles.stageBadge,
                { backgroundColor: t.stage[item.stage] },
              ]}
            >
              <Text style={styles.stageBadgeText}>{stageLabel(item.stage)}</Text>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </Screen>
  );
}

function stageLabel(s: SearchHit['stage']): string {
  return s === 'in_progress' ? 'In progress' : s === 'done' ? 'Done' : 'Backlog';
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: font.size.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rowText: { fontSize: font.size.md, fontWeight: font.weight.medium },
  rowMeta: { fontSize: font.size.sm, marginTop: 2 },
  stageBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  stageBadgeText: { color: '#fff', fontSize: font.size.xs, fontWeight: font.weight.semibold },
  empty: { textAlign: 'center', paddingTop: spacing.xxl, fontSize: font.size.md },
});
