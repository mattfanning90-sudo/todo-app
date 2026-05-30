# Taskly Redesign — iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the iOS client (`ios-app/`) to the Taskly look and a 3-tab IA — Today · Board · Profile — preserving every existing feature. The API endpoint `GET /api/tasks/today` is already built and tested (web plan Task 1); this plan only consumes it.

**Architecture:** Replace the current single `NativeStack` root with a `BottomTabNavigator` (3 tabs: Today / Board / Profile), each tab owning its own nested `NativeStack`. New screens: `TodayScreen`, `ProfileScreen`. New shared components: `ProgressRing` (pure-RN, no SVG dep), `TagChip`. Existing screens (`BoardScreen`, `TaskDetailScreen`, `BoardMembersScreen`, `ArchivedScreen`, `SearchScreen`, `NotificationsScreen`, `SettingsScreen`) become destinations pushed from within tabs. `BoardListScreen` logic folds into the Board tab header (board switcher via `ActionSheetIOS`). `DashboardScreen` folds into `ProfileScreen`. The nav structure change requires a **full EAS build** — it cannot ship OTA.

**Tech Stack:** Expo SDK 55 + TypeScript, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`, `@testing-library/react-native`, `jest-expo`, `jest-fetch-mock`.

**Spec:** `docs/superpowers/specs/2026-05-31-taskly-redesign-design.md`.

---

## Testing reality

**Unit-testable with jest-expo + jest-fetch-mock (add tests for these):**
- `ProgressRing` — renders correctly for 0%, 50%, 100%; pure-RN `View`s, no native dep.
- `TagChip` — renders name + correct tinted background from hex color.
- `TodayScreen` — with `fetch` mocked: renders task rows, filters All/Active/Done, shows overdue badge, ring % computation.
- `ProfileScreen` — with `fetch` mocked: renders stats from dashboard response, shows user name, sign-out button present.

**Needs Expo / TestFlight QA (cannot unit-test):**
- Bottom tab navigator renders and switches tabs.
- BoardScreen drag-reorder (reanimated-dnd) still works after nav restructure.
- `ActionSheetIOS` board switcher, board overflow actions.
- `useFocusEffect` re-fetch on screen return.
- Real API calls, session cookie, Google sign-in.

---

## File structure

| File | Change |
|---|---|
| `ios-app/src/api/types.ts` | **Modify** — add `TodayTask` type |
| `ios-app/src/api/client.ts` | **Modify** — add `api.todayTasks()` |
| `ios-app/src/theme/index.ts` | **Modify** — add Taskly tokens alongside existing ones |
| `ios-app/src/components/ProgressRing.tsx` | **Create** |
| `ios-app/src/components/TagChip.tsx` | **Create** |
| `ios-app/src/screens/TodayScreen.tsx` | **Create** |
| `ios-app/src/screens/ProfileScreen.tsx` | **Create** |
| `ios-app/src/screens/BoardScreen.tsx` | **Modify** — restyle to Taskly tokens + add board-switcher header + overflow |
| `ios-app/src/navigation/RootNavigator.tsx` | **Modify** — replace single stack with tab + nested stacks |
| `ios-app/__tests__/components/ProgressRing.test.tsx` | **Create** |
| `ios-app/__tests__/components/TagChip.test.tsx` | **Create** |
| `ios-app/__tests__/screens/TodayScreen.test.tsx` | **Create** |
| `ios-app/__tests__/screens/ProfileScreen.test.tsx` | **Create** |

---

## Task 1: Types + API client

**Files:** `ios-app/src/api/types.ts`, `ios-app/src/api/client.ts`

Add the `TodayTask` type (the shape `GET /api/tasks/today` returns) and an `api.todayTasks()` method. The server already ships this endpoint (web plan Task 1).

- [ ] **Step 1: Add `TodayTask` to `types.ts`**

Append after the `UserSearchResult` interface:

```ts
export interface TodayTask {
  id: number;
  text: string;
  stage: Stage;
  due_date: string;          // YYYY-MM-DD
  priority: Priority;
  status: string;
  board_id: number;
  board_name: string;
  cat_name: string | null;
  cat_color: string | null;
  completed_at: string | null;
}
```

- [ ] **Step 2: Add `api.todayTasks()` to `client.ts`**

Add after `api.dashboard`:

```ts
todayTasks: () => request<TodayTask[]>('/api/tasks/today'),
```

Also update the import at the top of `client.ts` to include `TodayTask`.

- [ ] **Step 3: Commit**

```bash
git add ios-app/src/api/types.ts ios-app/src/api/client.ts
git commit -m "feat(ios): add TodayTask type and api.todayTasks()

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Taskly tokens in theme

**File:** `ios-app/src/theme/index.ts`

Add Taskly tokens to the `Theme` interface and both light/dark objects alongside the existing tokens. Keep all existing keys — nothing breaks.

- [ ] **Step 1: Extend `Theme` interface**

Add after `priority`:

```ts
tk: {
  accent: string;
  accentHover: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  prioHigh: string;
  prioMed: string;
  prioLow: string;
  shadow: string;
};
```

- [ ] **Step 2: Add token values to `light` and `dark`**

In `light`:
```ts
tk: {
  accent: '#FF6B47',
  accentHover: '#E8522E',
  bg: '#F7F7FA',
  card: '#FFFFFF',
  text: '#1E1E2E',
  muted: 'rgba(30,30,46,0.45)',
  line: 'rgba(30,30,46,0.08)',
  prioHigh: '#FF6B47',
  prioMed: '#F59E0B',
  prioLow: '#9CA3AF',
  shadow: '0 1px 4px rgba(30,30,46,0.06)',
},
```

In `dark`:
```ts
tk: {
  accent: '#FF6B47',
  accentHover: '#E8522E',
  bg: '#16161D',
  card: '#1E1E28',
  text: '#F2F2F7',
  muted: 'rgba(242,242,247,0.5)',
  line: 'rgba(255,255,255,0.08)',
  prioHigh: '#FF6B47',
  prioMed: '#F59E0B',
  prioLow: '#9CA3AF',
  shadow: '0 1px 4px rgba(0,0,0,0.2)',
},
```

