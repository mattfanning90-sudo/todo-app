// ios-app/src/screens/ImportScreen.tsx
// JSON bulk-import screen — parity with web importTasks (public/app.js ~1072).
// Accepts a pasted JSON array of task objects; POSTs to /api/import.
// Server always imports to the user's default board (ensureDefaultBoard),
// so no board_id is needed in the request body.
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '@/api/client';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useTheme, spacing, font, radius } from '@/theme';

export function ImportScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleImport() {
    setSuccessMsg(null);
    setErrorMsg(null);

    // Parse + validate
    let data: unknown;
    try {
      data = JSON.parse(json.trim());
    } catch {
      setErrorMsg('Invalid JSON — check the format and try again.');
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      setErrorMsg('Expected a non-empty JSON array.');
      return;
    }

    setLoading(true);
    try {
      await api.importTasks(data as Record<string, unknown>[]);
      const count = (data as unknown[]).filter(
        (item) => typeof item === 'object' && item !== null && 'text' in item && (item as Record<string, unknown>).text
      ).length;
      setSuccessMsg(`${count} task${count !== 1 ? 's' : ''} imported.`);
      setJson('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed. Please try again.';
      Alert.alert('Import failed', msg);
    } finally {
      setLoading(false);
    }
  }

  const s = StyleSheet.create({
    scroll: { padding: spacing.lg },
    noteCard: {
      backgroundColor: t.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
    },
    noteText: { fontSize: font.size.sm, color: t.textMuted, lineHeight: 18 },
    success: {
      backgroundColor: t.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderLeftWidth: 3,
      borderLeftColor: '#22c55e',
    },
    successText: { fontSize: font.size.sm, color: '#22c55e', fontWeight: font.weight.medium },
    error: {
      backgroundColor: t.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.danger,
    },
    errorText: { fontSize: font.size.sm, color: t.danger, fontWeight: font.weight.medium },
  });

  return (
    <Screen padded={false}>
      <ScreenHeader variant="detail" title="Import tasks" onBack={() => nav.goBack()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Board note */}
          <View style={s.noteCard}>
            <Text style={s.noteText}>
              Tasks are imported into your default board. Paste a JSON array where each object has at
              least a <Text style={{ fontWeight: font.weight.bold }}>text</Text> field. Optional
              fields: <Text style={{ fontWeight: font.weight.bold }}>status</Text>,{' '}
              <Text style={{ fontWeight: font.weight.bold }}>stage</Text>,{' '}
              <Text style={{ fontWeight: font.weight.bold }}>due_date</Text>,{' '}
              <Text style={{ fontWeight: font.weight.bold }}>priority</Text>,{' '}
              <Text style={{ fontWeight: font.weight.bold }}>owners</Text>.
            </Text>
          </View>

          {/* Success / error banners */}
          {successMsg ? (
            <View style={s.success}>
              <Text style={s.successText}>{successMsg}</Text>
            </View>
          ) : null}
          {errorMsg ? (
            <View style={s.error}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* JSON input */}
          <TextField
            label="JSON array"
            placeholder={'[\n  { "text": "My task", "stage": "backlog" }\n]'}
            value={json}
            onChangeText={(v) => { setJson(v); setSuccessMsg(null); setErrorMsg(null); }}
            multiline
            numberOfLines={10}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={{ minHeight: 200, paddingTop: spacing.md, textAlignVertical: 'top' }}
          />

          <Button
            label="Import"
            onPress={handleImport}
            loading={loading}
            disabled={!json.trim()}
            style={{ marginTop: spacing.sm }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
