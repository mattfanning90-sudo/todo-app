# Taskly iOS — Foundation (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the iOS theme onto a single Taskly palette, add a persisted System/Light/Dark theme option, ship the reusable component kit + icon set, and repoint the 4 already-migrated screens — without changing how they look — so the 9 screen restyles that follow are thin composition.

**Architecture:** One flat `Theme` (delete the `tk` sub-palette); a `ThemeProvider` context resolves `system|light|dark` from a `SecureStore`-persisted preference; shared kit primitives (`Card`, `SectionCard`, `ScreenHeader`, `ListRow`, `Checkbox`, `Chip`, `BrandMark`, `Icon`) consume the theme so screens stop hand-rolling cards/headers. Deleting the `tk` type makes `tsc` enumerate every stale reference — the compiler is the migration checklist.

**Tech Stack:** Expo SDK 55, React Native 0.83, TypeScript, `expo-secure-store` (already a dep), `react-native-svg` (already a dep) + `lucide-react-native` (new), Jest + React Native Testing Library.

**Branch:** `feat/ios-taskly-finish` (off `main`, includes the task-reminders feature). Spec: `docs/superpowers/specs/2026-06-13-taskly-ios-finish-design.md`.

**Verification note (read before starting):** This is a restyle. Per the spec's expert-reviewed verification strategy, the real safety nets are **`tsc`**, **`__tests__/boot.test.tsx`**, a tiny **theme-contract test**, and a **human in the simulator** (both themes). We do NOT write snapshot or visual-regression tests (they would all fail by design and assert nothing). Where a step's outcome is visual/mechanical, the "test" is an exact verification command, not a unit test.

**PR1 acceptance gate:** After Task 9, the 4 already-migrated surfaces (`TodayScreen`, `BoardScreen`, `ProfileScreen`, the tab bar) look **identical** to before (a near-pure refactor), `grep -rn "\.tk\." ios-app/src` returns nothing, and `tsc`/`boot.test`/`expo export` are green. The only intentional new UI is the Appearance theme picker (Task 7).

---

## File Structure

**Created**
- `ios-app/src/theme/ThemeProvider.tsx` — context: preference state, SecureStore persistence, `system→OS` resolution.
- `ios-app/src/components/Icon.tsx` — Taskly-named wrapper over `lucide-react-native`, default 44×44 tap frame, `accessibilityLabel`.
- `ios-app/src/components/Card.tsx` — white rounded surface + soft shadow.
- `ios-app/src/components/SectionCard.tsx` — grouped-list card (eyebrow + hairline-divided rows).
- `ios-app/src/components/ScreenHeader.tsx` — `primary` (tab) + `detail` (back) header variants.
- `ios-app/src/components/ListRow.tsx` — leading/title/subtitle/trailing row, ≥56pt.
- `ios-app/src/components/Checkbox.tsx` — 22–24px circle in a 44×44 hit frame.
- `ios-app/src/components/Chip.tsx` — unified `filter` + `choice` chip.
- `ios-app/src/components/BrandMark.tsx` — coral app tile + "Taskly" wordmark.
- `ios-app/src/screens/AppearanceScreen.tsx` — System/Light/Dark picker.
- `ios-app/__tests__/theme-contract.test.ts` — asserts Taskly values + that `tk` is gone.
- `ios-app/__tests__/theme-resolution.test.tsx` — asserts `system|light|dark` resolution.

**Modified**
- `ios-app/src/theme/index.ts` — flat Taskly `Theme`; `useTheme()` reads context; delete `tk`; `radius.pill`/`radius.card`.
- `ios-app/App.tsx` — wrap tree in `<ThemeProvider>`.
- `ios-app/src/navigation/RootNavigator.tsx` — resolve theme from context, not bare `useColorScheme`; add `Appearance` route; repoint `.tk.`.
- `ios-app/src/screens/TodayScreen.tsx`, `BoardScreen.tsx`, `ProfileScreen.tsx` — repoint `.tk.` → base tokens (mechanical); Profile gains an Appearance row.
- `ios-app/src/components/Button.tsx` — add `destructive` variant.
- `ios-app/src/components/TextField.tsx` — add coral focus state.
- `ios-app/package.json` — add `lucide-react-native`.
- `docs/cross-platform.md`, `docs/platform-parity-report.md` — correct the "tokens identical" claims.

