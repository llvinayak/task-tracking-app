import { useNavigation } from '@react-navigation/native';
import React, { useContext } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlobalStrips } from '@/components/GlobalStrips';
import { useTheme } from '@/theme/ThemeProvider';
import { ANDROID_TOUCH } from '@/theme/tokens';

import { Icon } from './Icon';
import { TopInsetHandledContext } from './Screen';
import { Text } from './Text';

/**
 * The single header. `tab`: left title (+ trailing slot). `push`: back button +
 * context title. Pads the status bar itself (unless a host already did) and
 * renders the global offline/timer strips right under the row, so they appear
 * on every screen that has a header. With no title the `tab` variant shows only
 * the safe-area gap and the strips.
 */
export function PageHeader({
  variant,
  title,
  subtitle,
  onBack,
  trailing,
}: {
  variant: 'tab' | 'push';
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const handled = useContext(TopInsetHandledContext);
  const nav = useNavigation();
  const touch = Platform.OS === 'android' ? ANDROID_TOUCH : t.minTouch;
  const showRow = variant === 'push' || !!title || !!trailing;

  return (
    <View
      testID="page-header"
      style={{
        paddingTop: handled ? 0 : insets.top,
        backgroundColor: showRow ? t.colors.surface : t.colors.app,
        borderBottomColor: t.colors.line,
        borderBottomWidth: showRow ? 1 : 0,
      }}
    >
      {showRow ? (
        <View style={styles.row}>
          {variant === 'push' ? (
            <Pressable
              onPress={onBack ?? (() => nav.goBack())}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={[styles.back, { minHeight: touch, minWidth: touch }]}
            >
              <Icon name="chevron-back" size={24} tone="brand" />
              <Text weight="semibold" tone="brand">
                Back
              </Text>
            </Pressable>
          ) : null}
          <View style={[styles.titleWrap, variant === 'tab' && styles.tabTitle]}>
            {title ? (
              <Text
                size={variant === 'tab' ? 'xl' : 'lg'}
                weight={variant === 'tab' ? 'bold' : 'semibold'}
                accessibilityRole="header"
                numberOfLines={variant === 'tab' ? 2 : 1}
                maxFontScale={1.5}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text size="xs" tone="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
      ) : null}
      <GlobalStrips />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 8, gap: 4 },
  back: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingRight: 8 },
  titleWrap: { flex: 1, justifyContent: 'center' },
  tabTitle: { paddingLeft: 8 },
  trailing: { paddingRight: 8, maxWidth: '55%' },
});
