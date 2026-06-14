import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme, spacing, radius, font } from '@/theme';

interface Props {
  label?: string;
  value: string;           // 'YYYY-MM-DD' or ''
  onChange: (v: string) => void;
  placeholder?: string;
}

function toDate(iso: string): Date {
  if (!iso) return new Date();
  // Parse as local date (YYYY-MM-DD) to avoid UTC offset shifting the day.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function DateField({ label, value, onChange, placeholder = 'Select date' }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  const hasValue = Boolean(value);

  function handleChange(_event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (selected) {
      onChange(toISO(selected));
    }
  }

  function handleClear() {
    onChange('');
  }

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text>
      ) : null}

      <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.borderInput }]}>
        <Pressable
          style={styles.fieldTap}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={label ?? 'Select date'}
          hitSlop={8}
        >
          <Text
            style={[
              styles.valueText,
              { color: hasValue ? t.text : t.textLight },
            ]}
            numberOfLines={1}
          >
            {hasValue ? formatDisplay(value) : placeholder}
          </Text>
        </Pressable>

        {hasValue ? (
          <Pressable
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear date"
            style={styles.clearBtn}
          >
            <Text style={[styles.clearText, { color: t.textMuted }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="spinner"
          accentColor={t.accent}
          textColor={t.text}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
  },
  fieldTap: {
    flex: 1,
    justifyContent: 'center',
  },
  valueText: {
    fontSize: font.size.md,
  },
  clearBtn: {
    paddingLeft: spacing.sm,
    justifyContent: 'center',
  },
  clearText: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
});