---

## Task 1: Token foundation — one Taskly `Theme`, delete `tk`

**Files:**
- Test: `ios-app/__tests__/theme-contract.test.ts`
- Modify: `ios-app/src/theme/index.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
// ios-app/__tests__/theme-contract.test.ts
import { lightTheme, darkTheme, radius } from '@/theme';

describe('Taskly theme contract', () => {
  it('uses the coral accent in both schemes', () => {
    expect(lightTheme.accent).toBe('#FF6B47');
    expect(darkTheme.accent).toBe('#FF6B47');
    expect(lightTheme.accentHover).toBe('#E8522E');
  });
  it('has warm Taskly surfaces, not the old blue-grey', () => {
    expect(lightTheme.bg).toBe('#F2F2F7');
    expect(lightTheme.text).toBe('#1E1E2E');
    expect(darkTheme.bg).toBe('#16161D');
  });
  it('has no blue leak in priority/stage', () => {
    expect(lightTheme.priority.high).toBe('#FF6B47');
    expect(lightTheme.priority.low).toBe('#9CA3AF');
    expect(lightTheme.stage.in_progress).toBe('#64748B'); // neutral, not #3B82F6
  });
  it('exposes the new card radius and a pill radius', () => {
    expect(radius.card).toBe(16);
    expect(radius.pill).toBe(999);
  });
  it('no longer exposes a `tk` sub-palette', () => {
    expect((lightTheme as Record<string, unknown>).tk).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd ios-app && npx jest __tests__/theme-contract.test.ts`
Expected: FAIL — `lightTheme`/`darkTheme` are not exported yet (today only `useTheme` is) and values differ.

- [ ] **Step 3: Rewrite `ios-app/src/theme/index.ts`** (export the palettes, flatten, Taskly values, no `tk`)

```ts
import { useColorScheme } from 'react-native';

export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;       // hairline
  borderInput: string;  // input border (1.5px)
  text: string;
  textMuted: string;
  textLight: string;
  accent: string;
  accentHover: string;
  accentText: string;
  accentMuted: string;  // tinted coral fill
  danger: string;
  success: string;
  warning: string;
  overlay: string;      // modal/sheet scrim
  shadowStyle: {
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
  stage: { backlog: string; in_progress: string; done: string };
  priority: { high: string; medium: string; low: string; none: string };
}

export const lightTheme: Theme = {
  name: 'light',
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  border: 'rgba(30,30,46,0.08)',
  borderInput: 'rgba(30,30,46,0.15)',
  text: '#1E1E2E',
  textMuted: 'rgba(30,30,46,0.45)',
  textLight: 'rgba(30,30,46,0.30)',
  accent: '#FF6B47',
  accentHover: '#E8522E',
  accentText: '#FFFFFF',
  accentMuted: 'rgba(255,107,71,0.10)',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#F59E0B',
  overlay: 'rgba(30,30,46,0.40)',
  shadowStyle: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  stage: { backlog: '#94A3B8', in_progress: '#64748B', done: '#16A34A' },
  priority: { high: '#FF6B47', medium: '#F59E0B', low: '#9CA3AF', none: '#9CA3AF' },
};

export const darkTheme: Theme = {
  name: 'dark',
  bg: '#16161D',
  surface: '#1E1E28',
  surfaceElevated: '#2A2A36',
  border: 'rgba(255,255,255,0.08)',
  borderInput: 'rgba(255,255,255,0.15)',
  text: '#F2F2F7',
  textMuted: 'rgba(242,242,247,0.50)',
  textLight: 'rgba(242,242,247,0.35)',
  accent: '#FF6B47',
  accentHover: '#E8522E',
  accentText: '#FFFFFF',
  accentMuted: 'rgba(255,107,71,0.15)',
  danger: '#F87171',
  success: '#22C55E',
  warning: '#F59E0B',
  overlay: 'rgba(0,0,0,0.50)',
  shadowStyle: { shadowColor: '#000', shadowOpacity: 0.30, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  stage: { backlog: '#94A3B8', in_progress: '#64748B', done: '#22C55E' },
  priority: { high: '#FF6B47', medium: '#F59E0B', low: '#9CA3AF', none: '#9CA3AF' },
};

// NOTE: useTheme is re-pointed at the ThemeProvider context in Task 2.
// Temporary OS-only resolution so this task compiles in isolation:
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, card: 16, pill: 999, xl: 20 };
export const font = {
  size: { xs: 11, sm: 12, md: 14, lg: 17, xl: 22, xxl: 28 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' } as const,
};
```

