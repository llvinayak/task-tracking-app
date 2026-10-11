import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import {
  PREVIEW_BLOCKS,
  PREVIEW_CHARS,
  isSafeUrl,
  linkHasUserinfo,
  linkHost,
  linkNeedsConfirm,
  parseRichTextEx,
  type Block,
  type Inline,
} from '@/utils/html';

import { ErrorBoundary } from './ErrorBoundary';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Opens http(s)/mailto only, and http only in development builds when `allowHttp`. */
export async function openExternal(url: string, schemes: readonly string[] = ['http', 'https', 'mailto']) {
  // Re-checked at press time: only whitelisted schemes ever leave the app.
  if (!isSafeUrl(url, schemes)) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Cannot open link', 'No app on this device can open it.');
  }
}

/** Confirms first when the visible text does not show where the link really goes. */
function openLink(text: string, href: string) {
  if (!linkNeedsConfirm(text, href)) {
    void openExternal(href);
    return;
  }
  const warn = linkHasUserinfo(href) ? '\n\nWarning: this address has a user name before the site name, a common trick. The site it really opens is shown above.' : '';
  Alert.alert('Open this link?', `This link goes to ${linkHost(href) || href}${warn}\n\n${href}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', onPress: () => void openExternal(href) },
  ]);
}

function InlineRun({ children }: { children: Inline[] }) {
  const t = useTheme();
  return (
    <>
      {children.map((c, i) => {
        if (c.kind === 'break') return <Text key={i}>{'\n'}</Text>;
        const { href } = c;
        // Show the real destination when the text hides it.
        const showHost = href && linkNeedsConfirm(c.text, href);
        return (
          <Text
            key={i}
            size="base"
            weight={c.bold ? 'bold' : 'regular'}
            tone={href ? 'brand' : 'default'}
            accessibilityRole={href ? 'link' : undefined}
            onPress={href ? () => openLink(c.text, href) : undefined}
            style={[
              c.italic && { fontStyle: 'italic' },
              c.underline || href ? { textDecorationLine: 'underline' } : null,
              c.strike && { textDecorationLine: 'line-through' },
              c.code && { fontFamily: MONO, backgroundColor: t.colors.subtle },
            ]}
          >
            {c.text}
            {showHost ? ` (${linkHost(href)})` : ''}
          </Text>
        );
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  const t = useTheme();
  switch (block.kind) {
    case 'paragraph':
      return (
        <Text>
          <InlineRun>{block.children}</InlineRun>
        </Text>
      );
    case 'heading':
      return (
        <Text size={block.level === 2 ? 'xl' : 'lg'} weight="semibold" accessibilityRole="header">
          <InlineRun>{block.children}</InlineRun>
        </Text>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: t.colors.lineStrong }]}>
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.marker}>{block.ordered ? `${i + 1}.` : '•'}</Text>
              <View style={styles.itemBody}>
                {item.map((b, j) => (
                  <BlockView key={j} block={b} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'code':
      return (
        <View style={[styles.code, { backgroundColor: t.colors.subtle, borderRadius: t.radius.lg }]}>
          <Text size="sm" style={{ fontFamily: MONO }}>
            {block.text}
          </Text>
        </View>
      );
  }
}

function RichTextInner({ html, emptyLabel }: { html: string | null | undefined; emptyLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  const { blocks, truncated } = useMemo(
    () => parseRichTextEx(html, expanded ? {} : { maxChars: PREVIEW_CHARS, maxBlocks: PREVIEW_BLOCKS }),
    [html, expanded],
  );

  if (blocks.length === 0) {
    return emptyLabel ? (
      <Text tone="subtle" size="sm">
        {emptyLabel}
      </Text>
    ) : null;
  }
  return (
    <View style={styles.root} testID="rich-text">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
      {truncated && !expanded ? (
        <Button label="Show more" variant="secondary" fullWidth={false} onPress={() => setExpanded(true)} />
      ) : null}
      {truncated && expanded ? (
        <Text size="xs" tone="subtle" testID="rich-text-truncated">
          This content is too long to show in full.
        </Text>
      ) : null}
    </View>
  );
}

/** Read-only, whitelist-only rendering of stored task descriptions. Render errors stay local. */
export function RichText(props: { html: string | null | undefined; emptyLabel?: string }) {
  return (
    <ErrorBoundary inline message="This description couldn't be displayed.">
      <RichTextInner {...props} />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  quote: { borderLeftWidth: 3, paddingLeft: 12, gap: 4 },
  list: { gap: 4 },
  item: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 18 },
  itemBody: { flex: 1, gap: 4 },
  code: { padding: 12 },
});
