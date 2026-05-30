# Cross-Stage Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⠿ drag handle to every TaskCard so users can long-press and drag a task to a different Kanban stage; dropping anywhere in the target stage moves the card to the bottom of that stage.

**Architecture:** A new `DragHandle` component (RNGH `LongPressGestureHandler` + `PanGestureHandler`) reports absolute finger Y to `BoardScreen`. `BoardScreen` measures each stage container's Y range via `onLayout`, converts the finger coordinate to content space using the container's screen offset and scroll offset, resolves the target stage via a pure helper, renders a ghost overlay, and calls the existing `moveToStage` on release. Within-stage reorder via `NestableDraggableFlatList` is untouched — it's triggered by long-pressing the card body, while cross-stage drag is triggered by long-pressing the ⠿ handle (different touch target, no gesture conflict).

**Tech Stack:** react-native-gesture-handler (already installed), react-native `Animated`, @testing-library/react-native, jest-fetch-mock

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `ios-app/src/utils/resolveStageFromBounds.ts` | NEW | Pure: `(y, boundsMap) → Stage \| null` |
| `ios-app/__tests__/utils/resolveStageFromBounds.test.ts` | NEW | Unit tests for the pure helper |
| `ios-app/__mocks__/react-native-gesture-handler.js` | NEW | Jest mock — makes RNGH handlers testable |
| `ios-app/src/components/DragHandle.tsx` | NEW | RNGH gesture wrapper, fires `onDragStart/Move/End(absoluteY)` |
| `ios-app/__tests__/components/DragHandle.test.tsx` | NEW | Smoke + callback tests for DragHandle |
| `ios-app/src/components/TaskCard.tsx` | MODIFY | Add `dragHandle?: ReactNode` strip; remove `onMoveToStage` + "Move →" pill |
| `ios-app/__tests__/components/TaskCard.test.tsx` | MODIFY | Tests for new `dragHandle` prop; assert no Move pill |
| `ios-app/src/screens/BoardScreen.tsx` | MODIFY | Drag state, stage bounds, ghost overlay, DragHandle wiring |
| `ios-app/__tests__/screens/BoardScreen.drag.test.tsx` | NEW | Integration tests via mocked DragHandle callbacks |

---

## Task 1: `resolveStageFromBounds` — RED

**Files:**
- Create: `ios-app/__tests__/utils/resolveStageFromBounds.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// ios-app/__tests__/utils/resolveStageFromBounds.test.ts
import { resolveStageFromBounds } from '../../src/utils/resolveStageFromBounds';
import type { Stage } from '../../src/api/types';

const bounds = new Map<Stage, { top: number; bottom: number }>([
  ['backlog',     { top: 0,   bottom: 300 }],
  ['in_progress', { top: 300, bottom: 600 }],
  ['done',        { top: 600, bottom: 900 }],
]);

test('returns backlog for Y within backlog bounds', () => {
  expect(resolveStageFromBounds(150, bounds)).toBe('backlog');
});

test('returns in_progress for Y within in_progress bounds', () => {
  expect(resolveStageFromBounds(400, bounds)).toBe('in_progress');
});

test('returns done for Y within done bounds', () => {
  expect(resolveStageFromBounds(750, bounds)).toBe('done');
});

test('returns null for Y above all bounds', () => {
  expect(resolveStageFromBounds(-10, bounds)).toBeNull();
});

test('returns null for Y below all bounds', () => {
  expect(resolveStageFromBounds(1000, bounds)).toBeNull();
});

test('boundary: Y equal to top is inside the stage', () => {
  expect(resolveStageFromBounds(300, bounds)).toBe('in_progress');
});

test('boundary: Y equal to bottom is outside the stage (exclusive)', () => {
  expect(resolveStageFromBounds(600, bounds)).toBe('done');
});
```

- [ ] **Step 2: Run tests — confirm they fail with "Cannot find module"**

```bash
cd ios-app && npx jest __tests__/utils/resolveStageFromBounds.test.ts --no-coverage
```

Expected: `Cannot find module '../../src/utils/resolveStageFromBounds'`

---

## Task 2: `resolveStageFromBounds` — GREEN + commit

**Files:**
- Create: `ios-app/src/utils/resolveStageFromBounds.ts`

- [ ] **Step 1: Implement the utility**

