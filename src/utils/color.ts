/**
 * Colors that arrive as DATA (project color, status color from the DB) are
 * validated before reaching a style, because an invalid color string throws
 * in React Native. Anything unrecognised falls back to the caller's theme token.
 */
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%,\s/]+\)$/;

export function resolveColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  return HEX.test(v) || FUNC.test(v) ? v : fallback;
}