- [ ] **Step 4: Run the contract test — verify it passes**

Run: `cd ios-app && npx jest __tests__/theme-contract.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add ios-app/src/theme/index.ts ios-app/__tests__/theme-contract.test.ts
git commit -m "feat(ios): collapse theme onto one Taskly palette, delete tk"
```

> After this commit, `tsc` will report errors for every `t.tk.*` reference in the 4 migrated screens + RootNavigator. That is expected — Task 6 fixes them. Do not run the full `tsc` gate until Task 6.

---

## Task 2: ThemeProvider + persisted System/Light/Dark

**Files:**
- Create: `ios-app/src/theme/ThemeProvider.tsx`
- Test: `ios-app/__tests__/theme-resolution.test.tsx`
- Modify: `ios-app/src/theme/index.ts` (point `useTheme` at the context), `ios-app/App.tsx`, `ios-app/src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Write the failing resolution test**

```tsx
// ios-app/__tests__/theme-resolution.test.tsx
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
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd ios-app && npx jest __tests__/theme-resolution.test.tsx`
Expected: FAIL — `@/theme/ThemeProvider` does not exist.

- [ ] **Step 3: Create `ios-app/src/theme/ThemeProvider.tsx`**

```tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { lightTheme, darkTheme, type Theme } from '@/theme';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORE_KEY = 'taskly.themePref';

interface ThemeState {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const os = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setPref(v); })
      .catch(() => {});
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPref(p);
    SecureStore.setItemAsync(STORE_KEY, p).catch(() => {});
  };

  const theme = useMemo(() => {
    const scheme = preference === 'system' ? (os ?? 'light') : preference;
    return scheme === 'dark' ? darkTheme : lightTheme;
  }, [preference, os]);

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeContext(): ThemeState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useThemeContext must be used within ThemeProvider');
  return c;
}
```

- [ ] **Step 4: Point `useTheme` at the context** — in `ios-app/src/theme/index.ts`, replace the temporary `useTheme` from Task 1 with:

```ts
// at top of file, after the palette exports:
import { useThemeContext } from '@/theme/ThemeProvider';
// ...
export function useTheme(): Theme {
  return useThemeContext().theme;
}
```
Remove the now-unused `import { useColorScheme } from 'react-native';` from `index.ts` (the provider owns it). Keep the `lightTheme`/`darkTheme` exports.

- [ ] **Step 5: Wrap the app** — in `ios-app/App.tsx`, import and wrap. The provider must sit **outside** `AuthProvider` and `RootNavigator` so all UI (and nav chrome) reads it:

```tsx
import { ThemeProvider } from '@/theme/ThemeProvider';
// ...
function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <ReminderSync />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 6: Fix RootNavigator's nav theme** — in `ios-app/src/navigation/RootNavigator.tsx`, replace the bare `useColorScheme()` (line ~100) so the React Navigation light/dark theme follows the resolved app theme:

```tsx
// remove:  import { useColorScheme } from 'react-native';  (if now unused)
// remove:  const scheme = useColorScheme();
// keep:    const t = useTheme();
// change the navTheme line to read the resolved theme name:
const navTheme = t.name === 'light' ? DefaultTheme : DarkTheme;
```
(Leave the `.tk.` references in this file for Task 6.)

