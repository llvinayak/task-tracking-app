import { screen } from '@testing-library/react-native';

type Inst = ReturnType<typeof screen.UNSAFE_getAllByType>[number];

const CONTROL_ROLES = new Set(['button', 'tab', 'radio', 'link', 'checkbox', 'switch', 'menuitem']);

/** Visible text of an element: every string child of every Text below it, in order. */
function visibleTexts(el: Inst): string[] {
  const parts: string[] = [];
  const walk = (n: Inst) => {
    if (n.props?.accessibilityElementsHidden || n.props?.importantForAccessibility === 'no-hide-descendants') return;
    // Only host/composite "Text" nodes carry strings; collect from any node whose children are strings.
    const c = n.props?.children as unknown;
    if (typeof n.type === 'string' && n.type === 'Text') {
      const kids = (Array.isArray(c) ? c : [c]) as unknown[];
      parts.push(kids.filter((x) => typeof x === 'string' || typeof x === 'number').join(''));
      return;
    }
    for (const k of n.children) if (typeof k !== 'string') walk(k as Inst);
  };
  walk(el);
  return parts.map((x) => x.trim()).filter(Boolean);
}

const norm = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

/**
 * Controls whose accessible name legitimately summarises a whole row or card rather than echoing a
 * button label (title + status + owners ...), or reads in a different order by design. Everything else
 * must START with its visible text (Label in Name, WCAG 2.5.3). Keep this list short and specific.
 */
export const LABEL_IN_NAME_ALLOWLIST: readonly RegExp[] = [
  /^Timer running on /, // timer strip row: visible title + project, name leads with the state
  /^Project: /, // project chip: visible "All Projects", name says what it is
  /^Task: /, // time-entry task select
  /^Choose a task$/,
  /^Choose /, // task picker rows
  /^Assign .* as /, // candidate rows: visible name, name adds the role
  /^Open (task|subtask|parent task|attachment) /,
  /^Open /,
  /^Move to /, // status sheet rows
  /^Edit /,
  /^Profile and settings$/, // More: the row's visible secondary lines (name, role) are not part of its label
];

export interface LabelViolation {
  role: string;
  label: string;
  visible: string;
}

/**
 * Label in Name audit over everything rendered. A control is any element with a control role, or any
 * accessible element with an accessibilityLabel and a press handler (also those with no explicit role).
 * Rule: the normalised label must START with the normalised visible text (so "Do not Save" does not
 * satisfy a "Save" button); for aggregate rows/cards (3+ text nodes) every visible WORD must be in the
 * name instead. Otherwise the short allowlist above applies. Icon-only controls (no visible
 * text) are skipped: they only need a label, which Button enforces by type.
 */
export function labelInNameViolations(extraAllow: readonly RegExp[] = []): string[] {
  const allow = [...LABEL_IN_NAME_ALLOWLIST, ...extraAllow];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of screen.UNSAFE_root.findAll((x: Inst) => typeof x.type === 'string')) {
    const p = n.props as Record<string, unknown>;
    const label = p.accessibilityLabel as string | undefined;
    if (!label) continue;
    const role = (p.accessibilityRole as string | undefined) ?? (p.role as string | undefined);
    const pressable = typeof p.onClick === 'function' || typeof p.onResponderRelease === 'function';
    const isControl = (role !== undefined && CONTROL_ROLES.has(role)) || (!!p.accessible && pressable && role !== 'none');
    if (!isControl) continue;
    const nodes = visibleTexts(n);
    const visible = norm(nodes.join(' '));
    if (!visible) continue;
    const l = norm(label);
    if (l.startsWith(visible)) continue;
    // An aggregate row/card (3+ text nodes: title, code, status, dates ...) is summarised in a different order:
    // there EVERY visible word must still be in the name.
    if (nodes.length >= 3) {
      const words = new Set(l.split(' '));
      if (visible.split(' ').every((w) => words.has(w))) continue;
    }
    if (allow.some((re) => re.test(label))) continue;
    const key = `${role}|${label}|${visible}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${role ?? 'pressable'}: label "${label}" does not start with its visible text "${visible}"`);
  }
  return out;
}