```ts
// ios-app/src/utils/resolveStageFromBounds.ts
import type { Stage } from '@/api/types';

export type StageBounds = { top: number; bottom: number };

/**
 * Given a Y coordinate (in content space) and a map of stage → {top, bottom},
 * returns the Stage whose bounds contain Y, or null if Y is outside all bounds.
 * The bottom boundary is exclusive: top <= Y < bottom.
 */
export function resolveStageFromBounds(
  y: number,
  bounds: Map<Stage, StageBounds>
): Stage | null {
  for (const [stage, { top, bottom }] of bounds) {
    if (y >= top && y < bottom) return stage;
  }
  return null;
}
```

- [ ] **Step 2: Run tests — confirm all 7 pass**

```bash
npx jest __tests__/utils/resolveStageFromBounds.test.ts --no-coverage
```

Expected: `Tests: 7 passed, 7 total`

- [ ] **Step 3: Commit**

```bash
git add src/utils/resolveStageFromBounds.ts __tests__/utils/resolveStageFromBounds.test.ts
git commit -m "feat: add resolveStageFromBounds pure utility"
```

---

## Task 3: RNGH mock + DragHandle — RED

**Files:**
- Create: `ios-app/__mocks__/react-native-gesture-handler.js`
- Create: `ios-app/__tests__/components/DragHandle.test.tsx`

- [ ] **Step 1: Create the RNGH mock**

This mock makes `LongPressGestureHandler` fire `onHandlerStateChange` when the test triggers `longPress` on the wrapper view. `PanGestureHandler` passes through children transparently (integration tests mock DragHandle entirely, so pan callbacks are tested at the BoardScreen level).

```js
// ios-app/__mocks__/react-native-gesture-handler.js
const React = require('react');
const { View } = require('react-native');

const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

function LongPressGestureHandler({ children, onHandlerStateChange }) {
  // Clone the immediate child and inject onLongPress so
  // fireEvent(child, 'longPress') triggers the state-change callback.
  return React.cloneElement(React.Children.only(children), {
    onLongPress: () =>
      onHandlerStateChange?.({
        nativeEvent: { state: State.ACTIVE, absoluteY: 100 },
      }),
  });
}

function PanGestureHandler({ children }) {
  return React.Children.only(children);
}

module.exports = {
  State,
  LongPressGestureHandler,
  PanGestureHandler,
  GestureHandlerRootView: ({ children }) => children,
  NativeViewGestureHandler: View,
};
```

- [ ] **Step 2: Write failing DragHandle tests**

```tsx
// ios-app/__tests__/components/DragHandle.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DragHandle } from '../../src/components/DragHandle';

test('renders the ⠿ icon', () => {
  const { getByText } = render(
    <DragHandle onDragStart={jest.fn()} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  expect(getByText('⠿')).toBeTruthy();
});

test('calls onDragStart with absoluteY when long-pressed', () => {
  const onDragStart = jest.fn();
  const { getByTestId } = render(
    <DragHandle onDragStart={onDragStart} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  // The LongPressGestureHandler mock injects onLongPress onto its immediate
  // child (testID="drag-handle-lp-wrapper"). Firing longPress on that view
  // triggers onHandlerStateChange({ state: ACTIVE, absoluteY: 100 }).
  fireEvent(getByTestId('drag-handle-lp-wrapper'), 'longPress');
  expect(onDragStart).toHaveBeenCalledWith(100);
});

test('does not throw when rendered without optional callbacks', () => {
  expect(() =>
    render(
      <DragHandle onDragStart={jest.fn()} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
    )
  ).not.toThrow();
});
```

- [ ] **Step 3: Run tests — confirm they fail with "Cannot find module"**

```bash
npx jest __tests__/components/DragHandle.test.tsx --no-coverage
```

Expected: `Cannot find module '../../src/components/DragHandle'`

---

## Task 4: `DragHandle` component — GREEN + commit

**Files:**
- Create: `ios-app/src/components/DragHandle.tsx`

- [ ] **Step 1: Implement DragHandle**