- [ ] **Step 7: Run the resolution test — verify it passes**

Run: `cd ios-app && npx jest __tests__/theme-resolution.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add ios-app/src/theme/ ios-app/App.tsx ios-app/src/navigation/RootNavigator.tsx ios-app/__tests__/theme-resolution.test.tsx
git commit -m "feat(ios): ThemeProvider with persisted system/light/dark preference"
```

---

## Task 3: Icon library + `Icon` wrapper

**Files:**
- Modify: `ios-app/package.json` (via expo install)
- Create: `ios-app/src/components/Icon.tsx`

- [ ] **Step 1: Install the icon library** (SVG-based → OTA-safe; `react-native-svg` already present)

Run: `cd ios-app && npx expo install lucide-react-native`
Expected: adds `lucide-react-native` to `package.json` dependencies.

- [ ] **Step 2: Create `ios-app/src/components/Icon.tsx`**

```tsx
import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import {
  Search, Bell, Settings, MoreHorizontal, ChevronRight, ChevronLeft,
  Check, Mail, Repeat, Plus, X, Trash2,
} from 'lucide-react-native';
import { useTheme } from '@/theme';

const MAP = {
  search: Search, bell: Bell, settings: Settings, more: MoreHorizontal,
  chevron: ChevronRight, back: ChevronLeft, check: Check, mail: Mail,
  repeat: Repeat, plus: Plus, close: X, trash: Trash2,
} as const;

export type IconName = keyof typeof MAP;

interface Props {
  name: IconName;
  label: string;            // required: accessibility label
  size?: number;
  color?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Icon({ name, label, size = 22, color, onPress, style }: Props) {
  const t = useTheme();
  const Glyph = MAP[name];
  const glyph = <Glyph size={size} color={color ?? t.textMuted} strokeWidth={2} />;
  if (!onPress) {
    return <View accessibilityLabel={label} accessibilityElementsHidden style={style}>{glyph}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {glyph}
    </Pressable>
  );
}
```

- [ ] **Step 3: Verify it type-checks and the bundler resolves the import**

Run: `cd ios-app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "Icon.tsx" || echo "Icon.tsx clean"`
Expected: `Icon.tsx clean`.

- [ ] **Step 4: Commit**

```bash
git add ios-app/package.json ios-app/package-lock.json ios-app/src/components/Icon.tsx
git commit -m "feat(ios): add lucide icon set + Icon wrapper with a11y labels"
```

---

## Task 4: Kit primitives — Card, SectionCard, ScreenHeader, ListRow, Checkbox, Chip, BrandMark

Each is small and independent; commit once at the end of the task. Create all 7 files.

- [ ] **Step 1: `ios-app/src/components/Card.tsx`**

```tsx
import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { useTheme, radius, spacing } from '@/theme';

interface Props {
  children: React.ReactNode;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, padded = true, onPress, style }: Props) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: radius.card,
    padding: padded ? spacing.lg : 0,
    ...t.shadowStyle,
    // shadows don't read on the near-black dark bg → add a hairline
    ...(t.name === 'dark' ? { borderWidth: 1, borderColor: t.border } : null),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { shadowOpacity: 0.1 }, style]}>
      {children}
    </Pressable>
  );
}
```

- [ ] **Step 2: `ios-app/src/components/SectionCard.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme, radius, spacing, font } from '@/theme';

interface Props {
  children: React.ReactNode;   // typically <ListRow/>s
  eyebrow?: string;
  style?: ViewStyle;
}

export function SectionCard({ children, eyebrow, style }: Props) {
  const t = useTheme();
  return (
    <View style={style}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: t.textMuted }]}>{eyebrow}</Text> : null}
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: radius.card,
          overflow: 'hidden',
          ...t.shadowStyle,
          ...(t.name === 'dark' ? { borderWidth: 1, borderColor: t.border } : null),
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.7,
    textTransform: 'uppercase', marginBottom: spacing.sm, marginLeft: spacing.xs,
  },
});
```

