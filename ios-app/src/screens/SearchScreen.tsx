import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { ListRow } from '@/components/ListRow';
import { TagChip } from '@/components/TagChip';
import { Icon } from '@/components/Icon';
import { useTheme, radius, spacing, font } from '@/theme';
import { api, ApiError } from '@/api/client';
import type { Board, SearchHit } from '@/api/types';
import type { Nav } from '@/navigation/types';

interface Props {
  onBack?: () => void;
  onOpenBoard?: (board: Board) => void;
}

const DEBOUNCE_MS = 280;

// Tinted stage badge: low-opacity background + saturated text.
// NOT white-on-solid-colour — fixes contrast bug in the old implementation.
const STAGE_TINT: Record<SearchHit['stage'], { bg: string; fg: string }> = {
  backlog:     { bg: '#94A3B81A', fg: '#64748B' },
  in_progress: { bg: '#FF6B471A', fg: '#FF6B47' },
  done:        { bg: '#16A34A1A', fg: '#16A34A' },
};

function stageLabel(s: SearchHit['stage']): string {
  return s === 'in_progress' ? 'In progress' : s === 'done' ? 'Done' : 'Backlog';
}

export function SearchScreen({ onBack, onOpenBoard }: Props) {
  const nav = useNavigation<Nav>();
  const goBack = onBack ?? (() => nav.goBack());
  const openBoard = onOpenBoard ?? ((board: Board) => nav.navigate('Board', { board }));
  const t = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const hits = await api.search(q, controller.signal);
      setResults(hits);
      setSearched(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setResults([]);
        setSearched(true);
        setError('Search failed. Try again.');
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

  const retry = () => {
    const q = query.trim();
    if (q.length >= 2) runSearch(q);
  };

  const openHit = (hit: SearchHit) => {
    const board: Board = {
      id: hit.board_id,
      owner_user_id: hit.board_owner_id,
      name: hit.board_name,
      slug: '',
    };
    openBoard(board);
  };

  const isIdle = query.trim().length < 2;
  const isEmpty = searched && !loading && !error && results.length === 0;

  return (
    <Screen>
      <ScreenHeader variant="detail" title="Search" onBack={goBack} />

      {/* Prominent search field with leading search icon */}
      <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: t.borderInput }]}>
        <Icon name="search" label="" size={18} color={t.textMuted} />
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
      </View>

      {/* Idle hint — before 2 chars typed */}
      {isIdle ? (
        <ScreenState
          empty
          emptyIcon="search"
          emptyBody="Type at least 2 characters to search."
        />
      ) : (
        /* Loading / error / empty / results */
        <ScreenState
          loading={loading}
          error={error}
          onRetry={retry}
          empty={isEmpty}
          emptyIcon="search"
          emptyBody={`No tasks match "${query.trim()}".`}
        >
          <FlatList
            data={results}
            keyExtractor={(hit) => String(hit.id)}
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const { bg, fg } = STAGE_TINT[item.stage];
              const subtitleParts = [item.board_name];
              if (item.due_date) subtitleParts.push(item.due_date);

              const trailing = (
                <View style={styles.trailingWrap}>
                  {item.cat_name && item.cat_color ? (
                    <TagChip name={item.cat_name} color={item.cat_color} />
                  ) : null}
                  <View style={[styles.stageBadge, { backgroundColor: bg }]}>
                    <Text style={[styles.stageBadgeText, { color: fg }]}>
                      {stageLabel(item.stage)}
                    </Text>
                  </View>
                </View>
              );

              return (
                <ListRow
                  title={item.text}
                  subtitle={subtitleParts.join(' · ')}
                  trailing={trailing}
                  divider
                  onPress={() => openHit(item)}
                />
              );
            }}
          />
        </ScreenState>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: font.size.md,
  },
  trailingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  stageBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  stageBadgeText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
});