```tsx
// ios-app/src/components/DragHandle.tsx
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import {
  LongPressGestureHandler,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';

interface Props {
  onDragStart: (absoluteY: number) => void;
  onDragMove: (absoluteY: number) => void;
  onDragEnd: (absoluteY: number) => void;
}

export function DragHandle({ onDragStart, onDragMove, onDragEnd }: Props) {
  const panRef = useRef(null);
  const longPressRef = useRef(null);

  return (
    // Pressable absorbs taps on the handle so they don't bubble to the card's onPress
    <Pressable onPress={() => {}}>
      <LongPressGestureHandler
        ref={longPressRef}
        minDurationMs={300}
        simultaneousHandlers={[panRef]}
        onHandlerStateChange={({ nativeEvent }) => {
          if (nativeEvent.state === State.ACTIVE) {
            onDragStart(nativeEvent.absoluteY);
          }
        }}
      >
        {/* testID here so the RNGH mock can inject onLongPress onto this view */}
        <Animated.View testID="drag-handle-lp-wrapper">
          <PanGestureHandler
            ref={panRef}
            simultaneousHandlers={[longPressRef]}
            minDist={0}
            onGestureEvent={({ nativeEvent }) => {
              onDragMove(nativeEvent.absoluteY);
            }}
            onHandlerStateChange={({ nativeEvent }) => {
              if (
                nativeEvent.state === State.END ||
                nativeEvent.state === State.CANCELLED ||
                nativeEvent.state === State.FAILED
              ) {
                onDragEnd(nativeEvent.absoluteY);
              }
            }}
          >
            <Animated.View testID="drag-handle" style={styles.handle}>
              <Text style={styles.icon}>⠿</Text>
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </LongPressGestureHandler>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
    backgroundColor: '#fafafa',
  },
  icon: {
    fontSize: 9,
    color: '#d1d5db',
  },
});
```

- [ ] **Step 2: Run DragHandle tests — confirm all 3 pass**

```bash
npx jest __tests__/components/DragHandle.test.tsx --no-coverage
```

Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 3: Run full suite — confirm all green**

```bash
npx jest --no-coverage
```

Expected: all suites pass (was 33 tests; now 40 with the 7 new utility + DragHandle tests).

- [ ] **Step 4: Commit**

```bash
git add __mocks__/react-native-gesture-handler.js \
        src/components/DragHandle.tsx \
        __tests__/components/DragHandle.test.tsx \
        __tests__/utils/resolveStageFromBounds.test.ts \
        src/utils/resolveStageFromBounds.ts
git commit -m "feat: add DragHandle component and resolveStageFromBounds utility"
```

---

## Task 5: Update `TaskCard` — RED

**Files:**
- Modify: `ios-app/__tests__/components/TaskCard.test.tsx`

Add three new tests at the bottom of the existing file:

- [ ] **Step 1: Append new failing tests to TaskCard.test.tsx**

```tsx
// Add at the bottom of ios-app/__tests__/components/TaskCard.test.tsx
import { View } from 'react-native';

test('renders the dragHandle node when dragHandle prop is provided', () => {
  const { getByTestId } = render(
    <TaskCard
      task={task}
      onPress={() => {}}
      dragHandle={<View testID="test-drag-handle" />}
    />
  );
  expect(getByTestId('test-drag-handle')).toBeTruthy();
});

test('does not render a drag handle strip when dragHandle prop is absent', () => {
  const { queryByTestId } = render(
    <TaskCard task={task} onPress={() => {}} />
  );
  expect(queryByTestId('test-drag-handle')).toBeNull();
});

test('does not render a Move pill', () => {
  const { queryByText } = render(
    <TaskCard task={task} onPress={() => {}} />
  );
  expect(queryByText('Move →')).toBeNull();
});
```

- [ ] **Step 2: Run TaskCard tests — confirm the 3 new ones fail**

```bash
npx jest __tests__/components/TaskCard.test.tsx --no-coverage
```

Expected: 3 new tests fail (dragHandle renders nothing, Move pill still present from the existing implementation).

---

## Task 6: Update `TaskCard` — GREEN + commit

**Files:**
- Modify: `ios-app/src/components/TaskCard.tsx`

Make the following changes to `TaskCard.tsx`:

- [ ] **Step 1: Replace the imports section** — remove `ActionSheetIOS`

```tsx
// BEFORE (line 2):
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';

// AFTER:
import { Pressable, StyleSheet, Text, View } from 'react-native';
```

- [ ] **Step 2: Add `React` import for `ReactNode`**

```tsx
// BEFORE:
import React from 'react';

// AFTER:
import React, { ReactNode } from 'react';
```

- [ ] **Step 3: Remove `STAGE_LABELS`, `ALL_STAGES`, and the `handleMovePress` block**

Delete these lines entirely from `TaskCard.tsx`:

```tsx
const STAGE_LABELS: Record<Stage, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  done: 'Done',
};

const ALL_STAGES: Stage[] = ['backlog', 'in_progress', 'done'];
```

