import React from 'react';
import { StyleSheet, View } from 'react-native';

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
}

interface State {
  failed: boolean;
}

function Fallback({ inline, message, onRetry }: { inline: boolean; message?: string; onRetry: () => void }) {
  const t = useTheme();
  if (inline) {
    return (
      <View
        accessibilityRole="alert"
        style={[styles.inline, { borderColor: t.colors.danger.base, backgroundColor: t.colors.danger.soft, borderRadius: t.radius.xl }]}
      >
        <Text size="sm" style={{ color: t.colors.danger.fg }}>
          {message ?? "This part couldn't be displayed."}
        </Text>
        <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
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
    </View>
  );
}

/**
 * Catches render errors below it. The fallback is friendly and never shows the
 * error message or stack; only a sanitized message goes to `onError`.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message.slice(0, 200) : 'Unknown render error';
    if (this.props.onError) this.props.onError(message);
    else console.error('[ErrorBoundary]', message);
  }

  private retry = () => this.setState({ failed: false });

  override render() {
    if (this.state.failed) {
      return <Fallback inline={!!this.props.inline} message={this.props.message} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  center: { textAlign: 'center' },
  inline: { borderWidth: 1, padding: 12, gap: 8 },
});
