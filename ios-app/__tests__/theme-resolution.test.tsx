import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'dark'),
  setItemAsync: jest.fn(async () => {}),
}));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => 'light',
}));

function Probe() {
  const t = useTheme();
  return <Text testID="name">{t.name}</Text>;
}

it('honours the persisted preference over the OS scheme', async () => {
  const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(getByTestId('name').props.children).toBe('dark'));
});
