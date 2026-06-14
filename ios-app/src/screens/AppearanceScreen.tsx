import React from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard } from '@/components/SectionCard';
import { ListRow } from '@/components/ListRow';
import { spacing } from '@/theme';
import { useThemeContext, type ThemePreference } from '@/theme/ThemeProvider';

const OPTIONS: { value: ThemePreference; label: string; sub: string }[] = [
  { value: 'system', label: 'System', sub: 'Match your device setting' },
  { value: 'light', label: 'Light', sub: 'Always light' },
  { value: 'dark', label: 'Dark', sub: 'Always dark' },
];

export function AppearanceScreen() {
  const nav = useNavigation();
  const { preference, setPreference } = useThemeContext();
  return (
    <Screen padded={false}>
      <ScreenHeader variant="detail" title="Appearance" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <SectionCard>
          {OPTIONS.map((o, i) => (
            <ListRow
              key={o.value}
              title={o.label}
              subtitle={o.sub}
              accessory="check"
              selected={preference === o.value}
              divider={i < OPTIONS.length - 1}
              onPress={() => setPreference(o.value)}
            />
          ))}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
