/**
 * Design tokens - mirrors task-tracking-admin/src/index.css (:root and .dark)
 * and tailwind.config.js. This is the ONLY file allowed to contain raw colors.
 */

type RGB = readonly [number, number, number];
const rgb = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

interface Palette {
  brand: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, RGB>;
  surfaceApp: RGB;
  surface1: RGB;
  surface2: RGB;
  surface3: RGB;
  surfaceHover: RGB;
  fg: RGB;
  fgMuted: RGB;
  fgSubtle: RGB;
  fgFaint: RGB;
  fgOnBrand: RGB;
  border: RGB;
  borderStrong: RGB;
  borderFaint: RGB;
  success: Tone;
  warning: Tone;
  danger: Tone;
  info: Tone;
  neutral: Tone;
  shadow: RGB;
  shadowAlpha: number;
}

interface Tone {
  base: RGB;
  soft: RGB;
  fg: RGB;
}

const light: Palette = {
  brand: {
    50: [238, 242, 255],
    100: [224, 231, 255],
    200: [199, 210, 254],
    300: [165, 180, 252],
    400: [129, 140, 248],
    500: [99, 102, 241],
    600: [79, 70, 229],
    700: [67, 56, 202],
    800: [55, 48, 163],
    900: [49, 46, 129],
  },
  surfaceApp: [248, 250, 252],
  surface1: [255, 255, 255],
  surface2: [255, 255, 255],
  surface3: [248, 250, 252],
  surfaceHover: [246, 247, 249],
  fg: [17, 24, 39],
  fgMuted: [75, 85, 99],
  fgSubtle: [107, 114, 128],
  fgFaint: [156, 163, 175],
  fgOnBrand: [255, 255, 255],
  border: [229, 231, 235],
  borderStrong: [209, 213, 219],
  borderFaint: [241, 245, 249],
  success: { base: [22, 163, 74], soft: [240, 253, 244], fg: [21, 128, 61] },
  warning: { base: [217, 119, 6], soft: [255, 251, 235], fg: [180, 83, 9] },
  danger: { base: [220, 38, 38], soft: [254, 242, 242], fg: [185, 28, 28] },
  info: { base: [2, 132, 199], soft: [240, 249, 255], fg: [3, 105, 161] },
  neutral: { base: [100, 116, 139], soft: [248, 250, 252], fg: [71, 85, 105] },
  shadow: [15, 23, 42],
  shadowAlpha: 0.08,
};

const dark: Palette = {
  brand: {
    50: [30, 27, 75],
    100: [39, 35, 96],
    200: [55, 48, 163],
    300: [67, 56, 202],
    400: [99, 102, 241],
    500: [129, 140, 248],
    600: [139, 148, 250],
    700: [165, 180, 252],
    800: [199, 210, 254],
    900: [224, 231, 255],
  },
  surfaceApp: [9, 11, 18],
  surface1: [20, 23, 33],
  surface2: [28, 32, 44],
  surface3: [26, 30, 41],
  surfaceHover: [33, 38, 51],
  fg: [237, 240, 247],
  fgMuted: [177, 184, 200],
  fgSubtle: [142, 150, 168],
  fgFaint: [110, 118, 136],
  fgOnBrand: [12, 14, 21],
  border: [45, 51, 66],
  borderStrong: [62, 69, 87],
  borderFaint: [33, 38, 51],
  success: { base: [74, 222, 128], soft: [18, 44, 32], fg: [134, 239, 172] },
  warning: { base: [251, 191, 36], soft: [54, 40, 12], fg: [253, 224, 71] },
  danger: { base: [248, 113, 113], soft: [56, 24, 27], fg: [252, 165, 165] },
  info: { base: [56, 189, 248], soft: [12, 41, 58], fg: [125, 211, 252] },
  neutral: { base: [148, 163, 184], soft: [30, 35, 47], fg: [203, 213, 225] },
  shadow: [0, 0, 0],
  shadowAlpha: 0.5,
};

