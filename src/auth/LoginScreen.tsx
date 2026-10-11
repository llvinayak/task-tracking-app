import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { isAppError } from '@/api/errors';
import { Banner, Button, Input, Screen, Text } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Seconds remaining until `until`, a performance.now() timestamp (monotonic,
 * so changing the device clock cannot extend or skip a cooldown). The timer
 * stops itself the moment the countdown reaches zero.
 */
function useRemainingSeconds(until: number | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (until === null) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const r = Math.max(0, Math.ceil((until - performance.now()) / 1000));
      setRemaining(r);
      return r;
    };
    if (tick() === 0) return;
    const id = setInterval(() => {
      if (tick() === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  return remaining;
}

const formatWait = (s: number) => {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const notice = useAuthStore((s) => s.notice);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const mounted = useRef(true);

  // Set to true in the effect body so React StrictMode's mount -> unmount ->
  // mount cycle does not leave the ref stuck at false.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const waitSeconds = useRemainingSeconds(retryUntil);
  const coolingDown = waitSeconds > 0;

  const submit = async () => {
    if (submitting || coolingDown) return;
    const trimmed = email.trim();
    const errors: { email?: string; password?: string } = {};
    if (!trimmed) errors.email = 'Enter your email address';
    else if (!EMAIL_RE.test(trimmed)) errors.email = 'Enter a valid email address';
    if (!password) errors.password = 'Enter your password';
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      await login({ email: trimmed, password });
      // Success: RootNavigator swaps to the app stack on its own.
    } catch (e) {
      if (!mounted.current) return;
      if (isAppError(e)) {
        if (e.kind === 'rate_limited' && e.retryAfterSeconds) {
          setRetryUntil(performance.now() + e.retryAfterSeconds * 1000);
        }
        setFormError(e.message);
      } else {
        setFormError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboardAvoiding contentStyle={styles.content}>
      <View style={styles.header}>
        <Text size="3xl" weight="bold">
          TaskTracking
        </Text>
        <Text tone="muted">Sign in to continue</Text>
      </View>

      <View style={styles.form}>
        {notice === 'expired' ? (
          <Banner
            testID="session-expired-banner"
            tone="warning"
            message="Your session expired. Please sign in again."
          />
        ) : null}
        {formError ? <Banner testID="login-error" message={formError} /> : null}
        {coolingDown ? (
          <Banner
            tone="info"
            message={`Too many attempts. You can try again in ${formatWait(waitSeconds)}.`}
          />
        ) : null}

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!submitting}
        />
        <Input
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          editable={!submitting}
        />

        <Button
          testID="login-submit"
          label="Sign in"
          onPress={() => void submit()}
          loading={submitting}
          disabled={coolingDown}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: 32 },
  header: { gap: 4 },
  form: { gap: 16 },
});
