/**
 * PR (Philippine Airlines) crew-portal capture — second-airline support.
 *
 * PR shares TG's ROIS Cloud portal infra and roster API schema, so the parser is
 * reused; only per-airline knobs differ (Manila base / UTC+8 instead of Bangkok /
 * UTC+7, a `PR` carrier prefix, and a fixed login email-code on the test tenant).
 * These tests run the shared parser over the REAL captured PR roster (crew 433535,
 * Aug 2026, reverse-engineered live 2026-08-12) with PR's config and assert:
 *   • FLY legs are carrier-prefixed PR###
 *   • base→UTC conversion uses UTC+8 (the TG UTC+7 trap, re-verified for MNL)
 *   • airports enrich from the report (no DEP/ARR placeholders)
 *   • duties carry PR's carrier + offset, so a PR deadhead renders "PR2849"
 *   • every PR assignment code classifies without throwing
 * Plus the airline-config wiring and the injected-login-body differences vs TG.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parsePortalCaptures,
  type PortalCapture,
} from '../../src/features/travel/portalCapture';
import { toGroundDuty, classifyGroundDuties } from '../../src/features/roster/dutyDisplay';
import { airlineByCode } from '../../src/features/auth/airlines';
import { buildInjectedJS } from '../../src/features/travel/portalInjectedJs';

const FIX = path.resolve(__dirname, '../fixtures/roster');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

// PR's parse options come straight from the wired airline config — the same object
// the capture screen threads through in the app.
const PR_CFG = airlineByCode('PR').portalConfig!;
const PR_OPTS = { baseAirport: PR_CFG.baseAirport, baseOffsetMin: PR_CFG.baseOffsetMin };

const captures: PortalCapture[] = [
  { source: 'roster', url: 'selectPortalCalendar?crewId=433535&2026-08', body: load('cal_433535_2026-08.json') },
  { source: 'net', url: 'selectCrewRosterReport?crewId=433535&2026-08', body: load('report_433535_2026-08.json') },
];

describe('PR airline wiring (airlines.ts)', () => {
  it('PR is a live carrier with Manila base, UTC+8, and the fixed login email-code', () => {
    const pr = airlineByCode('PR');
    expect(pr.portalUrl).toBe('https://crew-pal-sea-tst.roiscloud.com/pefg/portal/login');
    expect(pr.carrier).toBe('PR');
    expect(pr.portalKind).toBe('rois');
    expect(pr.portalConfig).toEqual({ baseAirport: 'MNL', baseOffsetMin: 480, loginOutCaptcha: '202604' });
  });

  it('does not disturb TG (still Bangkok / UTC+7, no captcha)', () => {
    const tg = airlineByCode('TG');
    expect(tg.carrier).toBe('TG');
    expect(tg.portalConfig).toEqual({ baseAirport: 'BKK', baseOffsetMin: 420 });
    expect(tg.portalConfig?.loginOutCaptcha).toBeUndefined();
  });
});

describe('parsePortalCaptures — PR real roster (crew 433535, Aug 2026)', () => {
  it('keeps only FLY duties and prefixes the PR carrier', () => {
    const { trips, legCount } = parsePortalCaptures(captures, '433535', 'PR', PR_OPTS);
    const flts = trips.flatMap(t => t.legs.map(l => l.fltNumber));
    // 15 FLY duties in the fixture; DHD/SBY/XXX/crew-rest codes are NOT flight legs.
    expect(legCount).toBe(15);
    expect(flts).toContain('PR434');
    expect(flts).toContain('PR433');
    expect(flts).toContain('PR215');
    // No TG prefix ever leaks in.
    expect(flts.every(f => f.startsWith('PR'))).toBe(true);
    // The DHD (deadhead 2849) is not a flight leg.
    expect(flts).not.toContain('PR2849');
  });

  it('converts base (Manila) wall-clock to true UTC at UTC+8 — the tz trap', () => {
    const { trips } = parsePortalCaptures(captures, '433535', 'PR', PR_OPTS);
    const legs = trips.flatMap(t => t.legs);
    // PR433 NRT→CEB: startDateTime 2026-08-04 14:20 is MANILA base (UTC+8).
    // 14:20 − 8h = 06:20 UTC. (localStart 15:20 at NRT/UTC+9 = 06:20 UTC ✓.)
    const pr433 = legs.find(l => l.fltNumber === 'PR433')!;
    expect(pr433.flightDateUTC).toBe('04 Aug 2026 0620');
    // PR434 CEB→NRT: endDateTime 2026-08-03 13:01 base − 8h = 05:01 UTC.
    const pr434 = legs.find(l => l.fltNumber === 'PR434')!;
    expect(pr434.flightDateUTC).toBe('03 Aug 2026 0007'); // 08:07 − 8h
    expect(pr434.arvDateUTC).toBe('03 Aug 2026 0501'); // 13:01 − 8h
  });

  it('would be WRONG under TG defaults — proving the offset is really per-airline', () => {
    // Same capture parsed WITHOUT PR opts (TG's UTC+7 default) mis-dates the leg by
    // 1h. This is the regression the base-offset parameterisation prevents.
    const { trips } = parsePortalCaptures(captures, '433535', 'PR'); // no opts → TG 420
    const pr433 = trips.flatMap(t => t.legs).find(l => l.fltNumber === 'PR433')!;
    expect(pr433.flightDateUTC).toBe('04 Aug 2026 0720'); // 14:20 − 7h (wrong for PR)
  });

  it('enriches real dep/arv airports from the report (no DEP/ARR placeholders)', () => {
    const { trips } = parsePortalCaptures(captures, '433535', 'PR', PR_OPTS);
    const legs = trips.flatMap(t => t.legs);
    const pr434 = legs.find(l => l.fltNumber === 'PR434')!;
    expect(pr434.depArp).toBe('CEB');
    expect(pr434.arvArp).toBe('NRT');
    const pr433 = legs.find(l => l.fltNumber === 'PR433')!;
    expect(pr433.depArp).toBe('NRT');
    expect(pr433.arvArp).toBe('CEB');
    // Every real leg resolves to 3-letter IATA codes, never the placeholder.
    expect(legs.every(l => /^[A-Z]{3}$/.test(l.depArp) && /^[A-Z]{3}$/.test(l.arvArp))).toBe(true);
  });
});

describe('PR duties — carrier + offset are baked in for correct display', () => {
  const { duties } = parsePortalCaptures(captures, '433535', 'PR', PR_OPTS);

  it('every duty carries PR carrier and the UTC+8 offset', () => {
    expect(duties.length).toBeGreaterThan(0);
    expect(duties.every(d => d.carrier === 'PR')).toBe(true);
    expect(duties.every(d => d.baseOffsetMin === 480)).toBe(true);
  });

  it('a PR deadhead renders "PR2849" (carrier prefix), not the hardcoded TG', () => {
    const dhd = duties.find(d => d.assignment === 'DHD')!;
    expect(dhd).toBeTruthy();
    const g = toGroundDuty(dhd);
    expect(g.category).toBe('deadhead');
    expect(g.detail).toBe('PR2849');
    // And its ground-duty UTC uses UTC+8: 2026-08-02 09:18 base − 8h = 01:18.
    expect(g.startRosterUTC).toBe('02 Aug 2026 0118');
  });

  it('classifies every PR assignment code without throwing (SBY/XXX/crew-rest)', () => {
    const now = new Date('2026-08-01T00:00:00Z');
    expect(() => classifyGroundDuties(duties, now)).not.toThrow();
    const { upcoming, past } = classifyGroundDuties(duties, now);
    // No FLY leaks into ground duties, and every ground duty has a renderable label.
    for (const g of [...upcoming, ...past]) {
      expect(g.code).not.toBe('FLY');
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
});

describe('buildInjectedJS — PR adds the fixed email-code, TG stays byte-identical', () => {
  it('PR login body includes outCaptcha "202604"', () => {
    const js = buildInjectedJS('433535', 'Pier2020', true, { outCaptcha: '202604' });
    expect(js).toContain('outCaptcha: "202604"');
    // Still the same /login shape + fields as before.
    expect(js).toContain('passwords: ep, userCode: CREW, captcha: \'\', uniqueCode: \'\'');
  });

  it('TG login body has NO outCaptcha FIELD (regression: unchanged from original)', () => {
    const js = buildInjectedJS('44117', 'Pier2026');
    // No outCaptcha as a JSON field (a code comment may still mention the word).
    expect(js).not.toContain('outCaptcha:');
    // Exactly the historic TG body.
    expect(js).toContain("passwords: ep, userCode: CREW, captcha: '', uniqueCode: '' } }");
  });
});

describe('buildInjectedJS — PR CrewSE login-flow handling (found via live sim test)', () => {
  const js = buildInjectedJS('433535', 'Pier2020', true, { outCaptcha: '202604' });
  const tg = buildInjectedJS('44117', 'Pier2026');

  it('auto-dismisses the rotate splash and picks ACCOUNT LOGIN (never SSO)', () => {
    // PR gates the form behind a rotate splash + SSO/ACCOUNT choice; TG has neither.
    expect(js).toContain('dismissInterstitials()');
    expect(js).toContain('tap anywhere to continue');
    expect(js).toContain('ACCOUNT LOGIN'); // the "always ACCOUNT LOGIN, never SSO" intent
  });

  it('directAuth no longer hard-requires a visible password field', () => {
    // The old gate returned early unless input[type=password] existed — which never
    // happens on PR until ACCOUNT LOGIN is clicked. directAuth POSTs the /login API
    // directly, so it now also proceeds on a portal login route.
    expect(js).toContain('onLoginPage');
    expect(js).not.toContain("if (!document.querySelector('input[type=password]')) return; // only on login page");
  });

  it('the interstitial handling ships for TG too but is an inert no-op there', () => {
    // Same engine for both airlines; TG portals simply have no matching elements.
    expect(tg).toContain('dismissInterstitials()');
  });
});
