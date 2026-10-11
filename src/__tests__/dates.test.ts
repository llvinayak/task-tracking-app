import {
  daysFromToday,
  formatDay,
  parseServerDate,
  resetNowProvider,
  setNowProvider,
} from '@/utils/dates';

afterEach(resetNowProvider);

describe('parseServerDate', () => {
  it('parses yyyy-MM-dd as a LOCAL calendar date, never UTC midnight', () => {
    const d = parseServerDate('2026-03-10');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(10);
    expect(d?.getHours()).toBe(0);
  });

  it('parses ISO timestamps as instants', () => {
    expect(parseServerDate('2026-03-10T12:30:00.000Z')?.toISOString()).toBe('2026-03-10T12:30:00.000Z');
  });

  it.each([null, undefined, '', '   ', 'not-a-date', '2026-02-31', 12])('returns null for %p', (v) => {
    expect(parseServerDate(v)).toBeNull();
  });
});

describe('daysFromToday', () => {
  it('counts whole calendar days regardless of time of day (23:59 vs 00:01)', () => {
    setNowProvider(() => new Date(2026, 9, 10, 23, 59, 59));
    expect(daysFromToday('2026-10-10')).toBe(0);
    expect(daysFromToday('2026-10-11')).toBe(1);
    expect(daysFromToday('2026-10-09')).toBe(-1);

    setNowProvider(() => new Date(2026, 9, 11, 0, 0, 1));
    expect(daysFromToday('2026-10-10')).toBe(-1);
    expect(daysFromToday('2026-10-11')).toBe(0);
  });

  it('is correct across month and year boundaries', () => {
    setNowProvider(() => new Date(2026, 11, 31, 12));
    expect(daysFromToday('2027-01-01')).toBe(1);
    expect(daysFromToday('2026-12-01')).toBe(-30);
  });

  it('returns null for empty input', () => {
    expect(daysFromToday(null)).toBeNull();
  });
});

describe('formatDay', () => {
  it('omits the year for the current year only', () => {
    setNowProvider(() => new Date(2026, 5, 1));
    expect(formatDay('2026-03-05')).toBe('5 Mar');
    expect(formatDay('2025-03-05')).toBe('5 Mar 2025');
    expect(formatDay(null)).toBe('');
  });
});