- [ ] **Step 3: Run typecheck + commit**

```bash
cd ios-app && npx tsc --noEmit
git add ios-app/src/theme/index.ts
git commit -m "feat(ios): add Taskly design tokens to theme

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `ProgressRing` component + tests

**Files:** `ios-app/src/components/ProgressRing.tsx`, `ios-app/__tests__/components/ProgressRing.test.tsx`

Pure-RN implementation using rotated/clipped `View`s. No `react-native-svg` — it is listed in `transformIgnorePatterns` but not installed.

Approach: two concentric circles using `borderRadius: size/2`. The filled arc uses the "double half-circle" clip trick: a container `overflow: hidden` with two rotated half-filled views producing the arc sweep. For simplicity (the ring is decorative at a glance), use a simpler approximation: a single filled circle border with a `View` overlay masking the unfilled portion — but the cleanest pure-RN approach that avoids SVG is a `borderWidth` ring + a conic-gradient workaround using two `View` half-rings.

The simplest correct pure-RN ring: one background ring (`borderWidth`, `borderColor: lineColor`) + a `View` of the same dimensions rotated, whose border is only drawn on one side via selective border coloring. For the full implementation below, we use the standard "two half-disc" technique:

```tsx
// ios-app/src/components/ProgressRing.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  pct: number;         // 0–100
  size?: number;       // diameter, default 80
  stroke?: number;     // ring thickness, default 6
  color?: string;      // fill color, default '#FF6B47'
  bgColor?: string;    // track color, default 'rgba(30,30,46,0.08)'
  label?: string;      // centre label, default pct%
}

export function ProgressRing({
  pct,
  size = 80,
  stroke = 6,
  color = '#FF6B47',
  bgColor = 'rgba(30,30,46,0.08)',
  label,
}: Props) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = size / 2;
  const inner = r - stroke;

  // Degrees the filled arc covers
  const deg = (clamped / 100) * 360;

  return (
    <View style={{ width: size, height: size }} testID="progress-ring">
      {/* Background track */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            borderWidth: stroke,
            borderColor: bgColor,
          },
        ]}
      />
      {/* Filled arc: left half-disc */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: r, overflow: 'hidden' },
        ]}
        pointerEvents="none"
      >
        {/* We render the arc as two rotated half-fills */}
        {deg > 0 && (
          <View
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: r,
              borderWidth: stroke,
              borderColor: color,
              // Clip the right half so only left side shows
              // Rotate to sweep the correct arc portion
              transform: [{ rotate: `${Math.min(deg - 180, 0)}deg` }],
              borderRightColor: 'transparent',
              borderBottomColor: deg > 90 ? color : 'transparent',
            }}
          />
        )}
        {deg > 180 && (
          <View
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: r,
              borderWidth: stroke,
              borderColor: color,
              transform: [{ rotate: `${deg - 180}deg` }],
              borderLeftColor: 'transparent',
              borderTopColor: 'transparent',
            }}
          />
        )}
      </View>
      {/* Centre hole + label */}
      <View
        style={{
          position: 'absolute',
          top: stroke,
          left: stroke,
          width: size - stroke * 2,
          height: size - stroke * 2,
          borderRadius: inner,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="progress-ring-label"
      >
        <Text style={{ fontSize: size * 0.22, fontWeight: '700' }} testID="progress-ring-pct">
          {label ?? `${clamped}%`}
        </Text>
        <Text style={{ fontSize: size * 0.12, opacity: 0.45 }}>done</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 1: Write the failing tests**

Create `ios-app/__tests__/components/ProgressRing.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ProgressRing } from '../../src/components/ProgressRing';

test('renders the ring container', () => {
  const { getByTestId } = render(<ProgressRing pct={50} />);
  expect(getByTestId('progress-ring')).toBeTruthy();
});

test('shows pct label for 0%', () => {
  const { getByTestId } = render(<ProgressRing pct={0} />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('0%');
});

test('shows pct label for 100%', () => {
  const { getByTestId } = render(<ProgressRing pct={100} />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('100%');
});

test('clamps values above 100', () => {
  const { getByTestId } = render(<ProgressRing pct={150} />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('100%');
});

test('accepts a custom label', () => {
  const { getByTestId } = render(<ProgressRing pct={75} label="75%" />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('75%');
});
```

- [ ] **Step 2: Run tests — verify fail**

```bash
cd ios-app && npx jest __tests__/components/ProgressRing.test.tsx
```
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Create `ProgressRing.tsx`** (code above).

- [ ] **Step 4: Run tests — verify pass**

```bash
cd ios-app && npx jest __tests__/components/ProgressRing.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add ios-app/src/components/ProgressRing.tsx ios-app/__tests__/components/ProgressRing.test.tsx
git commit -m "feat(ios): add ProgressRing (pure-RN, no SVG dep)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `TagChip` component + tests

**Files:** `ios-app/src/components/TagChip.tsx`, `ios-app/__tests__/components/TagChip.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `ios-app/__tests__/components/TagChip.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { TagChip } from '../../src/components/TagChip';

test('renders the category name', () => {
  const { getByText } = render(<TagChip name="Work" color="#3B82F6" />);
  expect(getByText('Work')).toBeTruthy();
});

test('applies tinted background (hex + 1a alpha)', () => {
  const { getByTestId } = render(<TagChip name="Work" color="#3B82F6" testID="chip" />);
  const chip = getByTestId('chip');
  // Background should be the hex color with low opacity
  expect(chip.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ backgroundColor: '#3B82F61a' })])
  );
});

test('renders nothing when name is falsy', () => {
  const { queryByTestId } = render(<TagChip name="" color="#3B82F6" testID="chip" />);
  expect(queryByTestId('chip')).toBeNull();
});
```

- [ ] **Step 2: Create `TagChip.tsx`**

```tsx
// ios-app/src/components/TagChip.tsx
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

interface Props {
  name: string;
  color: string;     // 6-digit hex, e.g. '#3B82F6'
  testID?: string;
}

export function TagChip({ name, color, testID }: Props) {
  if (!name) return null;
  // Append '1a' for ~10% opacity tint; works with 6-digit hex category colors
  const bg = `${color}1a`;
  return (
    <View testID={testID} style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color }]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
```

- [ ] **Step 3: Run tests — verify pass**

```bash
cd ios-app && npx jest __tests__/components/TagChip.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add ios-app/src/components/TagChip.tsx ios-app/__tests__/components/TagChip.test.tsx
git commit -m "feat(ios): add TagChip component (category color tint)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `TodayScreen` + tests

**Files:** `ios-app/src/screens/TodayScreen.tsx`, `ios-app/__tests__/screens/TodayScreen.test.tsx`

`TodayScreen` calls `api.todayTasks()` via `useFocusEffect`, computes the ring %, shows All/Active/Done filter chips, renders task rows with an optimistic toggle-done, and opens a quick-add `Modal` bottom-sheet.

- [ ] **Step 1: Write failing tests**

Create `ios-app/__tests__/screens/TodayScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { TodayScreen } from '../../src/screens/TodayScreen';

// Minimal navigation stubs
const nav = { navigate: jest.fn() };
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const tasks = [
  { id: 1, text: 'A task', stage: 'backlog', due_date: today, priority: 'high',
    status: '', board_id: 1, board_name: 'Work', cat_name: 'Dev', cat_color: '#3B82F6',
    completed_at: null },
  { id: 2, text: 'Done task', stage: 'done', due_date: today, priority: 'none',
    status: '', board_id: 1, board_name: 'Work', cat_name: null, cat_color: null,
    completed_at: '2026-05-31T00:00:00Z' },
  { id: 3, text: 'Overdue task', stage: 'backlog', due_date: yesterday, priority: 'medium',
    status: '', board_id: 2, board_name: 'Personal', cat_name: null, cat_color: null,
    completed_at: null },
];

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.mockResponseOnce(JSON.stringify(tasks));
});