- [ ] **Step 3: `ios-app/src/components/ListRow.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, font } from '@/theme';
import { Icon } from '@/components/Icon';

interface Props {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  accessory?: 'chevron' | 'check' | 'none';
  selected?: boolean;
  destructive?: boolean;
  divider?: boolean;        // SectionCard sets false on the last row
  onPress?: () => void;
}

export function ListRow({
  title, subtitle, leading, trailing, accessory = 'none',
  selected, destructive, divider = true, onPress,
}: Props) {
  const t = useTheme();
  const acc =
    accessory === 'chevron' ? <Icon name="chevron" label="" size={18} color={t.textLight} />
    : accessory === 'check' && selected ? <Icon name="check" label="Selected" size={18} color={t.accent} />
    : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityState={selected ? { selected: true } : undefined}
      style={({ pressed }) => [
        styles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
    >
      {leading ? <View>{leading}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: destructive ? t.danger : t.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {trailing ?? acc}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 56, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  title: { fontSize: font.size.md, fontWeight: font.weight.medium },
  subtitle: { fontSize: font.size.sm, marginTop: 2 },
});
```

- [ ] **Step 4: `ios-app/src/components/ScreenHeader.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, font } from '@/theme';
import { Icon } from '@/components/Icon';

interface Props {
  title: string;
  variant?: 'primary' | 'detail';
  eyebrow?: string;
  onBack?: () => void;
  actions?: React.ReactNode;   // e.g. search/bell cluster, or a Save button
}

export function ScreenHeader({ title, variant = 'detail', eyebrow, onBack, actions }: Props) {
  const t = useTheme();
  if (variant === 'primary') {
    return (
      <View style={styles.primary}>
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: t.textMuted }]}>{eyebrow}</Text> : null}
          <Text style={[styles.h1, { color: t.text }]}>{title}</Text>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    );
  }
  return (
    <View style={[styles.detail, { borderBottomColor: t.border }]}>
      <View style={styles.side}>
        {onBack ? <Icon name="back" label="Back" size={24} onPress={onBack} /> : null}
      </View>
      <Text style={[styles.h2, { color: t.text }]} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: spacing.xl },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrow: { fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  detail: { flexDirection: 'row', alignItems: 'center', height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 60, justifyContent: 'center' },
  h2: { flex: 1, textAlign: 'center', fontSize: font.size.lg, fontWeight: font.weight.bold },
});
```

- [ ] **Step 5: `ios-app/src/components/Checkbox.tsx`** (44pt hit frame, multi-signal done state)

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme';

interface Props {
  checked: boolean;
  onToggle: () => void;
  color?: string;         // border colour (e.g. priority); fill when checked
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
```

- [ ] **Step 6: `ios-app/src/components/Chip.tsx`** (unify the 3 today)

```tsx
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useTheme, radius, font } from '@/theme';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  mode?: 'filter' | 'choice';
  color?: string;          // choice mode: semantic fill when active
}

export function Chip({ label, active, onPress, mode = 'filter', color }: Props) {
  const t = useTheme();
  const activeBg = mode === 'choice' ? (color ?? t.accent) : t.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: active ? activeBg : 'rgba(30,30,46,0.06)',
      }}
    >
      <Text style={{
        fontSize: 13, fontWeight: font.weight.semibold,
        color: active ? '#fff' : t.textMuted, textTransform: 'capitalize',
      }}>{label}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 7: `ios-app/src/components/BrandMark.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, font } from '@/theme';

export function BrandMark({ size = 56 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.tile, { width: size, height: size, borderRadius: radius.lg, backgroundColor: t.accent }]}>
        <Text style={{ color: '#fff', fontSize: size * 0.5, fontWeight: '700' }}>✓</Text>
      </View>
      <Text style={[styles.word, { color: t.text }]}>Taskly</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: font.size.xxl, fontWeight: font.weight.bold, letterSpacing: -0.5 },
});
```

- [ ] **Step 8: Type-check the new components**

