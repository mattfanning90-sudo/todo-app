# Cross-Stage Drag Design
_2026-05-30_

## Summary

Add cross-stage task movement to the iOS Kanban board via a ghost drag interaction. A ⠿ drag handle on each card, when long-pressed and panned, lifts a ghost of the card that follows the finger across all three stages. Releasing over a different stage moves the task there (appended to the bottom). Within-stage reorder via `NestableDraggableFlatList` is unchanged.

---

## Interaction model

1. **At rest** — every card has a ⠿ icon on its left edge (16px strip). Long-pressing the card body still activates within-stage reorder (existing behaviour, unchanged).
2. **Drag starts** — long-press the ⠿ handle (300ms). The card body dims to a placeholder outline. A ghost copy of the card floats at the finger position.
3. **Dragging** — the ghost follows the finger. The stage the finger is currently over highlights with a dashed drop-zone indicator. Crossing into a new stage fires a light haptic.
4. **Drop** — release lifts:
   - **Different stage**: task moves to the bottom of that stage, brief green highlight, `ImpactFeedbackStyle.Medium` haptic, `moveToStage()` API call.
   - **Same stage or out-of-bounds**: ghost springs back, no API call.
5. **"Move →" ActionSheet pill** is removed from cards — the drag handle replaces it.

---

## Components

### New: `DragHandle` (`ios-app/src/components/DragHandle.tsx`)

Wraps `LongPressGestureHandler` + `PanGestureHandler` from RNGH. Renders a ⠿ icon. Knows nothing about stages.

```
Props:
  onDragStart(absoluteY: number): void
  onDragMove(absoluteY: number): void
  onDragEnd(absoluteY: number): void
```

### Modified: `TaskCard`

New optional prop: `dragHandle?: ReactNode`. When provided, rendered as a 16px left-edge strip before the checkbox. The `onMoveToStage` prop and "Move →" pill are removed.

### Modified: `BoardScreen`

Owns all drag state:

| State / ref | Type | Purpose |
|---|---|---|
| `draggingTask` | `Task \| null` | Which task is being dragged |
| `ghostY` | `Animated.Value` | Drives ghost card vertical position |
| `targetStage` | `Stage \| null` | Stage currently under the ghost |
| `stageBounds` | `Map<Stage, {top,bottom}>` ref | Screen-absolute Y ranges, measured on layout |

Renders:
- A `View` wrapper per stage section with `onLayout` + `ref.measure` to capture `stageBounds`
- An absolute-positioned ghost `Animated.View` (visible when `draggingTask` is set)
- Drop-zone indicators inside the highlighted target stage

`scrollEnabled={!draggingTask}` on `NestableScrollContainer` prevents bounds from shifting mid-drag.

---

## Data flow

```
DragHandle.onLongPress
  → BoardScreen.handleDragStart(task, absoluteY)
      sets draggingTask, animates ghostY

DragHandle.onPan (each frame)
  → BoardScreen.handleDragMove(absoluteY)
      updates ghostY
      resolves targetStage from stageBounds
      highlights target stage header + drop-zone

DragHandle.onPanEnd
  → BoardScreen.handleDragEnd(absoluteY)
      if targetStage !== draggingTask.stage → moveToStage(task, targetStage)
      else → spring ghost back
      clears draggingTask, targetStage
```

`moveToStage` is the existing function: updates local state optimistically, calls `api.updateTask`, reverts + alerts on failure.

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Released outside all stage bounds | Treated as same-stage drop — ghost springs back, no API call |
| Released on same stage | No-op, ghost springs back |
| API failure | Existing `moveToStage` error handling: Alert + `load()` revert |
| Drag starts while another drag is active | `handleDragStart` is no-op if `draggingTask` is already set |
| Scroll during drag | `NestableScrollContainer` scroll disabled while `draggingTask !== null` |

---

## Tests (TDD — written before implementation)

| File | Tests |
|---|---|
| `__tests__/components/DragHandle.test.tsx` | fires `onDragStart` on long-press; fires `onDragMove` on pan; fires `onDragEnd` on pan release; renders ⠿ icon |
| `__tests__/components/TaskCard.test.tsx` | renders `dragHandle` strip when prop provided; does not render strip when prop absent; does not render "Move →" pill |
| `__tests__/screens/BoardScreen.drag.test.tsx` | calls `moveToStage` when drag ends over a different stage's Y range; does not call API when released in same stage; does not call API when released out of bounds |

All 33 existing tests must remain green.

---

## Out of scope

- Drag position within the destination stage (card always appends to bottom)
- Android-specific behaviour (ActionSheet already works cross-platform; drag handle uses RNGH which is cross-platform, but visual QA on Android is not in scope for this sprint)
- Task sharing (`POST /api/tasks/:id/share`) — separate backlog item
