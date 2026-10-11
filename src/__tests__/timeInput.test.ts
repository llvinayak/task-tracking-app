import { isHHmm, maskDate, maskTime, shiftHHmm } from '@/utils/timeInput';

describe('maskDate', () => {
  it('inserts separators while typing digits', () => {
    expect(maskDate('2')).toBe('2');
    expect(maskDate('2026')).toBe('2026');
    expect(maskDate('20261')).toBe('2026-1');
    expect(maskDate('202610')).toBe('2026-10');
    expect(maskDate('2026101')).toBe('2026-10-1');
    expect(maskDate('20261010')).toBe('2026-10-10');
  });
  it('normalises pasted text and drops extra characters', () => {
    expect(maskDate('2026/10/10')).toBe('2026-10-10');
    expect(maskDate('2026-10-10 09:30')).toBe('2026-10-10');
    expect(maskDate('abc')).toBe('');
  });
});

describe('maskTime', () => {
  it.each([
    ['', ''],
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    ['9', '9'],
    ['09', '09'],
    ['25', '25'],
    ['093', '09:3'],
    ['130', '13:0'],
    ['93', '09:3'],
    ['930', '09:30'],
    ['0930', '09:30'],
    ['2359', '23:59'],
    ['2599', '25:99'], // out of range: shown as typed, rejected by validateEntry
    ['9.30', '09:30'],
    ['09:30:00', '09:30'],
    ['93015', '09:30'], // padded to 5 digits, the extra one is dropped
  ])('%j -> %j', (typed, shown) => {
    expect(maskTime(typed)).toBe(shown);
  });
});

describe('shiftHHmm', () => {
  it('moves by 15 minutes', () => {
    expect(shiftHHmm('09:30', 15)).toBe('09:45');
    expect(shiftHHmm('09:50', 15)).toBe('10:05');
    expect(shiftHHmm('10:05', -15)).toBe('09:50');
  });
  it('clamps to the day and never wraps', () => {
    expect(shiftHHmm('23:50', 15)).toBe('23:59');
    expect(shiftHHmm('00:05', -15)).toBe('00:00');
  });
  it('leaves an invalid value alone', () => {
    expect(shiftHHmm('', 15)).toBe('');
    expect(shiftHHmm('9:3', 15)).toBe('9:3');
    expect(shiftHHmm('25:00', 15)).toBe('25:00');
    expect(isHHmm('09:30')).toBe(true);
    expect(isHHmm('24:00')).toBe(false);
  });
});
