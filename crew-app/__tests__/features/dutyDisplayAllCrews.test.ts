// Comprehensive coverage of EVERY duty-display function against the real rosters
// of all four test crews (23605 / 35459 / 44117 / 45779). Driven directly off the
// captured fixtures so it self-updates if a crew's roster is re-captured, and it
// fails loudly if the portal introduces an assignment code we don't categorise.

import * as fs from 'fs';
import * as path from 'path';
import {
  categorise,
  toGroundDuty,
  classifyGroundDuties,
  groundDutyStartMs,
  isFlightDuty,
  CATEGORY_META,
  type DutyCategory,
} from '../../src/features/roster/dutyDisplay';
import { parsePortalCaptures, type PortalDuty } from '../../src/features/travel/portalCapture';
import { parseRosterUTC } from '../../src/features/settings/timeFormat';

const CREWS = ['23605', '35459', '44117', '45779'] as const;
const FIX_DIR = path.join(__dirname, '..', 'fixtures', 'roster');

// All non-FLY assignment codes the four crews currently exercise. If the portal
// adds a new code, the "every code is mapped" test below flags it for triage.
const EXPECTED_GROUND_CODES = [
  'DHD', 'SIM', 'TRG', 'CHMSBA', 'CHMSBB', 'CHMSB3', 'PHMSBB',
  'MEETING', 'OFFICE', 'BLOCK', 'OFF', 'VOFF', 'VAC', 'VAC_PH', 'HOL',
].sort();

/** Load + parse one crew's three monthly calendar payloads into one duty list. */
function dutiesForCrew(crew: string): PortalDuty[] {
  const files = fs
    .readdirSync(FIX_DIR)
    .filter(f => f.startsWith(`cal_${crew}_`) && f.endsWith('.json'));
  const captures = files.map(f => ({
    source: 'roster' as const,
    url: f,
    body: JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), 'utf8')),
  }));
  return parsePortalCaptures(captures).duties;
}

function tripsForCrew(crew: string) {
  const files = fs
    .readdirSync(FIX_DIR)
    .filter(f => f.startsWith(`cal_${crew}_`) && f.endsWith('.json'));
  const captures = files.map(f => ({
    source: 'roster' as const,
    url: f,
    body: JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), 'utf8')),
  }));
  return parsePortalCaptures(captures).trips;
}

describe('duty display — full coverage across all 4 crews', () => {
  // Cache parsed duties per crew (parsing is cheap but do it once).
  const dutiesByCrew: Record<string, PortalDuty[]> = {};
  beforeAll(() => {
    for (const c of CREWS) {
      dutiesByCrew[c] = dutiesForCrew(c);
    }
  });

  it('every crew fixture loads and yields duties', () => {
    for (const c of CREWS) {
      expect(dutiesByCrew[c].length).toBeGreaterThan(0);
    }
  });

  it('every ground assignment code seen across the 4 crews maps to a known category (not the fuzzy fallback)', () => {
    const codes = new Set<string>();
    for (const c of CREWS) {
      for (const d of dutiesByCrew[c]) {
        const code = (d.assignment || '').toUpperCase();
        if (code && code !== 'FLY') {
          codes.add(code);
        }
      }
    }
    // The set of codes is exactly what we expect — surfaces any NEW code.
    expect([...codes].sort()).toEqual(EXPECTED_GROUND_CODES);
    // And none of them fall through to 'other' (every real code is recognised).
    for (const code of codes) {
      expect(categorise(code).category).not.toBe('other');
    }
  });

  it('toGroundDuty produces a renderable model for every non-flight duty of every crew', () => {
    for (const c of CREWS) {
      for (const d of dutiesByCrew[c]) {
        if (isFlightDuty(d)) {
          continue;
        }
        const g = toGroundDuty(d);
        // category is valid + has visual metadata
        expect(CATEGORY_META[g.category as DutyCategory]).toBeDefined();
        // label is non-empty
        expect(g.label.length).toBeGreaterThan(0);
        // start/end convert to real, parseable UTC instants
        expect(parseRosterUTC(g.startRosterUTC)).not.toBeNull();
        expect(parseRosterUTC(g.endRosterUTC)).not.toBeNull();
        // allDay is a boolean
        expect(typeof g.allDay).toBe('boolean');
        // groundDutyStartMs is finite
        expect(Number.isFinite(groundDutyStartMs(g))).toBe(true);
        // SIM/DHD carry a detail line; ground-only duties don't require one
        if (g.category === 'training' && d.fltNum) {
          expect(g.detail && g.detail.length).toBeTruthy();
        }
      }
    }
  });

  it('no crew leaks SIM/DHD/standby into flight trip cards', () => {
    for (const c of CREWS) {
      const flightNumbers = tripsForCrew(c).flatMap(t => t.legs.map(l => l.fltNumber));
      // Every flight leg is a genuine TG#### revenue flight (1–4 digit number;
      // THAI runs single-digit flights like TG2/TG4).
      for (const fn of flightNumbers) {
        expect(fn).toMatch(/^TG\d{1,4}$/);
      }
      // None of the non-revenue codes leak through.
      expect(flightNumbers.some(f => /HOSIM|AATC|CHMSB|SIM|DHD/i.test(f))).toBe(false);
    }
  });

  it('classifyGroundDuties never includes a flight, and respects upcoming/past split per crew', () => {
    for (const c of CREWS) {
      const { upcoming, past } = classifyGroundDuties(
        dutiesByCrew[c],
        new Date('2026-05-15T00:00:00Z'),
      );
      const all = [...upcoming, ...past];
      expect(all.length).toBeGreaterThan(0);
      // No flight codes ever appear as ground duties.
      expect(all.every(g => g.code !== 'FLY')).toBe(true);
      // upcoming ascending, past descending (by real instant)
      const ups = upcoming.map(groundDutyStartMs);
      const pasts = past.map(groundDutyStartMs);
      for (let i = 1; i < ups.length; i++) {
        expect(ups[i]).toBeGreaterThanOrEqual(ups[i - 1]);
      }
      for (let i = 1; i < pasts.length; i++) {
        expect(pasts[i]).toBeLessThanOrEqual(pasts[i - 1]);
      }
    }
  });

  it('across the 4 crews, all 7 ground categories are represented', () => {
    const cats = new Set<DutyCategory>();
    for (const c of CREWS) {
      for (const d of dutiesByCrew[c]) {
        if (!isFlightDuty(d)) {
          cats.add(toGroundDuty(d).category);
        }
      }
    }
    for (const expected of [
      'off', 'leave', 'training', 'standby', 'meeting', 'reserve', 'deadhead',
    ] as DutyCategory[]) {
      expect(cats.has(expected)).toBe(true);
    }
  });

  // Per-crew snapshot of the category mix — documents what each crew exercises
  // and guards against a parser regression silently dropping a duty type.
  it.each(CREWS)('crew %s exposes a non-trivial category mix', crew => {
    const cats = new Set<DutyCategory>();
    for (const d of dutiesByCrew[crew]) {
      if (!isFlightDuty(d)) {
        cats.add(toGroundDuty(d).category);
      }
    }
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });
});
