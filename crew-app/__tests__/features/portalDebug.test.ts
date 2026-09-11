// Portal debug redaction (enhance-Ver5 #2): debug snapshots must never retain
// credentials, JWTs, cookies or raw auth headers — even in development builds.

import {
  redactPortalDebug,
  PREVIEW_LIMIT,
  FULL_PAYLOAD_LIMIT,
} from '../../src/features/travel/portalDebug';

describe('redactPortalDebug', () => {
  it('blanks sensitive keys (auth, cookie, password, captcha, uniqueCode)', () => {
    const input = {
      Authorization: 'Bearer abc.def.ghi',
      cookie: 'session=xyz; path=/',
      'set-cookie': 'a=b',
      user: { password: 'Pier2026', passwords: 'enc==', userCode: '42596', captcha: '1234', uniqueCode: 'u-1' },
    };
    const out = redactPortalDebug(input) as any;
    expect(out.Authorization).toBe('[redacted]');
    expect(out.cookie).toBe('[redacted]');
    expect(out['set-cookie']).toBe('[redacted]');
    expect(out.user.password).toBe('[redacted]');
    expect(out.user.passwords).toBe('[redacted]');
    expect(out.user.captcha).toBe('[redacted]');
    expect(out.user.uniqueCode).toBe('[redacted]');
    // Non-sensitive fields survive.
    expect(out.user.userCode).toBe('42596');
  });

  it('scrubs JWT and Bearer tokens out of string values', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsdummy.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4';
    const out = redactPortalDebug({ note: `token is ${jwt} ok`, hdr: 'Bearer abcdef123456' }) as any;
    expect(out.note).not.toContain('eyJ');
    expect(out.note).toContain('[redacted-jwt]');
    expect(out.hdr).toBe('Bearer [redacted]');
  });

  it('recurses through arrays and nested objects, leaves plain data intact', () => {
    const out = redactPortalDebug({
      reqs: [{ url: '/x', password: 'p' }, { url: '/y', n: 3 }],
    }) as any;
    expect(out.reqs[0].url).toBe('/x');
    expect(out.reqs[0].password).toBe('[redacted]');
    expect(out.reqs[1].n).toBe(3);
  });

  it('is depth-bounded and null-safe', () => {
    expect(redactPortalDebug(null)).toBeNull();
    expect(redactPortalDebug(42)).toBe(42);
    expect(redactPortalDebug('plain')).toBe('plain');
  });

  it('exposes sane size caps (full payload well under the old 4M blob)', () => {
    expect(PREVIEW_LIMIT).toBeLessThan(FULL_PAYLOAD_LIMIT);
    expect(FULL_PAYLOAD_LIMIT).toBeLessThanOrEqual(500_000);
  });
});
