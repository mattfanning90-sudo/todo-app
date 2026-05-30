const React = require('react');
const { View, Pressable } = require('react-native');

const MOCK_ABSOLUTE_Y = 100;

const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

// ── Legacy component API (still used by some handlers) ───────────────────────
function LongPressGestureHandler({ children, onHandlerStateChange }) {
  return React.cloneElement(React.Children.only(children), {
    onLongPress: () =>
      onHandlerStateChange?.({
        nativeEvent: { state: State.ACTIVE, absoluteY: MOCK_ABSOLUTE_Y },
      }),
  });
}

function PanGestureHandler({ children }) {
  return React.Children.only(children);
}

// ── Modern Gesture API (Gesture.Pan() + GestureDetector) ─────────────────────
// Chainable no-op builder: every config method returns the same object so the
// fluent chain in DragHandle resolves. Gesture firing is native-only, so it is
// not simulated here — gesture behaviour is validated on-device.
function makeGesture() {
  const g = {};
  const methods = [
    'runOnJS', 'activateAfterLongPress', 'onStart', 'onUpdate', 'onEnd',
    'onFinalize', 'onBegin', 'onChange', 'minDistance', 'minDuration',
    'enabled', 'shouldCancelWhenOutside', 'hitSlop', 'withTestId',
    'simultaneousWithExternalGesture', 'requireExternalGestureToFail',
    'blocksExternalGesture',
  ];
  methods.forEach((m) => { g[m] = () => g; });
  return g;
}

const Gesture = {
  Pan: makeGesture,
  LongPress: makeGesture,
  Tap: makeGesture,
  Race: () => makeGesture(),
  Simultaneous: () => makeGesture(),
  Exclusive: () => makeGesture(),
};

function GestureDetector({ children }) {
  return children;
}

module.exports = {
  State,
  LongPressGestureHandler,
  PanGestureHandler,
  Gesture,
  GestureDetector,
  GestureHandlerRootView: ({ children }) => children,
  NativeViewGestureHandler: View,
  Pressable,
};
