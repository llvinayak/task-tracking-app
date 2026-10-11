import React, { useContext } from 'react';

import { PageHeader } from './PageHeader';
import { HeaderVariantContext } from './Screen';

/**
 * The header a self-headed module screen passes to `<Screen header=...>`: `tab`
 * inside the tab bar, `push` (with Back) when the same screen is pushed from the drawer.
 * Render it in EVERY state (loading, error, empty, content) so the title, the
 * global strips and Back never disappear.
 */
export function ModuleHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const variant = useContext(HeaderVariantContext);
  return (
    <PageHeader
      variant={variant}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(trailing ? { trailing } : {})}
    />
  );
}