export interface ToneColors {
  base: string;
  soft: string;
  fg: string;
}

const toTone = (t: Tone): ToneColors => ({
  base: rgb(t.base),
  soft: rgb(t.soft),
  fg: rgb(t.fg),
});

function buildColors(p: Palette) {
  return {
    brand: Object.fromEntries(
      Object.entries(p.brand).map(([k, v]) => [k, rgb(v)]),
    ) as Record<keyof Palette['brand'], string>,
    // Surfaces
    app: rgb(p.surfaceApp),
    surface: rgb(p.surface1),
    elevated: rgb(p.surface2),
    subtle: rgb(p.surface3),
    hover: rgb(p.surfaceHover),
    // Text
    fg: rgb(p.fg),
    fgMuted: rgb(p.fgMuted),
    fgSubtle: rgb(p.fgSubtle),
    fgFaint: rgb(p.fgFaint),
    onBrand: rgb(p.fgOnBrand),
    // Lines
    line: rgb(p.border),
    lineStrong: rgb(p.borderStrong),
    lineFaint: rgb(p.borderFaint),
    // Status
    success: toTone(p.success),
    warning: toTone(p.warning),
    danger: toTone(p.danger),
    info: toTone(p.info),
    neutral: toTone(p.neutral),
    // Focus ring (tailwind boxShadow.focus: brand-500 at 25%)
    focusRing: rgba(p.brand[500], 0.25),
    // Modal scrim
    scrim: rgba(p.shadow, 0.5),
    shadow: rgba(p.shadow, p.shadowAlpha),
    shadowColor: rgb(p.shadow),
    transparent: 'transparent',
  };
}

export type ThemeColors = ReturnType<typeof buildColors>;

/** Type scale from tailwind.config.js (px values; lineHeight in px). */
export const typography = {
  '2xs': { fontSize: 11, lineHeight: 16 },
  xs: { fontSize: 12, lineHeight: 18 },
  sm: { fontSize: 13, lineHeight: 20 },
  base: { fontSize: 14, lineHeight: 22 },
  lg: { fontSize: 16, lineHeight: 24 },
  xl: { fontSize: 18, lineHeight: 26 },
  '2xl': { fontSize: 22, lineHeight: 30 },
  '3xl': { fontSize: 28, lineHeight: 34 },
  '4xl': { fontSize: 36, lineHeight: 40 },
} as const;
export type TypeSize = keyof typeof typography;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;
export type FontWeight = keyof typeof fontWeights;

/** Web radius tokens: lg 8, xl 12, 2xl 16, 3xl 20. */
export const radius = { sm: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 20, pill: 999 } as const;

export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/** Minimum touch target (iOS HIG / Material): 44pt. */
export const MIN_TOUCH = 44;

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  typography: typeof typography;
  fontWeights: typeof fontWeights;
  radius: typeof radius;
  spacing: typeof spacing;
  minTouch: number;
  elevation: (level: 'xs' | 'sm' | 'md' | 'lg') => {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
}

function buildTheme(scheme: 'light' | 'dark', p: Palette): Theme {
  const colors = buildColors(p);
  const levels = {
    xs: { o: 0.5, r: 2, y: 1, e: 1 },
    sm: { o: 0.75, r: 3, y: 1, e: 2 },
    md: { o: 1, r: 8, y: 4, e: 4 },
    lg: { o: 1.4, r: 16, y: 10, e: 8 },
  } as const;
  return {
    scheme,
    colors,
    typography,
    fontWeights,
    radius,
    spacing,
    minTouch: MIN_TOUCH,
    elevation: (level) => {
      const l = levels[level];
      return {
        shadowColor: colors.shadowColor,
        shadowOpacity: Math.min(1, p.shadowAlpha * l.o),
        shadowRadius: l.r,
        shadowOffset: { width: 0, height: l.y },
        elevation: l.e,
      };
    },
  };
}

export const lightTheme = buildTheme('light', light);
export const darkTheme = buildTheme('dark', dark);
