import { darkTheme, lightTheme, typography, spacing } from '@/theme/tokens';

function parse(c: string): [number, number, number] {
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c);
  if (!m) throw new Error(`not an opaque rgb color: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = (c: string) => {
  const [r, g, b] = parse(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

describe('documented contrast ratios (docs/UX_DESIGN_PLAN.md 2.5/6)', () => {
  const L = lightTheme.colors;
  const D = darkTheme.colors;

  it('placeholder on surface', () => {
    expect(r2(ratio(L.placeholder, L.surface))).toBe(4.83);
    expect(r2(ratio(D.placeholder, D.surface))).toBe(6.03);
  });

  it('field border on surface meets 3:1', () => {
    expect(r2(ratio(L.fieldBorder, L.surface))).toBe(3.3);
    expect(r2(ratio(D.fieldBorder, D.surface))).toBe(3.93);
    expect(ratio(L.fieldBorder, L.app)).toBeGreaterThanOrEqual(3);
    expect(ratio(D.fieldBorder, D.app)).toBeGreaterThanOrEqual(3);
    expect(ratio(D.fieldBorder, D.elevated)).toBeGreaterThanOrEqual(3);
  });

  it('avatar letters', () => {
    expect(r2(ratio(L.onBrand, L.avatarDev))).toBe(7.9);
    expect(r2(ratio(L.onBrand, L.avatarQa))).toBe(5.02);
    expect(r2(ratio(D.onBrand, D.avatarDev))).toBe(9.67);
    expect(r2(ratio(D.onBrand, D.avatarQa))).toBe(13.73);
  });

  it('tab indicator and unfiled dot (non-text 3:1)', () => {
    expect(r2(ratio(L.indicator, L.surface))).toBe(6.29);
    expect(r2(ratio(D.indicator, D.surface))).toBe(6.57);
    expect(r2(ratio(L.dotWarn, L.surface))).toBe(3.19);
    expect(r2(ratio(D.dotWarn, D.surface))).toBe(10.71);
  });

  it('text pairs stay at AA', () => {
    expect(ratio(L.fgSubtle, L.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D.fgSubtle, D.surface)).toBeGreaterThanOrEqual(4.5);
    expect(r2(ratio(L.onBrand, L.brand[600]))).toBe(6.29);
    expect(r2(ratio(D.onBrand, D.brand[600]))).toBe(7.08);
    expect(r2(ratio(L.onBrand, L.danger.base))).toBe(4.83);
    expect(r2(ratio(D.onBrand, D.danger.base))).toBe(6.97);
    for (const tone of ['success', 'warning', 'danger', 'info', 'neutral'] as const) {
      expect(ratio(L[tone].fg, L[tone].soft)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(D[tone].fg, D[tone].soft)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('text pairs used on tinted / soft backgrounds (>= 4.5:1)', () => {
  const both = [
    ['light', lightTheme.colors],
    ['dark', darkTheme.colors],
  ] as const;

  it.each(both)('%s: subtle/muted text on every surface it is used on', (_name, C) => {
    for (const bg of [C.surface, C.app, C.subtle, C.hover, C.elevated]) {
      expect(ratio(C.fgSubtle, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(C.fgMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(both)('%s: muted text on the brand tint (timer strip project line, selected chips)', (_name, C) => {
    expect(ratio(C.fgMuted, C.brand[50])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(C.brand[600], C.brand[50])).toBeGreaterThanOrEqual(4.5); // selected chip label and count (tone brand)
    expect(ratio(C.brand[700], C.brand[50])).toBeGreaterThanOrEqual(4.5); // brand Badge
  });

  it.each(both)('%s: status text tones on the plain surfaces', (_name, C) => {
    for (const tone of ['success', 'warning', 'danger', 'info'] as const) {
      expect(ratio(C[tone].fg, C.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(C[tone].fg, C.app)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(C.fgMuted, C.warning.soft)).toBeGreaterThanOrEqual(4.5);
  });

  it('documents the known-weak pair: subtle text on the brand tint is NOT allowed (light)', () => {
    expect(ratio(lightTheme.colors.fgSubtle, lightTheme.colors.brand[50])).toBeLessThan(4.6);
  });
});

describe('scale tokens', () => {
  it('has a 12px mobile type floor', () => {
    expect(typography['2xs'].fontSize).toBe(12);
    for (const k of Object.keys(typography) as (keyof typeof typography)[]) {
      expect(typography[k].fontSize).toBeGreaterThanOrEqual(12);
    }
  });
  it('spacing only holds allowed values', () => {
    expect(Object.values(spacing).sort((a, b) => a - b)).toEqual([0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48]);
  });
});