test('renders task titles after fetch', async () => {
  const { findByText } = render(<TodayScreen navigation={nav as any} />);
  expect(await findByText('A task')).toBeTruthy();
  expect(await findByText('Overdue task')).toBeTruthy();
});

test('Active filter hides done tasks', async () => {
  const { findByText, getByText, queryByText } = render(
    <TodayScreen navigation={nav as any} />
  );
  await findByText('A task');
  fireEvent.press(getByText('Active'));
  expect(queryByText('Done task')).toBeNull();
  expect(getByText('A task')).toBeTruthy();
});

test('Done filter shows only done tasks', async () => {
  const { findByText, getByText, queryByText } = render(
    <TodayScreen navigation={nav as any} />
  );
  await findByText('Done task');
  fireEvent.press(getByText('Done'));
  expect(getByText('Done task')).toBeTruthy();
  expect(queryByText('A task')).toBeNull();
});

test('progress ring pct = doneToday / dueToday (overdue excluded from denominator)', async () => {
  // dueToday = tasks 1 and 2 (today due_date); done of those = task 2 → 1/2 = 50%
  const { findByTestId } = render(<TodayScreen navigation={nav as any} />);
  const label = await findByTestId('progress-ring-pct');
  expect(label.props.children).toBe('50%');
});

test('overdue tasks show overdue badge', async () => {
  const { findByTestId } = render(<TodayScreen navigation={nav as any} />);
  expect(await findByTestId('overdue-badge-3')).toBeTruthy();
});
```

- [ ] **Step 2: Create `TodayScreen.tsx`**

```tsx
// ios-app/src/screens/TodayScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable,
  SafeAreaView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@/api/client';
import type { TodayTask } from '@/api/types';
import { useTheme, spacing, font, radius } from '@/theme';
import { ProgressRing } from '@/components/ProgressRing';
import { TagChip } from '@/components/TagChip';
import type { Nav } from '@/navigation/RootNavigator';

type Filter = 'all' | 'active' | 'done';

interface Props {
  navigation: Nav;
}