And delete the `handleMovePress` function inside the component body:

```tsx
  const handleMovePress = () => {
    const targets = ALL_STAGES.filter((s) => s !== task.stage);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Move to…',
        options: [...targets.map((s) => STAGE_LABELS[s]), 'Cancel'],
        cancelButtonIndex: targets.length,
      },
      (idx) => {
        if (idx < targets.length) onMoveToStage?.(targets[idx]);
      }
    );
  };
```

- [ ] **Step 4: Replace the Props interface**

```tsx
// BEFORE:
interface Props {
  task: Task;
  category?: Category;
  onPress: () => void;
  onToggleDone?: () => void;
  /** When provided, a "Move to…" pill appears on the card */
  onMoveToStage?: (stage: Stage) => void;
  /** Long-press handler — used by DraggableFlatList to start a drag */
  onLongPress?: () => void;
  /** Delay before long-press fires (default 200ms) */
  delayLongPress?: number;
  /** testID passed to the root pressable for testing */
  testID?: string;
}

// AFTER:
interface Props {
  task: Task;
  category?: Category;
  onPress: () => void;
  onToggleDone?: () => void;
  /** When provided, rendered as a left-edge drag handle strip */
  dragHandle?: ReactNode;
  /** Long-press handler — used by DraggableFlatList to start within-stage drag */
  onLongPress?: () => void;
  /** Delay before long-press fires (default 200ms) */
  delayLongPress?: number;
  /** testID passed to the root pressable for testing */
  testID?: string;
}
```

- [ ] **Step 5: Update the destructured props and remove `Stage` import**

```tsx
// BEFORE:
export function TaskCard({ task, category, onPress, onToggleDone, onMoveToStage, onLongPress, delayLongPress = 200, testID }: Props) {

// AFTER:
export function TaskCard({ task, category, onPress, onToggleDone, dragHandle, onLongPress, delayLongPress = 200, testID }: Props) {
```

Also update the import line (remove `Stage` if it is only used for `onMoveToStage`):

```tsx
// BEFORE:
import type { Category, Stage, Task } from '@/api/types';

// AFTER:
import type { Category, Task } from '@/api/types';
```

- [ ] **Step 6: Update the JSX — add dragHandle strip, remove Move pill**

Replace the return value's outermost View structure. The card currently returns a `Pressable` containing a `View style={styles.inner}`. Wrap that in a row so the handle sits to the left:

```tsx
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderLeftColor: dragHandle ? t.border : priorityBorder,
          shadowColor: '#000',
          shadowOpacity: pressed ? 0.12 : 0.05,
          shadowRadius: pressed ? 6 : 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: pressed ? 4 : 1,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.cardRow}>
        {dragHandle}
        <View style={[styles.inner, { borderLeftWidth: dragHandle ? 0 : 0, borderLeftColor: dragHandle ? 'transparent' : priorityBorder }]}>
          {/* priority stripe when no drag handle */}
          {!dragHandle && (
            <View style={[styles.priorityStripe, { backgroundColor: priorityBorder }]} />
          )}
          <View style={styles.topRow}>
            {/* Checkbox */}
            <Pressable
              onPress={() => onToggleDone?.()}
              hitSlop={8}
              style={[
                styles.checkbox,
                {
                  borderColor: isDone ? t.success : t.borderInput,
                  backgroundColor: isDone ? t.success : 'transparent',
                },
              ]}
            >
              {isDone && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>

            {/* Task text */}
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={2}
                style={[
                  styles.text,
                  {
                    color: isDone ? t.textMuted : t.text,
                    textDecorationLine: isDone ? 'line-through' : 'none',
                  },
                ]}
              >
                {task.text}
              </Text>
              {!!task.status && (
                <Text
                  testID="task-notes-preview"
                  numberOfLines={1}
                  style={[styles.notesPreview, { color: t.textMuted }]}
                >
                  {'↳ ' + task.status}
                </Text>
              )}
            </View>
          </View>

          {/* Badges row */}
          {(category || due || (task.subtasks?.length ?? 0) > 0 || task.recurrence) && (
            <View style={styles.badges}>
              {category && (
                <View style={[styles.catPill, { backgroundColor: category.color }]}>
                  <Text style={styles.catPillText}>{category.name}</Text>
                </View>
              )}
              {due && (
                <View style={[styles.dueBadge, { backgroundColor: dueBg }]}>
                  <Text style={[styles.dueBadgeText, { color: dueFg }]}>
                    {due.label}
                  </Text>
                </View>
              )}
              {task.subtasks && task.subtasks.length > 0 && (
                <Text style={[styles.subtaskText, { color: t.textLight }]}>
                  {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                </Text>
              )}
              {task.recurrence && (
                <View testID="task-recurrence-badge" style={[styles.recurrenceBadge, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
                  <Text style={styles.recurrenceBadgeText}>🔁</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
```

