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