export function TodayScreen({ navigation }: Props) {
  const t = useTheme();
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const load = useCallback(async () => {
    try {
      const data = await api.todayTasks();
      setTasks(data);
    } catch (e) {
      // silently empty on 401 (AuthContext handles redirect)
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dueToday = tasks.filter(t => t.due_date === todayStr);
  const doneToday = dueToday.filter(t => t.stage === 'done').length;
  const pct = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0;

  const visible = tasks.filter(task =>
    filter === 'all' ? true :
    filter === 'done' ? task.stage === 'done' :
    task.stage !== 'done'
  );

  const prioColor = (p: string) =>
    p === 'high' ? t.tk.prioHigh :
    p === 'medium' ? t.tk.prioMed :
    t.tk.prioLow;

  async function toggleDone(task: TodayTask) {
    const newStage = task.stage === 'done' ? 'backlog' : 'done';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stage: newStage } : t));
    try {
      await api.updateTask(task.id, { board_id: task.board_id, stage: newStage });
    } catch {
      // Revert
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, stage: task.stage } : t));
      Alert.alert('Error', 'Could not update task.');
    }
  }

  async function submitQuickAdd() {
    const text = quickAddText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      // Get first owned board to post to
      const boards = await api.boards();
      const boardId = boards[0]?.id;
      if (!boardId) { Alert.alert('No board found'); return; }
      await api.createTask({ text, board_id: boardId, stage: 'backlog', due_date: todayStr });
      setQuickAddOpen(false);
      setQuickAddText('');
      load();
    } catch {
      Alert.alert('Error', 'Could not create task.');
    } finally {
      setSubmitting(false);
    }
  }

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.tk.bg },
    scroll: { flex: 1, padding: spacing.xl },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl },
    eyebrow: { fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.8,
      textTransform: 'uppercase', color: t.tk.muted, marginBottom: 4 },
    h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: t.tk.text },
    chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99,
      backgroundColor: 'rgba(30,30,46,0.06)' },
    chipActive: { backgroundColor: t.tk.accent },
    chipLabel: { fontSize: 13, fontWeight: font.weight.semibold, color: t.tk.muted },
    chipLabelActive: { color: '#fff' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
      backgroundColor: t.tk.card, borderRadius: radius.lg, marginBottom: 10,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
    taskTitle: { fontSize: 15, fontWeight: font.weight.medium, color: t.tk.text },
    taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.55 },
    taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    dueBadge: { fontSize: 12, color: t.tk.muted },
    overdueBadge: { fontSize: 12, color: '#DC2626', fontWeight: font.weight.semibold },
    boardName: { fontSize: 11, color: t.tk.muted },
    prioDot: { width: 7, height: 7, borderRadius: 4 },
    addBtn: { marginTop: spacing.md, padding: 16, borderRadius: radius.lg,
      borderWidth: 2, borderColor: t.tk.line, borderStyle: 'dashed', alignItems: 'center' },
    addLabel: { color: t.tk.muted, fontSize: 14 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.tk.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: spacing.xl, paddingBottom: spacing.xxl },
    sheetTitle: { fontSize: 18, fontWeight: font.weight.bold, color: t.tk.text, marginBottom: spacing.lg },
    input: { borderWidth: 1, borderColor: t.tk.line, borderRadius: radius.md,
      padding: 14, fontSize: 15, color: t.tk.text, marginBottom: spacing.lg },
    submitBtn: { backgroundColor: t.tk.accent, borderRadius: radius.md, padding: 14, alignItems: 'center' },
    submitLabel: { color: '#fff', fontWeight: font.weight.bold, fontSize: 15 },
  });

  const renderItem = ({ item }: { item: TodayTask }) => {
    const done = item.stage === 'done';
    const overdue = !done && item.due_date && item.due_date < todayStr;
    return (
      <View style={s.row}>
        <Pressable
          style={[s.check, {
            borderColor: done ? t.tk.accent : prioColor(item.priority),
            backgroundColor: done ? t.tk.accent : 'transparent',
          }]}
          onPress={() => toggleDone(item)}
          testID={`check-${item.id}`}
        />
        <View style={{ flex: 1 }}>
          <Text style={[s.taskTitle, done && s.taskTitleDone]}>{item.text}</Text>
          <View style={s.taskMeta}>
            {overdue ? (
              <Text style={s.overdueBadge} testID={`overdue-badge-${item.id}`}>Overdue</Text>
            ) : item.due_date ? (
              <Text style={s.dueBadge}>{item.due_date}</Text>
            ) : null}
            {item.cat_name && <TagChip name={item.cat_name} color={item.cat_color ?? '#9CA3AF'} />}
            <Text style={s.boardName}>{item.board_name}</Text>
          </View>
        </View>
        <View style={[s.prioDot, { backgroundColor: prioColor(item.priority) }]} />
      </View>
    );
  };

  const FilterChip = ({ mode, label }: { mode: Filter; label: string }) => (
    <Pressable style={[s.chip, filter === mode && s.chipActive]} onPress={() => setFilter(mode)}>
      <Text style={[s.chipLabel, filter === mode && s.chipLabelActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        style={s.scroll}
        data={visible}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <View style={s.head}>
              <View>
                <Text style={s.eyebrow}>{dateLabel}</Text>
                <Text style={s.h1}>Today</Text>
              </View>
              <ProgressRing pct={pct} size={80} stroke={6} color={t.tk.accent} />
            </View>
            <View style={s.chipRow}>
              <FilterChip mode="all" label="All" />
              <FilterChip mode="active" label="Active" />
              <FilterChip mode="done" label="Done" />
            </View>
          </>
        }
        ListFooterComponent={
          <Pressable style={s.addBtn} onPress={() => setQuickAddOpen(true)}>
            <Text style={s.addLabel}>+ Add task…</Text>
          </Pressable>
        }
      />
      <Modal visible={quickAddOpen} transparent animationType="slide"
        onRequestClose={() => setQuickAddOpen(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setQuickAddOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>New Task</Text>
            <TextInput
              style={s.input}
              placeholder="Task title…"
              placeholderTextColor={t.tk.muted}
              value={quickAddText}
              onChangeText={setQuickAddText}
              onSubmitEditing={submitQuickAdd}
              returnKeyType="done"
              autoFocus
            />
            <Pressable style={s.submitBtn} onPress={submitQuickAdd} disabled={submitting}>
              <Text style={s.submitLabel}>{submitting ? 'Adding…' : 'Add Task'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Run tests — verify fail, then pass**

```bash
cd ios-app && npx jest __tests__/screens/TodayScreen.test.tsx
```
Fail first (file missing), then create the file, then pass.

- [ ] **Step 4: Run full suite (no regressions)**

```bash
cd ios-app && npx jest
```

- [ ] **Step 5: Commit**

```bash
git add ios-app/src/screens/TodayScreen.tsx ios-app/__tests__/screens/TodayScreen.test.tsx
git commit -m "feat(ios): TodayScreen (cross-board agenda, ring, quick-add)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `ProfileScreen` + tests

**Files:** `ios-app/src/screens/ProfileScreen.tsx`, `ios-app/__tests__/screens/ProfileScreen.test.tsx`

ProfileScreen replaces DashboardScreen as the user hub. It calls `api.dashboard()` for the 2x2 stats, `api.me()` for user name, and renders a settings list. `DashboardScreen.tsx` is left in place (it's still reachable from within BoardScreen overflow if needed) but is no longer in the tab navigator.

**Note:** The existing `DashboardData` type in `types.ts` is missing `stats` (it has `counts` / `trend` / `byPriority` / `byCategory`). The spec calls for `stats.done_total` and `stats.completed_week` fields. Check the actual server response — `GET /api/dashboard` returns a `stats` object alongside `counts`. Add `stats?: { done_total: number; completed_week: number; open: number; overdue: number }` to `DashboardData` in `types.ts` as an optional field so existing code is unaffected.

- [ ] **Step 0: Extend `DashboardData` in `types.ts`**

Add inside `DashboardData`:

```ts
stats?: { done_total: number; completed_week: number; open: number; overdue: number };
```

- [ ] **Step 1: Write failing tests**

Create `ios-app/__tests__/screens/ProfileScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { ProfileScreen } from '../../src/screens/ProfileScreen';

const nav = { navigate: jest.fn() };
const mockDash = {
  counts: { open: 5, inProgress: 2, overdue: 1 },
  stats: { done_total: 42, completed_week: 7, open: 5, overdue: 1 },
  trend: [], byPriority: { high: 0, medium: 0, low: 0, none: 0 }, byCategory: [],
};
const mockUser = { id: 1, email: 'test@test.com', name: 'Matt', username: 'matt', digest_frequency: 'none' };

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.mockResponseOnce(JSON.stringify(mockUser));    // api.me()
  fetchMock.mockResponseOnce(JSON.stringify(mockDash));   // api.dashboard()
});

test('renders user name', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('Matt')).toBeTruthy();
});

test('renders done_total stat', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('42')).toBeTruthy();
});

