import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

interface Props {
  onDragStart: (absoluteY: number) => void;
  onDragMove: (absoluteY: number) => void;
  onDragEnd: (absoluteY: number) => void;
}

/**
 * Left-edge grab strip: long-press then drag to move a card across stages.
 *
 * Redesigned from the old LongPress+Pan *component* API (deprecated) to the
 * modern Gesture API. `.runOnJS(true)` runs the callbacks straight on the JS
 * thread, so there's no reanimated-worklet plumbing — the handlers just call
 * the props. The strip is also a real touch target now (30px + hitSlop); the
 * previous 16px handle was effectively impossible to grab on device, which is
 * why cross-stage drag "didn't work".
 */
export function DragHandle({ onDragStart, onDragMove, onDragEnd }: Props) {
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(180)
    .onStart((e) => onDragStart(e.absoluteY))
    .onUpdate((e) => onDragMove(e.absoluteY))
    .onFinalize((e) => onDragEnd(e.absoluteY));

  return (
    <GestureDetector gesture={pan}>
      <View testID="drag-handle" style={styles.handle} hitSlop={{ top: 6, bottom: 6, left: 10 }}>
        <Text style={styles.icon}>⠿</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 30,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
    backgroundColor: '#fafafa',
  },
  icon: {
    fontSize: 13,
    color: '#9ca3af',
    letterSpacing: 1,
  },
});
