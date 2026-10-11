import { AppError, normalizeError } from '@/api/errors';

import { httpError, networkError } from '@/test/testUtils';

describe('normalizeError', () => {
  it('reads 422 errors[].message (not .msg)', () => {
    const e = normalizeError(
      httpError(422, {
        success: false,
        message: 'Validation failed',
        errors: [
          { field: 'email', message: 'Enter a valid email address' },
          { field: 'password', message: 'Password must be at least 8 characters' },
        ],
      }),
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.kind).toBe('validation');
    expect(e.status).toBe(422);
    expect(e.message).toBe('Enter a valid email address');
    expect(e.fieldErrors).toEqual([
      { field: 'email', message: 'Enter a valid email address' },
      { field: 'password', message: 'Password must be at least 8 characters' },
    ]);
  });

  it('ignores legacy errors[].msg and falls back to the summary message', () => {
    const e = normalizeError(
      httpError(422, { message: 'Validation failed', errors: [{ msg: 'legacy' }] }),
    );
    expect(e.message).toBe('Validation failed');
    expect(e.fieldErrors).toEqual([]);
  });

  it.each([
    [400, 'validation', 'Referenced record does not exist'],
    [401, 'unauthorized', 'Invalid email or password'],
    [403, 'forbidden', 'Account is deactivated'],
    [404, 'not_found', 'User not found'],
    [409, 'conflict', 'Email already registered'],
  ] as const)('maps %i with a message-only body', (status, kind, message) => {
    const e = normalizeError(httpError(status, { success: false, message }));
    expect(e.kind).toBe(kind);
    expect(e.status).toBe(status);
    expect(e.message).toBe(message);
  });

  it('409 prefers the field message', () => {
    const e = normalizeError(
      httpError(409, {
        message: 'Duplicate entry',
        errors: [{ field: 'email', message: 'email must be unique' }],
      }),
    );
    expect(e.message).toBe('email must be unique');
  });

  it('parses Retry-After on 429', () => {
    const e = normalizeError(
      httpError(429, { message: 'Too many attempts. Try again in 2 minute(s).' }, { 'retry-after': '95' }),
    );
    expect(e.kind).toBe('rate_limited');
    expect(e.retryAfterSeconds).toBe(95);
    expect(e.message).toContain('Too many attempts');
  });

  it('429 without a header has no retryAfterSeconds', () => {
    const e = normalizeError(httpError(429, { message: 'slow down' }));
    expect(e.retryAfterSeconds).toBeUndefined();
  });

  it('hides raw 5xx server messages', () => {
    const e = normalizeError(httpError(500, { message: 'SequelizeConnectionError: secret details' }));
    expect(e.kind).toBe('server');
    expect(e.message).not.toContain('Sequelize');
  });

  it('handles an empty or non-object error body', () => {
    expect(normalizeError(httpError(403, '')).message).toBe("You don't have permission to do that.");
    expect(normalizeError(httpError(404, null)).kind).toBe('not_found');
  });

  it('maps network and timeout failures', () => {
    expect(normalizeError(networkError()).kind).toBe('network');
    expect(normalizeError(networkError('ECONNABORTED')).kind).toBe('timeout');
  });

  it('wraps unknown throwables and passes AppError through', () => {
    expect(normalizeError(new Error('boom')).message).toBe('boom');
    expect(normalizeError('weird').kind).toBe('unknown');
    const original = new AppError({ kind: 'forbidden', message: 'x' });
    expect(normalizeError(original)).toBe(original);
  });
});