test('renders overdue stat', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('1')).toBeTruthy();
});

test('renders Sign out button', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('Sign out')).toBeTruthy();
});
```

- [ ] **Step 2: Create `ProfileScreen.tsx`**

```tsx
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
import type { Nav } from '@/navigation/RootNavigator';

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

  function StatBox({ value, label }: { value: number | undefined; label: string }) {
    return (
      <View style={[s.statBox, { backgroundColor: t.tk.card }]}>
        <Text style={[s.statVal, { color: t.tk.accent }]}>{value ?? 0}</Text>
        <Text style={[s.statLabel, { color: t.tk.muted }]}>{label}</Text>
      </View>
    );
  }

  function SettingRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
    return (
      <Pressable style={s.setRow} onPress={onPress}>
        <Text style={[s.setLabel, danger && { color: '#DC2626' }]}>{label}</Text>
        <Text style={[s.chevron, { color: t.tk.muted }]}>›</Text>
      </Pressable>
    );
  }

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.tk.bg },
    scroll: { padding: spacing.xl },
    h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: t.tk.text, marginBottom: spacing.xl },
    profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
      backgroundColor: t.tk.card, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.tk.accent,
      alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 22, fontWeight: font.weight.bold },
    profileName: { fontSize: 20, fontWeight: font.weight.bold, color: t.tk.text },
    profileEmail: { fontSize: 13, color: t.tk.muted, marginTop: 2 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
    statBox: { flex: 1, minWidth: '45%', borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
    statVal: { fontSize: 28, fontWeight: font.weight.bold },
    statLabel: { fontSize: 12, marginTop: 4 },
    settingsCard: { backgroundColor: t.tk.card, borderRadius: radius.lg, overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    settingsHead: { fontSize: 11, fontWeight: font.weight.bold, letterSpacing: 0.7,
      textTransform: 'uppercase', color: t.tk.muted, padding: spacing.lg, paddingBottom: spacing.sm },
    setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: spacing.lg, borderTopWidth: 1, borderTopColor: t.tk.line },
    setLabel: { fontSize: 15, color: t.tk.text },
    chevron: { fontSize: 20 },
  });

  async function handleLogout() {
    try {
      await api.logout();
      logout();
    } catch {
      Alert.alert('Error', 'Could not sign out.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>Profile</Text>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View>
            <Text style={s.profileName}>{user?.name ?? user?.username ?? ''}</Text>
            <Text style={s.profileEmail}>{user?.email ?? ''}</Text>
          </View>
        </View>
        <View style={s.statGrid}>
          <StatBox value={stats?.done_total} label="Done" />
          <StatBox value={stats?.completed_week} label="This week" />
          <StatBox value={counts?.open} label="Open" />
          <StatBox value={counts?.overdue} label="Overdue" />
        </View>
        <View style={s.settingsCard}>
          <Text style={s.settingsHead}>Settings</Text>
          <SettingRow label="Notifications" onPress={() => navigation.navigate('Settings')} />
          <SettingRow label="Boards" onPress={() => navigation.navigate('BoardList')} />
          <SettingRow label="Export data"
            onPress={() => Linking.openURL(`${api.baseUrl}/api/export`)} />
          <SettingRow label="Sign out" danger onPress={handleLogout} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Run tests — verify pass**

```bash
cd ios-app && npx jest __tests__/screens/ProfileScreen.test.tsx
```

- [ ] **Step 4: Run full suite**

```bash
cd ios-app && npx jest
```

- [ ] **Step 5: Commit**

```bash
git add ios-app/src/api/types.ts ios-app/src/screens/ProfileScreen.tsx \
  ios-app/__tests__/screens/ProfileScreen.test.tsx
git commit -m "feat(ios): ProfileScreen (real stats + settings)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Tab navigator + nav restructure

**File:** `ios-app/src/navigation/RootNavigator.tsx`

This is the structural change that needs a full EAS build. Replace the single `NativeStack` with a `BottomTabNavigator` (3 tabs: Today / Board / Profile), each owning its own nested `NativeStack`.

**Prerequisites:** `@react-navigation/bottom-tabs` must be installed.

```bash
cd ios-app && npm install @react-navigation/bottom-tabs
```

**Nav map after this task:**

```
NavigationContainer
└── BottomTabNavigator (auth'd) or NativeStack LoginScreen (unauth'd)
    ├── Tab: Today → NativeStack
    │     └── TodayScreen (root) → Search, Notifications, TaskDetail (pushed)
    ├── Tab: Board → NativeStack
    │     └── BoardScreen (root, owns board-switcher) → TaskDetail, Archived, Members, Search, Notifications (pushed)
    └── Tab: Profile → NativeStack
          └── ProfileScreen (root) → Settings (pushed)
```

`BoardListScreen` is no longer a root screen — the board-switcher logic moves into `BoardScreen`'s header (Task 8). Keep `BoardListScreen.tsx` in place; it's used by ProfileScreen's "Boards" row via a push from the Board tab.

- [ ] **Step 1: Update `RootStackParamList` and add new param lists**

Replace `RootNavigator.tsx` with:

```tsx
// ios-app/src/navigation/RootNavigator.tsx
import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import {
  NavigationContainer, DarkTheme, DefaultTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme';
import type { Board, Task } from '@/api/types';

// ── Screen imports ──────────────────────────────────────────────────────────
import { LoginScreen } from '@/screens/LoginScreen';
import { TodayScreen } from '@/screens/TodayScreen';
import { BoardScreen } from '@/screens/BoardScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { TaskDetailScreen } from '@/screens/TaskDetailScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { ArchivedScreen } from '@/screens/ArchivedScreen';
import { BoardMembersScreen } from '@/screens/BoardMembersScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { BoardListScreen } from '@/screens/BoardListScreen';

// ── Param lists ─────────────────────────────────────────────────────────────
export type TodayStackParams = {
  Today: undefined;
  Search: undefined;
  Notifications: undefined;
  TaskDetail: { board: Board; task: Task | null };
};

export type BoardStackParams = {
  Board: { board?: Board };   // board optional — BoardScreen resolves default
  TaskDetail: { board: Board; task: Task | null };
  Archived: { board: Board };
  BoardMembers: { board: Board };
  Search: undefined;
  Notifications: undefined;
  BoardList: undefined;
};

export type ProfileStackParams = {
  Profile: undefined;
  Settings: undefined;
  BoardList: undefined;
};

// Unified nav type for screens that need cross-stack navigation
export type RootStackParamList = TodayStackParams & BoardStackParams & ProfileStackParams & {
  Login: undefined;
};
export type Nav = NativeStackNavigationProp<RootStackParamList>;

const TodayStack = createNativeStackNavigator<TodayStackParams>();
const BoardStack = createNativeStackNavigator<BoardStackParams>();
const ProfileStack = createNativeStackNavigator<ProfileStackParams>();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator<{ Login: undefined }>();

// ── Tab icon helper (plain text glyphs — no native icon dep needed) ─────────
function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  const icons: Record<string, string> = { Today: '◷', Board: '⊞', Profile: '◉' };
  return <Text style={{ fontSize: focused ? 20 : 18, color }}>{icons[label] ?? '•'}</Text>;
}

// ── Per-tab stack navigators ─────────────────────────────────────────────────
function TodayNav() {
  return (
    <TodayStack.Navigator screenOptions={{ headerShown: false }}>
      <TodayStack.Screen name="Today" component={TodayScreen} />
      <TodayStack.Screen name="Search" component={SearchScreen} />
      <TodayStack.Screen name="Notifications" component={NotificationsScreen} />
      <TodayStack.Screen name="TaskDetail" component={TaskDetailScreen}
        options={{ presentation: 'modal' }} />
    </TodayStack.Navigator>
  );
}

function BoardNav() {
  return (
    <BoardStack.Navigator screenOptions={{ headerShown: false }}>
      <BoardStack.Screen name="Board" component={BoardScreen} />
      <BoardStack.Screen name="TaskDetail" component={TaskDetailScreen}
        options={{ presentation: 'modal' }} />
      <BoardStack.Screen name="Archived" component={ArchivedScreen} />
      <BoardStack.Screen name="BoardMembers" component={BoardMembersScreen} />
      <BoardStack.Screen name="Search" component={SearchScreen} />
      <BoardStack.Screen name="Notifications" component={NotificationsScreen} />
      <BoardStack.Screen name="BoardList" component={BoardListScreen} />
    </BoardStack.Navigator>
  );
}

function ProfileNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="BoardList" component={BoardListScreen} />
    </ProfileStack.Navigator>
  );
}

// ── Root navigator ───────────────────────────────────────────────────────────
export function RootNavigator() {
  const { user, loading } = useAuth();
  const scheme = useColorScheme();
  const t = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.tk.accent} />
      </View>
    );
  }

  const navTheme = scheme === 'light' ? DefaultTheme : DarkTheme;

  return (
    <NavigationContainer
      theme={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          background: t.tk.bg,
          card: t.tk.card,
          text: t.tk.text,
          border: t.tk.line,
          primary: t.tk.accent,
        },
      }}
    >
      {user ? (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: t.tk.accent,
            tabBarInactiveTintColor: t.tk.muted,
            tabBarStyle: { backgroundColor: t.tk.card, borderTopColor: t.tk.line },
            tabBarIcon: ({ focused, color }) =>
              <TabIcon label={route.name} focused={focused} color={color} />,
          })}
        >
          <Tab.Screen name="Today" component={TodayNav} />
          <Tab.Screen name="Board" component={BoardNav} />
          <Tab.Screen name="Profile" component={ProfileNav} />
        </Tab.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Fix `BoardScreen` and other screens that received `onBack` / `onOpenTask` props**

