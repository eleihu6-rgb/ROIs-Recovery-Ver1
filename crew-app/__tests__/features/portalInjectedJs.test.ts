import { buildInjectedJS, ROSTER_MONTH_OFFSETS } from '../../src/features/travel/portalInjectedJs';

// These tests validate the GENERATED script content — they never execute WebView
// JS. They guard the boundaries that refactors most easily break: credential
// escaping, direct-auth activation, token helpers, and month-range generation
// (enhance-Ver3 #15).
describe('buildInjectedJS', () => {
  const js = buildInjectedJS('35459', 'Pier2026');

  it('JSON-escapes the crew ID and password safely', () => {
    expect(js).toContain('var CREW = "35459";');
    expect(js).toContain('var PW = "Pier2026";');
  });

  it('escapes credentials that contain quotes/backslashes without breaking the script', () => {
    const tricky = buildInjectedJS('35459', 'a"b\\c\nd');
    // The injected value must be a valid JS string literal (JSON-escaped).
    expect(tricky).toContain(`var PW = ${JSON.stringify('a"b\\c\nd')};`);
    // No raw newline leaks into the assignment that would terminate the statement.
    expect(tricky).not.toContain('var PW = "a"b');
  });

  it('defines and actively invokes directAuth (not dead code)', () => {
    expect(js).toContain('function directAuth(');
    // Invoked inside the interval loop — the leading-path call.
    expect(js).toMatch(/directAuth\(\);/);
    // POSTs the real password-login endpoint (/login) — verified live. NOT
    // /api/auth, which is the SSO token-exchange endpoint.
    expect(js).toContain("'/login'");
    expect(js).not.toContain("'/api/auth'");
  });

  it('posts the exact ROIS login body shape (user-wrapped, "passwords" field)', () => {
    // Reverse-engineered from the portal bundle's handleSubmit(): the RSA password
    // goes under user.passwords with userCode — NOT a flat {password, loginType}.
    expect(js).toContain('user: { passwords: ep, userCode: CREW');
    expect(js).not.toContain("loginType: 'NORMAL'");
  });

  it('exposes token helpers and prefers an explicit auth token over storage scan', () => {
    expect(js).toContain('function setToken(');
    expect(js).toContain('function getToken(');
    expect(js).toContain('function extractToken(');
    // getToken prefers the explicitly-set token, falling back to findJwt().
    expect(js).toContain('window.__royce.token || findJwt()');
  });

  it('never posts the full token — only its source and length', () => {
    expect(js).toContain("post({ type:'token', src:src, len:String(t).length })");
  });

  it('fetches previous, current, and next month ([-1, 0, 1])', () => {
    expect(ROSTER_MONTH_OFFSETS).toEqual([-1, 0, 1]);
    expect(js).toContain('var MONTH_OFFSETS = [-1,0,1];');
    expect(js).toContain('MONTH_OFFSETS.forEach');
  });

  it('fetches the roster immediately when a token is set (no waiting for the next tick)', () => {
    // setToken calls fetchRosters() right away (enhance-Ver3 #6).
    expect(js).toMatch(/setToken\(t, src\)\{[\s\S]*fetchRosters\(\);/);
  });

  it('produces a self-invoking script that ends with the WebView truthy sentinel', () => {
    expect(js.trimEnd().endsWith('true;')).toBe(true);
  });

  // The direct-auth /login flow RSA-encrypts the password and NEEDS JSEncrypt,
  // which the portal page does not expose globally. Gating the CDN loader off
  // broke the whole roster pull (no crypto → no /login → no token), so it must
  // default ON. The `false` opt-out exists for when jsencrypt is bundled locally.
  describe('JSEncrypt loader', () => {
    it('is included BY DEFAULT (required for login to complete)', () => {
      expect(js).toContain('cdn.jsdelivr.net/npm/jsencrypt');
    });

    it('can be opted out (no remote URL) once crypto is bundled locally', () => {
      const noCdn = buildInjectedJS('35459', 'Pier2026', false);
      expect(noCdn).not.toContain('cdn.jsdelivr.net');
      expect(noCdn).toContain('directAuthUnavailable');
    });
  });
});
