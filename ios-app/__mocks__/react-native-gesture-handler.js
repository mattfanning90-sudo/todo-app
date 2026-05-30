const React = require('react');
const { View, Pressable } = require('react-native');

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
  Pressable,
};
