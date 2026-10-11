import React, { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { clearFatalError, getFatalError, recordError, subscribeErrors, type ErrorReport } from '@/lib/errorReporter';

import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './ui/Button';
import { Text } from './ui/Text';

interface Props {
  children: React.ReactNode;
  /** Compact inline fallback (for a single widget) instead of a full screen. */
  inline?: boolean;
  /** Text for the inline variant, e.g. "This content couldn't be displayed." */
  message?: string;
  /** Called with the (sanitized) error message for reporting. Never rendered. */
  onError?: (message: string) => void;
  /** When this value changes (compared by identity) a failed boundary retries by itself: fresh data deserves a fresh try. */
  resetKey?: unknown;
  /** Optional escape hatch shown in the inline fallback, e.g. "Open task" so a broken card never blocks the user. */
  action?: { label: string; onPress: () => void };
}

interface State {
  failed: boolean;
  report: ErrorReport | null;
}

/**
 * "Details" (collapsed by default): a short code and a sanitised message the user can read to us. Never a token,
 * e-mail address, password or raw stack.
 */
function Details({ report }: { report: ErrorReport }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.details}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide details' : 'Details'}
        accessibilityState={{ expanded: open }}
        style={styles.detailsToggle}
      >
        <Text size="sm" weight="semibold" tone="brand">
          {open ? 'Hide details' : 'Details'}
        </Text>
      </Pressable>
      {open ? (
        <View testID="error-details" accessible accessibilityLabel={`Error ${report.code}. ${report.message}`}>
          <Text size="sm" weight="semibold" selectable>
            {`Code: ${report.code}`}
          </Text>
          <Text size="xs" tone="muted" selectable>
            {report.message}
          </Text>
          {report.where ? (
            <Text size="xs" tone="subtle" selectable>
              {report.where}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorFallback({
  inline,
  message,
  onRetry,
  report,
  action,
}: {
  inline: boolean;
  message?: string;
  onRetry: () => void;
  report?: ErrorReport | null;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  if (inline) {
    return (
      <View
        accessibilityRole="alert"
        style={[
          styles.inline,
          {
            borderColor: t.colors.danger.base,
            backgroundColor: t.colors.danger.soft,
            borderRadius: t.radius.xl,
          },
        ]}
      >
        <Text size="sm" style={{ color: t.colors.danger.fg }}>
          {message ?? "This part couldn't be displayed."}
        </Text>
        {action ? <Button label={action.label} variant="secondary" fullWidth={false} onPress={action.onPress} /> : null}
        <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
        {report ? <Details report={report} /> : null}
      </View>
    );
  }
  return (
    <View style={[styles.screen, { backgroundColor: t.colors.app }]} accessibilityRole="alert">
      <Text size="xl" weight="semibold" style={styles.center}>
        Something went wrong
      </Text>
      <Text tone="muted" style={styles.center}>
        The app hit an unexpected problem. Your data is safe. Try again, and if it keeps happening, restart the app.
      </Text>
      <Button label="Try again" onPress={onRetry} fullWidth={false} />
      {report ? <Details report={report} /> : null}
    </View>
  );
}

/**
 * Shows the friendly screen for a FATAL JS error that happened outside React rendering (event handlers, timers,
 * promises) and was captured by the global handler, instead of the app dying silently. Mount it once, high up.
 */
export function FatalErrorGate({ children }: { children: React.ReactNode }) {
  const fatal = useSyncExternalStore(subscribeErrors, getFatalError, getFatalError);
  if (fatal) return <ErrorFallback inline={false} onRetry={clearFatalError} report={fatal} />;
  return <>{children}</>;
}

/**
 * Catches render errors below it. The fallback is friendly and never shows the
 * error message or stack; only a sanitized message goes to `onError`.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { failed: false, report: null };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info?: { componentStack?: string | null }) {
    const report = recordError(error, {
      componentStack: info?.componentStack ?? undefined,
    });
    this.setState({ report });
    // The documented contract: onError only ever receives the SANITIZED message (never tokens, e-mails, paths).
    if (this.props.onError) this.props.onError(report.message);
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, report: null });
  }

  private retry = () => this.setState({ failed: false, report: null });

  override render() {
    if (this.state.failed) {
      return (
        <ErrorFallback
          inline={!!this.props.inline}
          message={this.props.message}
          onRetry={this.retry}
          report={this.state.report}
          action={this.props.action}
        />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  center: { textAlign: 'center' },
  inline: { borderWidth: 1, padding: 12, gap: 8 },
  details: { gap: 8, alignItems: 'center' },
  detailsToggle: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
