/** Tiny defensive readers: server shapes are tolerated, never trusted. */

export type Obj = Record<string, unknown>;

export const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const str = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

export const nonEmpty = (v: unknown): string | null => {
  const s = str(v);
  return s && s.trim() ? s : null;
};

/** Numbers and numeric strings (Postgres DECIMAL arrives as a string). */
export const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const numOr = (v: unknown, fallback = 0): number => num(v) ?? fallback;

export const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1;

export const mapArray = <T>(v: unknown, fn: (item: unknown) => T | null): T[] => {
  const out: T[] = [];
  for (const item of asArray(v)) {
    const r = fn(item);
    if (r !== null) out.push(r);
  }
  return out;
};