Run: `cd ios-app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/(Card|SectionCard|ScreenHeader|ListRow|Checkbox|Chip|BrandMark)\.tsx" || echo "kit clean"`
Expected: `kit clean`.

- [ ] **Step 9: Commit**

```bash
git add ios-app/src/components/Card.tsx ios-app/src/components/SectionCard.tsx ios-app/src/components/ScreenHeader.tsx ios-app/src/components/ListRow.tsx ios-app/src/components/Checkbox.tsx ios-app/src/components/Chip.tsx ios-app/src/components/BrandMark.tsx
git commit -m "feat(ios): Taskly component kit (Card, SectionCard, ScreenHeader, ListRow, Checkbox, Chip, BrandMark)"
```

---

## Task 5: Restyle Button + TextField

**Files:** Modify `ios-app/src/components/Button.tsx`, `ios-app/src/components/TextField.tsx`

- [ ] **Step 1: Add the `destructive` variant to `Button.tsx`** — change the `variant` prop type and the `bg`/`fg`/border logic:

```tsx
// prop type:
variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';

// bg:
const bg =
  variant === 'primary' ? t.accent
  : variant === 'secondary' ? t.surface
  : 'transparent';                       // ghost + destructive

// fg:
const fg =
  variant === 'primary' ? t.accentText
  : variant === 'destructive' ? t.danger
  : variant === 'ghost' ? t.accent
  : t.text;

// in the Pressable style array, border for the secondary variant:
borderColor: variant === 'secondary' ? t.border : 'transparent',
borderWidth: variant === 'secondary' ? 1 : 0,
```
Also add `accessibilityRole="button"` to the `Pressable`. (Secondary now sits on `surface`, matching Taskly cards.)

- [ ] **Step 2: Add a coral focus state to `TextField.tsx`** — track focus and colour the border:

```tsx
import React, { useState } from 'react';
// ...
export function TextField({ label, error, style, onFocus, onBlur, ...rest }: Props) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.danger : focused ? t.accent : t.borderInput;
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.textLight}
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[styles.input, { backgroundColor: t.surface, borderColor, borderWidth: 1.5, color: t.text }, style]}
      />
      {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
    </View>
  );
}
```
(Background moves from `surfaceElevated` to `surface` to match Taskly inputs; border is 1.5px.)

- [ ] **Step 3: Type-check**

Run: `cd ios-app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/(Button|TextField)\.tsx" || echo "primitives clean"`
Expected: `primitives clean`.

- [ ] **Step 4: Commit**

```bash
git add ios-app/src/components/Button.tsx ios-app/src/components/TextField.tsx
git commit -m "feat(ios): restyle Button (add destructive) + TextField (coral focus)"
```

---

## Task 6: Repoint the 4 migrated surfaces — no visual change

The migrated screens read the deleted `tk` sub-palette. Repoint to base tokens. Because Task 1 ported the **`tk` values** into base, this is a pure rename and the screens must look **identical**.