The old `RootNavigator` used wrapper components to pass callback props. After this change, screens use `useNavigation()` internally for all nav calls. The cleanest fix is to make `BoardScreen`, `ArchivedScreen`, `BoardMembersScreen`, `SearchScreen`, `NotificationsScreen`, `SettingsScreen`, `TaskDetailScreen`, and `BoardListScreen` call `useNavigation<Nav>()` directly instead of relying on callback props. Since these screens already exist with callback props, the minimal surgical change is:

- In each screen that previously had `onBack: () => void` prop: call `const nav = useNavigation<Nav>()` at the top and replace `onBack()` calls with `nav.goBack()`. Keep the prop in the interface as optional (`onBack?: () => void`) and fall back to `nav.goBack()` if not provided — this way the screens remain backward-compatible if any tests pass the prop.
- In `BoardScreen`: the `onOpenTask`, `onOpenArchived`, `onOpenMembers` props similarly become optional, backed by `useNavigation`.

This is the only file surgery outside the new screen files. Reference the existing usage in `BoardScreen.tsx` (imports `useNavigation` is not yet there — add it). The pattern mirrors `DashboardWrapper` in the old navigator: `const nav = useNavigation<Nav>(); nav.navigate('TaskDetail', ...)`.

- [ ] **Step 3: Run typecheck**

```bash
cd ios-app && npx tsc --noEmit
```

