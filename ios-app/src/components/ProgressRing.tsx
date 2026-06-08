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
