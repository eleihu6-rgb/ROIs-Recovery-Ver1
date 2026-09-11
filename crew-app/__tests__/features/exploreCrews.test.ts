/**
 * Explore coverage — real layover destinations for every mining crew.
 *
 * For each of the 10 crews we read their REAL captured roster (backend/mine/data,
 * gitignored — present locally, absent in CI → skipped), enumerate every city
 * they overnight in (the authoritative `hotelBookingVo` set), assign the crew a
 * 3-interest profile, and assert the Explore tab returns VALID recommendations
 * for every one of those layover cities.
 *
 * This is the reusable counterpart to explore.test.ts (which pins the single
 * crew-42596 / Chitose golden path). It closes the synthetic-test gap: it fails
 * loudly the moment a crew lays over somewhere the places dataset does not cover.
 *
 * Run locally:  npx jest exploreCrews
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  suggestionsFor,
  hasPlaces,
  categoryDef,
  MAX_WALK_MINS,
  TOP_N,
} from '../../src/features/explore/explorePlaces';

const DATA_DIR = path.resolve(__dirname, '../../../backend/mine/data');
const MONTHS = ['2026-04', '2026-05', '2026-06'];

// Each crew gets 3 interests "to do" (drawn from the four cores the dataset
// guarantees in every city: cafe / food / shopping / sightseeing). 42596 keeps
// the spec's café / Thai / shopping on its Chitose layover (covered separately
// by explore.test.ts; here it uses cores so all four of its cities resolve).
const CREW_PREFS: Record<string, string[]> = {
  '36826': ['cafe', 'food', 'shopping'],
  '39243': ['cafe', 'sightseeing', 'shopping'],
  '26985': ['food', 'sightseeing', 'cafe'],
  '23605': ['cafe', 'food', 'sightseeing'],
  '35459': ['shopping', 'food', 'sightseeing'],
  '44117': ['cafe', 'shopping', 'sightseeing'],
  '45779': ['food', 'cafe', 'shopping'],
  '44448': ['sightseeing', 'cafe', 'food'],
  '44661': ['food', 'shopping', 'sightseeing'],
  '42596': ['cafe', 'food', 'shopping'],
};
const CREWS = Object.keys(CREW_PREFS);

const dataExists = fs.existsSync(DATA_DIR);

/** Pull the authoritative set of overnight airports straight from the raw
 *  captures (hotelBookingVo / showHotel), independent of trip-grouping. */
function layoverAirports(crewId: string): string[] {
  const set = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const hv = node.hotelBookingVo;
    if (node.showHotel === true && hv && typeof hv === 'object' && hv.hotelName) {
      const ap = String(hv.airport || '').trim().toUpperCase();
      if (ap) set.add(ap);
    }
    for (const v of Object.values(node)) visit(v);
  };
  for (const month of MONTHS) {
    const file = path.join(DATA_DIR, `${crewId}_${month}.json`);
    if (!fs.existsSync(file)) continue;
    visit(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return [...set].sort();
}

/** Reusable assertion: the Explore tab gives valid recommendations for `airport`
 *  under `prefs`. Valid = each chosen interest yields 1..TOP_N places, all of the
 *  right category, all within the walk cap, ranked by rating descending. */
function assertValidExplore(airport: string, prefs: string[]) {
  expect(hasPlaces(airport)).toBe(true); // dataset must cover this layover city
  const suggestions = suggestionsFor(airport, prefs);
  // every chosen interest that the dataset knows about must come back
  const got = new Set<string>(suggestions.map(s => s.category.key));
  for (const pref of prefs) {
    expect(categoryDef(pref)).toBeDefined();
    expect(got.has(pref)).toBe(true);
  }
  for (const s of suggestions) {
    expect(s.places.length).toBeGreaterThanOrEqual(1);
    expect(s.places.length).toBeLessThanOrEqual(TOP_N);
    const ratings = s.places.map(p => p.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
    for (const p of s.places) {
      expect(p.category).toBe(s.category.key);
      expect(p.walkMins).toBeLessThanOrEqual(MAX_WALK_MINS);
      expect(p.rating).toBeGreaterThan(0);
      expect(p.rating).toBeLessThanOrEqual(5);
    }
  }
}

describe('Explore — valid recommendations for every crew layover', () => {
  for (const crewId of CREWS) {
    describe(`crew ${crewId} (interests: ${CREW_PREFS[crewId].join(', ')})`, () => {
      it('every overnight city has valid Explore recommendations', () => {
        if (!dataExists) {
          console.log('  [skip] backend/mine/data not found — run locally to validate');
          return;
        }
        const airports = layoverAirports(crewId);
        // 36826 is all short-haul turnarounds — no overnights, nothing to cover.
        if (airports.length === 0) {
          console.log(`  crew ${crewId}: no hotel layovers (turnaround flyer)`);
          return;
        }
        const uncovered = airports.filter(a => !hasPlaces(a));
        expect(uncovered).toEqual([]); // dataset must cover all their layover cities
        for (const ap of airports) {
          assertValidExplore(ap, CREW_PREFS[crewId]);
        }
      });
    });
  }
});