**Files:** Modify `ios-app/src/screens/TodayScreen.tsx`, `BoardScreen.tsx`, `ProfileScreen.tsx`, `ios-app/src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Apply this exact token mapping** in all four files (every `t.tk.X` → the right base token):

| `t.tk.*` (old) | base token (new) |
|---|---|
| `t.tk.bg` | `t.bg` |
| `t.tk.card` | `t.surface` |
| `t.tk.text` | `t.text` |
| `t.tk.muted` | `t.textMuted` |
| `t.tk.line` | `t.border` |
| `t.tk.accent` | `t.accent` |
| `t.tk.accentHover` | `t.accentHover` |
| `t.tk.prioHigh` | `t.priority.high` |
| `t.tk.prioMed` | `t.priority.medium` |
| `t.tk.prioLow` | `t.priority.low` |

Any `t.tk.shadow` usage (a CSS string, unused for layout) → delete the line; these screens already inline `shadowColor/shadowOpacity/...`.

- [ ] **Step 2: Confirm no `tk` references remain anywhere**

Run: `grep -rn "\.tk\." ios-app/src || echo "no tk references — clean"`
Expected: `no tk references — clean`.

- [ ] **Step 3: Full type-check passes for the first time since Task 1**

Run: `cd ios-app && npx tsc --noEmit`
Expected: no errors. (If any `t.tk.*` was missed, `tsc` names the file/line — fix and re-run.)

- [ ] **Step 4: Boot test mounts the real navigator + migrated screens**

Run: `cd ios-app && npx jest __tests__/boot.test.tsx`
Expected: PASS (no `Cannot read property … of undefined` from a stale `tk` access).

- [ ] **Step 5: Visual identity check (manual, the real gate)**

Run: `cd ios-app && npx expo run:ios` (or reload a running simulator). Compare Today / Board / Profile / tab bar against a pre-Task-1 screenshot. Expected: **pixel-identical** (same coral, same warm bg, same cards). If anything shifted, a value was mis-ported in Task 1 — fix the value, not the screen.

- [ ] **Step 6: Commit**

```bash
git add ios-app/src/screens/TodayScreen.tsx ios-app/src/screens/BoardScreen.tsx ios-app/src/screens/ProfileScreen.tsx ios-app/src/navigation/RootNavigator.tsx
git commit -m "refactor(ios): repoint migrated screens to base Taskly tokens (no visual change)"
```

---

## Task 7: Appearance theme picker (the one intentional new UI)

Adds the System/Light/Dark control and its entry point on Profile.

**Files:** Create `ios-app/src/screens/AppearanceScreen.tsx`; modify `ios-app/src/navigation/RootNavigator.tsx` (route + param type), `ios-app/src/navigation/types.ts` (param), `ios-app/src/screens/ProfileScreen.tsx` (Appearance row)

- [ ] **Step 1: Create `ios-app/src/screens/AppearanceScreen.tsx`**

```tsx
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
```

- [ ] **Step 2: Register the route** — in `ios-app/src/navigation/types.ts`, add `Appearance: undefined;` to the Profile stack param list (the list `ProfileStackParams` that already contains `Profile`, `Settings`). In `ios-app/src/navigation/RootNavigator.tsx`, inside `ProfileNav()`'s `ProfileStack.Navigator`, add:

```tsx
import { AppearanceScreen } from '@/screens/AppearanceScreen';
// ...
<ProfileStack.Screen name="Appearance" component={AppearanceScreen} />
```

- [ ] **Step 3: Add the Appearance row on Profile** — in `ios-app/src/screens/ProfileScreen.tsx`, in the settings list, add a row above "Notifications" (uses the screen's existing `SettingRow` component and `navigation`):

```tsx
<SettingRow label="Appearance" onPress={() => navigation.navigate('Appearance')} />
```

- [ ] **Step 4: Type-check + boot test**

Run: `cd ios-app && npx tsc --noEmit && npx jest __tests__/boot.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual check** — Profile → Appearance → pick Dark; the whole app (incl. tab bar) switches and the choice **survives an app restart** (SecureStore). Set back to System.

- [ ] **Step 6: Commit**

```bash
git add ios-app/src/screens/AppearanceScreen.tsx ios-app/src/navigation/RootNavigator.tsx ios-app/src/navigation/types.ts ios-app/src/screens/ProfileScreen.tsx
git commit -m "feat(ios): Appearance setting (System/Light/Dark) on Profile"
```

---

## Task 8: Correct the design-token docs

**Files:** Modify `docs/cross-platform.md`, `docs/platform-parity-report.md`

- [ ] **Step 1:** In `docs/cross-platform.md`, the "Design Tokens" table maps accent to the blue-era semantics. Update the **Accent / primary** row value to `#FF6B47` (web `--primary` / `--tk-accent` ↔ iOS `t.accent`) and the Background row to the warm Taskly bg, so the table reflects the now-shared coral palette. Add a line under the table: "iOS theme lives in `ios-app/src/theme/index.ts` as one flat palette (the former `tk` sub-object was collapsed in 2026-06; there is no separate Taskly namespace)."

