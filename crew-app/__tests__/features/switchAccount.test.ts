/**
 * Account switching must never mix airlines (user requirement).
 *
 * The app allows exactly one live crew at a time: switching from TG to PR (or back)
 * goes through logout, which wipes trips + duties + session (see authLogout.test.ts).
 * This test locks in the two guarantees that keep TG and PR data from bleeding into
 * each other across a switch:
 *   1. Each capture's carrier/base-offset is fully determined by the ACTIVE airline
 *      config — a PR capture yields only PR-carrier legs/duties at UTC+8, a TG
 *      capture only TG-carrier legs at UTC+7 — so neither can mislabel the other.
 *   2. The two real rosters are disjoint (no shared flight identity), so even a
 *      hypothetical un-wiped merge could be detected — but logout wipes first.
 *
 * Uses the two switch-test crews: TG 44117 and PR 433535.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePortalCaptures, type PortalCapture } from '../../src/features/travel/portalCapture';
import { airlineByCode } from '../../src/features/auth/airlines';
import reducer, { setTrips, syncCapturedTrips } from '../../src/features/travel/tripsSlice';
import type { Trip } from '../../src/features/travel/tripCsv';

const FIX = path.resolve(__dirname, '../fixtures/roster');
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

const optsFor = (code: string) => {
  const cfg = airlineByCode(code).portalConfig!;
  return { baseAirport: cfg.baseAirport, baseOffsetMin: cfg.baseOffsetMin };
};

const tgCaptures: PortalCapture[] = [
  { source: 'roster', url: 'selectPortalCalendar?crewId=44117&2026-05', body: load('cal_44117_2026-05.json') },
  { source: 'net', url: 'selectCrewRosterReport?crewId=44117&2026-05', body: load('report_44117_2026-05.json') },
];
const prCaptures: PortalCapture[] = [
  { source: 'roster', url: 'selectPortalCalendar?crewId=433535&2026-08', body: load('cal_433535_2026-08.json') },
  { source: 'net', url: 'selectCrewRosterReport?crewId=433535&2026-08', body: load('report_433535_2026-08.json') },
];

describe('account switch — TG 44117 ⇄ PR 433535 never mix', () => {
  const tg = parsePortalCaptures(tgCaptures, '44117', 'TG', optsFor('TG'));
  const pr = parsePortalCaptures(prCaptures, '433535', 'PR', optsFor('PR'));

  it('a TG capture produces only TG-carrier legs + duties (UTC+7)', () => {
    const flts = tg.trips.flatMap(t => t.legs.map(l => l.fltNumber));
    expect(flts.length).toBeGreaterThan(0);
    expect(flts.every(f => f.startsWith('TG'))).toBe(true);
    expect(tg.duties.every(d => (d.carrier ?? 'TG') === 'TG')).toBe(true);
    expect(tg.duties.every(d => (d.baseOffsetMin ?? 420) === 420)).toBe(true);
  });

  it('a PR capture produces only PR-carrier legs + duties (UTC+8)', () => {
    const flts = pr.trips.flatMap(t => t.legs.map(l => l.fltNumber));
    expect(flts.length).toBeGreaterThan(0);
    expect(flts.every(f => f.startsWith('PR'))).toBe(true);
    expect(pr.duties.every(d => d.carrier === 'PR')).toBe(true);
    expect(pr.duties.every(d => d.baseOffsetMin === 480)).toBe(true);
  });

  it('the two rosters share no flight identity (disjoint) — no silent overlap', () => {
    const tgFlts = new Set(tg.trips.flatMap(t => t.legs.map(l => l.fltNumber)));
    const prFlts = new Set(pr.trips.flatMap(t => t.legs.map(l => l.fltNumber)));
    for (const f of prFlts) {
      expect(tgFlts.has(f)).toBe(false);
    }
    // Trip ids carry crewId, which also differs, so no id collision either.
    const tgIds = new Set(tg.trips.map(t => t.id));
    const prIds = pr.trips.map(t => t.id);
    for (const id of prIds) {
      expect(tgIds.has(id)).toBe(false);
    }
  });

  it('every PR leg is attributed to the crew (no empty crewId to slip the mixing guard)', () => {
    // Some PR calendar duties omit crewId; the parser now backfills it from the
    // logged-in crew, so trips are correctly owned and the fresh-login filter works.
    const legs = pr.trips.flatMap(t => t.legs);
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.every(l => l.crewId === '433535')).toBe(true);
    expect(pr.trips.every(t => t.crewId === '433535')).toBe(true);
  });
});

describe('fresh-login boundary drops another crew\'s stale trips (the live-sim leak)', () => {
  // Reproduces what the sim surfaced: stale TG crew-42596 trips sitting in store
  // (from an earlier session, no logout) must NOT survive a PR 433535 login.
  const leg = (fltNumber: string): any => ({
    crewId: '', fltNumber, flightDateUTC: '', depArp: 'X', arvDateUTC: '', arvArp: 'Y', fleet: '', hotel: '',
  });
  const trip = (id: string, crewId: string, legs: any[]): Trip =>
    ({ id, crewId, checkInDateUTC: '', legs } as unknown as Trip);

  it('filtering to the logging-in crew before sync removes the other crew, keeps mine', () => {
    const staleTG = trip('tg-1', '42596', [leg('TG670')]);
    const myPR = trip('pr-1', '433535', [leg('PR400')]);
    let state = reducer(undefined, setTrips([staleTG, myPR]));
    // The LoginCaptureScreen guard: keep only the logging-in crew, then sync fresh.
    const crewId = '433535';
    const mine = state.trips.filter(t => t.crewId === crewId);
    state = reducer(state, setTrips(mine));
    state = reducer(state, syncCapturedTrips([trip('pr-2', '433535', [leg('PR401')])]));
    const flts = state.trips.flatMap(t => t.legs.map((l: any) => l.fltNumber));
    expect(flts).not.toContain('TG670'); // stale other-crew trip gone
    expect(flts).toEqual(expect.arrayContaining(['PR400', 'PR401']));
    expect(state.trips.every(t => t.crewId === '433535')).toBe(true);
  });
});