- [ ] **Step 7: Update the styles** — add `cardRow`, remove `movePill`/`movePillText`; keep all others intact

```tsx
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  priorityStripe: {
    // kept for reference — priority border now lives on the card's borderLeftColor
    // this style is unused but kept to avoid a TS error if referenced elsewhere
  },
```

Also remove the `movePill` and `movePillText` styles from `StyleSheet.create`.

- [ ] **Step 8: Run TaskCard tests — all 9 pass**

```bash
npx jest __tests__/components/TaskCard.test.tsx --no-coverage
```

Expected: `Tests: 9 passed, 9 total`

- [ ] **Step 9: Run full suite — all green**

```bash
npx jest --no-coverage
```

- [ ] **Step 10: Commit**

```bash
git add src/components/TaskCard.tsx __tests__/components/TaskCard.test.tsx
git commit -m "feat: add dragHandle prop to TaskCard, remove onMoveToStage / Move pill"
```

---

## Task 7: BoardScreen drag integration — RED

**Files:**
- Create: `ios-app/__tests__/screens/BoardScreen.drag.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

```tsx
// ios-app/__tests__/screens/BoardScreen.drag.test.tsx
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { BoardScreen } from '../../src/screens/BoardScreen';
import type { Board, Task } from '../../src/api/types';

// ── Mock DragHandle ─────────────────────────────────────────────────────────
// Capture each DragHandle instance's callbacks so tests can fire them directly.
let capturedHandles: Array<{
  onDragStart: (y: number) => void;
  onDragMove: (y: number) => void;
  onDragEnd: (y: number) => void;
}> = [];

jest.mock('../../src/components/DragHandle', () => ({
  DragHandle: ({ onDragStart, onDragMove, onDragEnd }: any) => {
    capturedHandles.push({ onDragStart, onDragMove, onDragEnd });
    return null;
  },
}));

// ── Standard mocks ───────────────────────────────────────────────────────────
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Me', email: 'me@test.com', username: 'me', digest_frequency: 'none' } }),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (fn: () => unknown) => React.useEffect(() => { fn(); }, []) };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const board: Board = { id: 1, owner_user_id: 1, name: 'Test Board', slug: 'test' };

const taskA: Task = {
  id: 1, text: 'Task A', status: '', stage: 'backlog', category_id: null,
  due_date: null, priority: 'none', recurrence: null, subtasks: null,
  assigned_to_user_id: null, cal_start: null, cal_end: null,
  archived: false, archived_at: null, completed_at: null, position: 0, board_id: 1,
};
const taskB: Task = {
  id: 2, text: 'Task B', status: '', stage: 'in_progress', category_id: null,
  due_date: null, priority: 'none', recurrence: null, subtasks: null,
  assigned_to_user_id: null, cal_start: null, cal_end: null,
  archived: false, archived_at: null, completed_at: null, position: 0, board_id: 1,
};

beforeEach(() => {
  fetchMock.resetMocks();
  capturedHandles = [];
});

async function renderBoard() {
  fetchMock.mockResponseOnce(JSON.stringify([taskA, taskB]));
  fetchMock.mockResponseOnce(JSON.stringify([])); // categories
  render(
    <BoardScreen
      board={board}
      onBack={jest.fn()}
      onOpenTask={jest.fn()}
      onOpenArchived={jest.fn()}
      onOpenMembers={jest.fn()}
    />
  );
  await screen.findByText('Task A', undefined, { timeout: 3000 });
}

function setupStageBounds() {
  // Stage containers have testID="stage-container-<stage>"
  // onLayout with these values populates stageBoundsRef.
  // In tests, containerTopRef=0 and scrollOffset=0, so adjustedY === absoluteY.
  fireEvent(screen.getByTestId('stage-container-backlog'), 'layout', {
    nativeEvent: { layout: { y: 0, height: 300 } },
  });
  fireEvent(screen.getByTestId('stage-container-in_progress'), 'layout', {
    nativeEvent: { layout: { y: 300, height: 300 } },
  });
  fireEvent(screen.getByTestId('stage-container-done'), 'layout', {
    nativeEvent: { layout: { y: 600, height: 300 } },
  });
}