- [ ] **Step 2:** In `docs/platform-parity-report.md` §4, replace "Tokens: identical ✓" with an accurate note: web and iOS now share the Taskly palette (coral `#FF6B47`), with iOS exposing a System/Light/Dark preference (web is Light/Dark). 

- [ ] **Step 3: Commit**

```bash
git add docs/cross-platform.md docs/platform-parity-report.md
git commit -m "docs: correct token-parity claims after iOS Taskly theme collapse"
```

---

## Task 9: Full verification gate (PR1 acceptance)

No code change — this is the gate before opening the PR. Run every check; all must pass.

- [ ] **Step 1: Types** — `cd ios-app && npx tsc --noEmit` → no errors.
- [ ] **Step 2: No stale palette** — `grep -rn "\.tk\." ios-app/src` → empty.
- [ ] **Step 3: Unit/boot tests** — `cd ios-app && npm test` → green (includes `theme-contract`, `theme-resolution`, `nav-version-alignment`, `boot`).
- [ ] **Step 4: Doctor** — `cd ios-app && npx expo-doctor` → no issues.
- [ ] **Step 5: Real Metro bundle** — `cd ios-app && npx expo export --platform ios` → succeeds (catches unresolved-import breakage the mocked jest suite can't, e.g. the lucide/svg import).
- [ ] **Step 6: Simulator, BOTH themes** — `cd ios-app && npx expo run:ios`. Walk Today / Board / Profile / tab bar in light and dark; confirm identical-to-before look and that Appearance switching works. This is the acceptance gate.
- [ ] **Step 7: Open the PR** for `feat/ios-taskly-finish` → `main`. Title: "feat(ios): Taskly theme foundation + component kit + appearance setting". Body: link the spec; call out the acceptance criterion (4 migrated screens unchanged) and that **no `eas build`/`eas update` should be cut yet** — the 9 lagging screens are still old-style; release only after the screen PRs land.

---

## Self-review (done at authoring time)

- **Spec coverage:** §1 token foundation → Task 1; §2 theme system → Tasks 2 & 7; §3 kit → Tasks 4 & 5; §4 icon swap → Task 3; §7 consistency (shadow/radius/chip) → folded into the kit (single `shadowStyle`, `radius.card=16`, one `Chip`); §8 docs → Task 8; verification → Task 9. The **9 screen restyles (§5)** and the cross-cutting Dynamic-Type pass are intentionally **out of this plan** — see roadmap below.
- **No placeholders:** every step has concrete code or an exact command + expected output.
- **Type consistency:** `lightTheme`/`darkTheme`/`Theme` (Task 1) are consumed unchanged by `ThemeProvider` (Task 2), the kit (Task 4), and `AppearanceScreen` (Task 7); `useThemeContext`/`ThemePreference` names match across Tasks 2 and 7; `Icon`/`IconName` (Task 3) used by `ListRow`/`ScreenHeader` (Task 4).

---

## Roadmap — the 9 screen restyles (separate plans, authored after PR1)

Each screen is an independent, shippable unit built on the now-real kit API. Author one plan per cluster **after** PR1 merges (so the plans reference the kit's actual props, avoiding drift). Order per the product-designer's priority:

1. **`2026-…-taskly-ios-login-boardlist.md`** — LoginScreen (BrandMark, coral) + BoardListScreen (ScreenHeader primary, board-card list). Highest brand visibility.
2. **`2026-…-taskly-ios-daily-surfaces.md`** — TaskDetailScreen (section cards, kit Checkbox), NotificationsScreen, SearchScreen (fix the stage-badge contrast).
3. **`2026-…-taskly-ios-secondary.md`** — DashboardScreen, BoardMembersScreen, ArchivedScreen, **SettingsScreen** (restyle the reminders toggle/time/lead + digest now in `SettingsScreen.tsx` onto SectionCard/ListRow).

Deferred follow-ups (tracked, not planned here): native date picker in TaskDetail; Settings/Profile IA consolidation; notification deep-linking; ProgressRing SVG rewrite; app-wide Dynamic Type. Cut **one `eas build`** for the milestone only after cluster 3 lands.
