import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme';

interface Props {
  checked: boolean;
  onToggle: () => void;
  color?: string;
  testID?: string;
}

export function Checkbox({ checked, onToggle, color, testID }: Props) {
  const t = useTheme();
  const ring = color ?? t.accent;
  return (
    <Pressable
      onPress={onToggle}
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={11}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 24, height: 24, borderRadius: 12, borderWidth: 2,
          borderColor: checked ? t.accent : ring,
          backgroundColor: checked ? t.accent : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}