test('calls api.updateTask with new stage when drag ends over a different stage', async () => {
  await renderBoard();
  setupStageBounds();

  // The first captured DragHandle belongs to taskA (backlog)
  fetchMock.mockResponseOnce(
    JSON.stringify({ ...taskA, stage: 'in_progress' })
  );

  // Drag taskA (backlog, Y 0-300) and release in in_progress (Y 300-600)
  capturedHandles[0].onDragStart(150);
  capturedHandles[0].onDragEnd(400);

  await waitFor(() => {
    const calls = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).includes('/api/tasks/1') && (c[1] as any)?.method === 'PUT'
    );
    expect(calls.length).toBe(1);
    expect(JSON.parse((calls[0][1] as any).body)).toMatchObject({ stage: 'in_progress' });
  });
});

test('does not call api.updateTask when drag ends in the same stage', async () => {
  await renderBoard();
  setupStageBounds();

  capturedHandles[0].onDragStart(150); // backlog
  capturedHandles[0].onDragEnd(200);   // still backlog

  // Give any async operations time to settle
  await new Promise((r) => setTimeout(r, 50));

  const updateCalls = fetchMock.mock.calls.filter(
    (c) => (c[0] as string).includes('/api/tasks/') && (c[1] as any)?.method === 'PUT'
  );
  expect(updateCalls).toHaveLength(0);
});