Fix any type errors (typically: `navigate` calls with route names now in a nested stack — use the `navigation` prop or `useNavigation` typed to the correct stack's param list for the screen).

- [ ] **Step 4: Run full test suite**

```bash
cd ios-app && npx jest
```

- [ ] **Step 5: Commit**

```bash
git add ios-app/src/navigation/RootNavigator.tsx ios-app/src/screens/
git commit -m "feat(ios): replace stack root with 3-tab bottom navigator (requires EAS build)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: BoardScreen — Taskly restyle + board-switcher + overflow

**File:** `ios-app/src/screens/BoardScreen.tsx`

BoardScreen keeps the existing continuous-flow kanban + reanimated-dnd drag + `onMoveStage` move buttons **entirely unchanged**. This task only:
1. Restyles the header to show board name + chevron (tapping opens `ActionSheetIOS` to switch boards) + % done pill + overflow (⋯) for Members/Archived/Rename/Delete.
2. Makes the screen self-sufficient: it loads its own board list (`api.boards()` + `api.memberships()`) on mount, picks the first board as the default, and lets the user switch via `ActionSheetIOS`.
3. Applies Taskly tokens to card wrappers, stage dividers, and header (surgical CSS-equivalent changes to `StyleSheet` values — do not touch drag logic or task-mutation paths).

The existing `board` prop passed from the old navigator becomes optional. When no board is passed (e.g. when BoardScreen is the tab root), it falls back to the first owned board.

- [ ] **Step 1: Read `BoardScreen.tsx` (full file) before editing**

Reference the existing `STAGES`, `FILTERS`, `isToday`, `isOverdue`, `useAuth`, `useFocusEffect`, `DropProvider`, `Draggable`, `Droppable` imports — all stay. The `Props` interface changes:

```ts
interface Props {
  board?: Board;             // now optional; self-resolves default
  onBack?: () => void;       // optional; fallback nav.goBack()
  onOpenTask?: (task: Task | null) => void;
  onOpenArchived?: () => void;
  onOpenMembers?: () => void;
  navigation?: Nav;
}
```

- [ ] **Step 2: Add board-switcher state + load**

Add state near existing state:
```ts
const nav = useNavigation<Nav>();
const [allBoards, setAllBoards] = useState<Board[]>([]);
const [currentBoard, setCurrentBoard] = useState<Board | undefined>(props.board);
```

Load boards on mount (once, not in `useFocusEffect` loop — board list rarely changes):
```ts
useEffect(() => {
  Promise.all([api.boards(), api.memberships()]).then(([owned, shared]) => {
    const combined = [...owned, ...shared];
    setAllBoards(combined);
    if (!currentBoard && combined.length > 0) setCurrentBoard(combined[0]);
  }).catch(() => {});
}, []);
```

Replace all `board.id` references with `currentBoard?.id ?? 0` and guard data fetches on `currentBoard`.

- [ ] **Step 3: Header — board switcher + % pill + overflow**

Replace the existing header `View` with Taskly-styled header. Add `donePct` computed from task counts:

```ts
const donePct = tasks.length
  ? Math.round((tasks.filter(t => t.stage === 'done').length / tasks.length) * 100)
  : 0;
```

Header JSX (above the filter chips / drag area):

```tsx
<View style={styles.boardHead}>
  <View>
    <Pressable style={styles.boardSwitch} onPress={openBoardSwitcher}>
      <Text style={styles.boardSwitchLabel}>{currentBoard?.name ?? 'Board'}</Text>
      <Text style={{ color: t.tk.muted }}>  ▾</Text>
    </Pressable>
    <Text style={styles.boardH1}>Board</Text>
  </View>
  <View style={styles.boardHeadRight}>
    <View style={styles.donePill}>
      <Text style={styles.donePillLabel}>{donePct}% done</Text>
    </View>
    <Pressable onPress={openOverflow} style={styles.overflowBtn}>
      <Text style={{ fontSize: 20, color: t.tk.muted }}>⋯</Text>
    </Pressable>
  </View>
</View>
```

- [ ] **Step 4: `openBoardSwitcher` via `ActionSheetIOS`**

```ts
function openBoardSwitcher() {
  const options = [...allBoards.map(b => b.name), 'New board', 'Cancel'];
  ActionSheetIOS.showActionSheetWithOptions(
    { options, cancelButtonIndex: options.length - 1 },
    (idx) => {
      if (idx < allBoards.length) {
        setCurrentBoard(allBoards[idx]);
      } else if (idx === allBoards.length) {
        // New board
        Alert.prompt('New Board', 'Name', async (name) => {
          if (!name?.trim()) return;
          const b = await api.createBoard(name.trim());
          setAllBoards(prev => [...prev, b]);
          setCurrentBoard(b);
        });
      }
    }
  );
}
```

- [ ] **Step 5: `openOverflow` via `ActionSheetIOS`**

```ts
function openOverflow() {
  ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Members', 'Archived', 'Rename board', 'Delete board', 'Cancel'],
      cancelButtonIndex: 4, destructiveButtonIndex: 3 },
    async (idx) => {
      if (!currentBoard) return;
      if (idx === 0) nav.navigate('BoardMembers', { board: currentBoard });
      if (idx === 1) nav.navigate('Archived', { board: currentBoard });
      if (idx === 2) {
        Alert.prompt('Rename', 'New name', async (name) => {
          if (!name?.trim()) return;
          await api.renameBoard(currentBoard.id, name.trim());
          setCurrentBoard(b => b ? { ...b, name: name.trim() } : b);
        }, 'plain-text', currentBoard.name);
      }
      if (idx === 3) {
        Alert.alert('Delete board', `Delete "${currentBoard.name}"?`,
          [{ text: 'Cancel', style: 'cancel' },
           { text: 'Delete', style: 'destructive', onPress: async () => {
             await api.deleteBoard(currentBoard.id);
             const remaining = allBoards.filter(b => b.id !== currentBoard.id);
             setAllBoards(remaining);
             setCurrentBoard(remaining[0]);
           }}]);
      }
    }
  );
}
```

- [ ] **Step 6: Apply Taskly style tokens to card/stage styles**

In `StyleSheet.create({...})`, change the board and card colors to use `t.tk.*` tokens. Key changes — do not touch the drag-area layout:
- Background: `t.tk.bg`
- Card background: `t.tk.card` (replaces `t.surface`)
- Stage divider: `t.tk.muted`, `t.tk.line`
- Accent: `t.tk.accent`

Keep existing style keys so nothing breaks at callsites.

- [ ] **Step 7: Run full suite**

```bash
cd ios-app && npx jest
```

- [ ] **Step 8: Commit**

```bash
git add ios-app/src/screens/BoardScreen.tsx
git commit -m "feat(ios): BoardScreen Taskly restyle + board-switcher + overflow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Search + Notifications header icons on Today/Board

