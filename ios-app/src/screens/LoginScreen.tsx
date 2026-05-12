import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useAuth } from '@/auth/AuthContext';
import { useTheme, font, spacing } from '@/theme';
import { ApiError } from '@/api/client';

export function LoginScreen() {
  const t = useTheme();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await signup(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? 'Wrong email or password'
            : err.message || 'Something went wrong'
          : 'Network error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.flex}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>Todo</Text>
            <Text style={[styles.subtitle, { color: t.textMuted }]}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </Text>
          </View>

          <View style={styles.form}>
            {mode === 'signup' && (
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Optional"
              />
            )}
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              placeholder="••••••••"
              error={error ?? undefined}
            />

            <Button
              label={mode === 'login' ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={loading}
              disabled={!email || !password}
            />

            <Button
              label={
                mode === 'login'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'
              }
              variant="ghost"
              onPress={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
              style={styles.toggle}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    marginTop: spacing.xxl * 2,
    marginBottom: spacing.xxl,
    alignItems: 'flex-start',
  },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  subtitle: { fontSize: font.size.md, marginTop: spacing.xs },
  form: { flex: 1 },
  toggle: { marginTop: spacing.md },
});