test('does not call api.updateTask when drag ends outside all stage bounds', async () => {
  await renderBoard();
  setupStageBounds();

  capturedHandles[0].onDragStart(150); // backlog
  capturedHandles[0].onDragEnd(1200);  // below all stages

  await new Promise((r) => setTimeout(r, 50));

  const updateCalls = fetchMock.mock.calls.filter(
    (c) => (c[0] as string).includes('/api/tasks/') && (c[1] as any)?.method === 'PUT'
  );
  expect(updateCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Run these tests — confirm they all fail**

```bash
npx jest __tests__/screens/BoardScreen.drag.test.tsx --no-coverage
```

Expected failures:
- `getByTestId('stage-container-backlog')` → element not found (testID not yet in BoardScreen)
- `capturedHandles[0]` → undefined (DragHandle not yet wired in BoardScreen)

---

## Task 8: BoardScreen drag implementation — GREEN + commit

**Files:**
- Modify: `ios-app/src/screens/BoardScreen.tsx`

Apply the following changes to `BoardScreen.tsx`. Read the file first to confirm line numbers, then edit.

- [ ] **Step 1: Add new imports at the top of `BoardScreen.tsx`**

```tsx
// Add to existing imports:
import { Animated, ..., View, type LayoutChangeEvent } from 'react-native';
// (Animated is added; LayoutChangeEvent is the type for onLayout)
import { DragHandle } from '@/components/DragHandle';
import { resolveStageFromBounds } from '@/utils/resolveStageFromBounds';
import type { StageBounds } from '@/utils/resolveStageFromBounds';
```

The full updated import from react-native (replacing the existing one):

```tsx
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
```

- [ ] **Step 2: Add drag state and refs inside the `BoardScreen` component, after the existing state declarations**

```tsx
  // ─── Drag state ─────────────────────────────────────────────────────────────
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [targetStage, setTargetStage] = useState<Stage | null>(null);
  const ghostYValue = useRef(new Animated.Value(0)).current;
  const containerTopValue = useRef(new Animated.Value(0)).current;
  const stageBoundsRef = useRef(new Map<Stage, StageBounds>());
  const scrollOffsetRef = useRef(0);
  const kanbanRef = useRef<View>(null);
```

- [ ] **Step 3: Add drag handlers inside the component, after `handleDragEnd`**

Add these after the existing `handleDragEnd` definition (the one for `NestableDraggableFlatList` reorder):

```tsx
  // ─── Cross-stage drag handlers ───────────────────────────────────────────────

  /** Resolves absoluteY (screen space) to a stage using current bounds + offsets */
  const resolveStage = useCallback(
    (absoluteY: number): Stage | null => {
      // containerTopValue.__getValue() is the screen-absolute Y of the kanban content area
      // scrollOffsetRef.current is how far the user has scrolled down
      // Together they convert absoluteY → content-relative Y for the bounds lookup
      const containerTop = (containerTopValue as any)._value ?? 0;
      const adjustedY = absoluteY - containerTop + scrollOffsetRef.current;
      return resolveStageFromBounds(adjustedY, stageBoundsRef.current);
    },
    [containerTopValue]
  );

  const handleCrossStageDragStart = useCallback(
    (task: Task, absoluteY: number) => {
      if (draggingTask) return; // ignore if already dragging
      setDraggingTask(task);
      setTargetStage(null);
      ghostYValue.setValue(absoluteY);
    },
    [draggingTask, ghostYValue]
  );

  const handleCrossStageDragMove = useCallback(
    (absoluteY: number) => {
      ghostYValue.setValue(absoluteY);
      const stage = resolveStage(absoluteY);
      setTargetStage(stage);
    },
    [ghostYValue, resolveStage]
  );

  const handleCrossStageDragEnd = useCallback(
    async (absoluteY: number) => {
      if (!draggingTask) return;
      const stage = resolveStage(absoluteY);
      if (stage && stage !== draggingTask.stage) {
        await moveToStage(draggingTask, stage);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      setDraggingTask(null);
      setTargetStage(null);
    },
    [draggingTask, resolveStage, moveToStage]
  );
```

- [ ] **Step 4: Update `renderDraggableItem` to wire `DragHandle` and remove `onMoveToStage`**

```tsx
  const renderDraggableItem = useCallback(
    (stage: Stage) =>
      ({ item, drag, isActive }: RenderItemParams<Task>) =>
        (
          <ScaleDecorator>
            <View style={[
              { marginBottom: spacing.sm },
              isActive && styles.dragging,
              // Dim source card while cross-stage drag is active
              !isActive && draggingTask?.id === item.id && styles.draggingSource,
            ]}>
              <TaskCard
                task={item}
                category={item.category_id ? categoriesById.get(item.category_id) : undefined}
                onPress={() => !isActive && !draggingTask && onOpenTask(item)}
                onToggleDone={() => toggleDone(item)}
                onLongPress={drag}
                delayLongPress={180}
                dragHandle={
                  <DragHandle
                    onDragStart={(y) => handleCrossStageDragStart(item, y)}
                    onDragMove={handleCrossStageDragMove}
                    onDragEnd={handleCrossStageDragEnd}
                  />
                }
              />
            </View>
          </ScaleDecorator>
        ),
    [categoriesById, onOpenTask, toggleDone, draggingTask,
     handleCrossStageDragStart, handleCrossStageDragMove, handleCrossStageDragEnd]
  );
```

- [ ] **Step 5: Update `StageHeader` to accept and render `isDropTarget`**

```tsx
  const StageHeader = ({
    stage,
    label,
    isDropTarget,
  }: {
    stage: Stage;
    label: string;
    isDropTarget?: boolean;
  }) => {
    const stageColor = t.stage[stage];
    return (
      <View style={[styles.stageHeader, { backgroundColor: t.bg }]}>
        <View style={[
          styles.stageHeaderInner,
          { borderLeftColor: stageColor },
          isDropTarget && { borderLeftWidth: 4, borderLeftColor: stageColor },
        ]}>
          <View style={styles.stageTitleRow}>
            <Text style={[styles.stageTitle, { color: stageColor }]}>{label}</Text>
            <View style={[styles.stageCountBadge, { backgroundColor: stageColor + '22' }]}>
              <Text style={[styles.stageCountText, { color: stageColor }]}>
                {counts[stage]}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              setQuickStage(stage);
              quickInputRef.current?.focus();
            }}
            hitSlop={10}
          >
            <Text style={{ color: stageColor, fontSize: font.size.lg, fontWeight: '700' }}>+</Text>
          </Pressable>
        </View>
        {isDropTarget && (
          <View style={[styles.dropZone, { borderColor: stageColor }]}>
            <Text style={[styles.dropZoneText, { color: stageColor }]}>✦ drop here</Text>
          </View>
        )}
      </View>
    );
  };
```

- [ ] **Step 6: Update the kanban JSX — add stage container testIDs, onLayout, scroll tracking, ghost overlay, and lock scroll during drag**

Replace the `<NestableScrollContainer ...>` block with:

```tsx
      {/* ── Kanban ─────────────────────────────────────────────────────────── */}
      <View
        ref={kanbanRef}
        style={{ flex: 1 }}
        onLayout={() => {
          kanbanRef.current?.measure((_x, _y, _w, _h, _px, py) => {
            containerTopValue.setValue(py);
          });
        }}
      >
        <NestableScrollContainer
          scrollEnabled={!draggingTask}
          onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
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
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xs,
            paddingBottom: spacing.xxl * 2,
          }}
          showsVerticalScrollIndicator={false}
        >
          {!loading && tasks.length === 0 && (
            <Text style={[styles.empty, { color: t.textMuted }]}>
              No tasks yet. Tap + to add one.
            </Text>
          )}

          {STAGES.map((s) => {
            const isDropTarget =
              !!draggingTask &&
              targetStage === s.key &&
              targetStage !== draggingTask.stage;
            return (
              <View
                key={s.key}
                testID={`stage-container-${s.key}`}
                onLayout={(e: LayoutChangeEvent) => {
                  const { y, height } = e.nativeEvent.layout;
                  stageBoundsRef.current.set(s.key, { top: y, bottom: y + height });
                }}
              >
                <StageHeader stage={s.key} label={s.label} isDropTarget={isDropTarget} />
                <NestableDraggableFlatList
                  key={`${s.key}-${stageData[s.key].length}`}
                  data={stageData[s.key]}
                  extraData={stageData[s.key]}
                  keyExtractor={keyExtractor}
                  renderItem={renderDraggableItem(s.key)}
                  onDragEnd={({ data }) => handleDragEnd(s.key, data)}
                  activationDistance={20}
                />
              </View>
            );
          })}
        </NestableScrollContainer>

        {/* Ghost card overlay — follows finger during cross-stage drag */}
        {draggingTask && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ghost,
              {
                top: Animated.subtract(ghostYValue, containerTopValue),
              },
            ]}
          >
            <View style={[styles.ghostCard, { backgroundColor: t.surface, borderColor: t.accent }]}>
              <Text style={[styles.ghostText, { color: t.text }]} numberOfLines={1}>
                {draggingTask.text}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
```

- [ ] **Step 7: Add the new styles**

```tsx
  // Add to StyleSheet.create:
  draggingSource: { opacity: 0.3 },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 6,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  dropZoneText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  ghost: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 999,
  },
  ghostCard: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    opacity: 0.92,
  },
  ghostText: {
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
  },
```

- [ ] **Step 8: Run the BoardScreen drag tests — all 3 pass**

```bash
npx jest __tests__/screens/BoardScreen.drag.test.tsx --no-coverage
```

Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 9: Run the full suite — all tests pass**

```bash
npx jest --no-coverage
```

Expected: all suites green. Previous 33 tests still pass; new total ≥ 43 tests.

- [ ] **Step 10: Commit**

```bash
git add src/screens/BoardScreen.tsx __tests__/screens/BoardScreen.drag.test.tsx
git commit -m "feat: cross-stage drag via DragHandle ghost overlay

- DragHandle (⠿) on each card triggers RNGH LongPress + Pan
- BoardScreen measures stage bounds via onLayout, resolves target stage
  from adjustedY = absoluteY - containerTop + scrollOffset
- Ghost Animated.View follows finger; target stage shows drop-zone indicator
- On release over different stage: calls existing moveToStage (optimistic update + API)
- Within-stage reorder via NestableDraggableFlatList untouched
- scrollEnabled locked during drag to prevent bounds shifting"
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| ⠿ handle on each card | Tasks 3–6 (DragHandle component + TaskCard wiring) |
| Long-press handle → ghost lifts | Task 8 (handleCrossStageDragStart) |
| Ghost follows finger | Task 8 (handleCrossStageDragMove → ghostYValue) |
| Target stage highlights with drop-zone | Task 8 (StageHeader isDropTarget + dropZone style) |
| Release over different stage → moveToStage | Task 8 (handleCrossStageDragEnd) |
| Release same stage → no-op | Task 7 test + Task 8 guard |
| Release out of bounds → no-op | Task 7 test + Task 8 guard (resolveStage returns null) |
| scrollEnabled locked during drag | Task 8 (scrollEnabled={!draggingTask}) |
| "Move →" pill removed | Tasks 5–6 (onMoveToStage removed from TaskCard) |
| All 33 existing tests stay green | Verified in Step 9 of Task 8 |

**No placeholders, no TBDs.**

**Type consistency:** `StageBounds` defined in `resolveStageFromBounds.ts` and imported in `BoardScreen.tsx`. `handleCrossStageDragStart/Move/End` named consistently throughout. `stage-container-${s.key}` testID matches `getByTestId('stage-container-backlog')` in tests.