**Files:** `ios-app/src/screens/TodayScreen.tsx`, `ios-app/src/screens/BoardScreen.tsx`

Add search and bell icons to the top-right of the Today and Board screen headers (spec requirement: "Search + notification icons accessible from Today/Board/Profile headers").

Use the existing `SearchScreen` and `NotificationsScreen` — just navigate to them.

- [ ] **Step 1: Add header icons to `TodayScreen`**

Add to the `TodayScreen` header row (alongside the `ProgressRing`):

```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
  <Pressable onPress={() => navigation.navigate('Search')} testID="search-btn">
    <Text style={{ fontSize: 20, color: t.tk.muted }}>⌕</Text>
  </Pressable>
  <Pressable onPress={() => navigation.navigate('Notifications')} testID="bell-btn">
    <Text style={{ fontSize: 20, color: t.tk.muted }}>🔔</Text>
  </Pressable>
  <ProgressRing pct={pct} size={80} stroke={6} color={t.tk.accent} />
</View>
```

(Adjust layout: the header row changes from `{ justifyContent: 'space-between' }` to accommodate the icon cluster next to the ring, or put the icons in the eyebrow row.)

- [ ] **Step 2: Add header icons to `BoardScreen`**

Add search + bell pressables to the `boardHeadRight` cluster alongside the overflow button.

- [ ] **Step 3: Run tests + commit**

```bash
cd ios-app && npx jest
git add ios-app/src/screens/TodayScreen.tsx ios-app/src/screens/BoardScreen.tsx
git commit -m "feat(ios): search + notifications icons in Today/Board headers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Final typecheck, full test suite, and TestFlight build

- [ ] **Step 1: Full typecheck**

```bash
cd ios-app && npx tsc --noEmit
```

Fix any remaining type errors.

- [ ] **Step 2: Full test suite**

```bash
cd ios-app && npx jest
```

All tests green.

- [ ] **Step 3: Commit + open PR**

```bash
git add -A ios-app/
git commit -m "chore(ios): final typecheck pass and test cleanup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/taskly-redesign
gh pr create --base main \
  --title "Taskly redesign — iOS (3-tab IA + TodayScreen + ProfileScreen)" \
  --body "Mirrors the web redesign for iOS. 3 bottom tabs (Today/Board/Profile), new TodayScreen (cross-board agenda + ProgressRing + quick-add), new ProfileScreen (real stats + settings), BoardScreen board-switcher + overflow, Taskly design tokens. **Nav change requires EAS build before OTA updates.**"
```

> **`main` is prod** — confirm the web PR (which adds `GET /api/tasks/today`) is merged and deployed before this PR merges, otherwise `api.todayTasks()` will 404.

- [ ] **Step 4: EAS build + TestFlight**

```bash
cd ios-app
eas build --platform ios --profile production --non-interactive
eas submit --platform ios --latest --non-interactive
```

QA checklist on TestFlight:
- Today tab: date header + ring + filter chips + task rows (cross-board) + overdue badge + checkbox toggle + quick-add modal.
- Board tab: default board loads, board switcher shows all boards, % done pill updates as tasks move, ⋯ opens Members/Archived/Rename/Delete, drag reorder still works, tap card opens TaskDetail.
- Profile tab: avatar + user name + 2x2 real stats + settings rows all tappable (Notifications → SettingsScreen, Boards → BoardList, Export → opens URL, Sign out → logs out).
- Search and bell icons navigate from Today and Board headers.
- Light/dark theme follows OS setting on all three tabs.

---

## Self-review: spec → task mapping

| Spec requirement | Task |
|---|---|
| 3-tab IA (Today / Board / Profile) | Task 7 |
| Today: cross-board `GET /api/tasks/today` | Task 1 (types + client method; server already built in web plan Task 1) |
| Today: ProgressRing (pure-RN, no SVG) | Task 3 |
| Today: All/Active/Done chips + filter | Task 5 |
| Today: task rows (checkbox, overdue badge, TagChip, board name) | Task 5 |
| Today: quick-add bottom-sheet → default board, due today | Task 5 |
| TagChip (real category hex color) | Task 4 |
| Board: board-switcher via ActionSheetIOS | Task 8 |
| Board: % done pill + header restyle | Task 8 |
| Board: ⋯ overflow (Members/Archived/Rename/Delete) | Task 8 |
| Board: existing drag + move buttons UNCHANGED | Task 8 (explicit non-touch) |
| Board: Taskly token restyle | Tasks 2 + 8 |
| Profile: avatar + real stats (done_total, completed_week, open, overdue) | Task 6 |
| Profile: settings list (Notifications, Boards, Export, Sign out) | Task 6 |
| Search + bell icons in Today/Board headers | Task 9 |
| Taskly design tokens in theme | Task 2 |
| Focus tab | Deferred (not built) |
| Theme follows OS `useColorScheme` | Existing `useTheme()` — no change needed |
| Manual Appearance toggle | Deferred follow-up |

---

## OTA vs. build note

| Change | Delivery |
|---|---|
| Nav structure (BottomTabNavigator) | **Full EAS build** — native nav change, cannot OTA |
| New screens (TodayScreen, ProfileScreen) | Full build (part of same PR) |
| Taskly tokens, restyle, header icons | OTA via `eas update` after the build ships |
| BoardScreen board-switcher + overflow | OTA (JS-only ActionSheetIOS) |
| `api.todayTasks()` method | OTA |

**Order:** merge web PR first (ships `GET /api/tasks/today`) → merge this iOS PR → EAS build → TestFlight → once build is live, all subsequent JS-only tweaks can ship via `eas update`.
