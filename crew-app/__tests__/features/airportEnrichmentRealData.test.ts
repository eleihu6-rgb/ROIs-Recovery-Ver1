/**
 * Real-data integration test: airport enrichment across all 9 mining crews.
 *
 * Loads the actual portal JSON payloads from backend/mine/data/ (gitignored —
 * present locally, absent in CI). Skips gracefully when the files do not exist.
 *
 * This is the test that should have caught the TG8/TG9 bug: synthetic unit
 * tests only cover explicitly written scenarios, so any real-data pattern not
 * anticipated in the fixture will slip through. This test closes that gap by
 * running parsePortalCaptures on the real captured payloads and asserting that
 * every real-flight leg resolves to a non-placeholder, known IATA airport.
 *
 * Run locally:  npx jest airportEnrichmentRealData
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePortalCaptures, type PortalCapture } from '../../src/features/travel/portalCapture';
import { isRealAirport } from '../../src/features/travel/airports';

const DATA_DIR = path.resolve(__dirname, '../../../backend/mine/data');
const CREWS = ['36826', '39243', '26985', '23605', '35459', '44117', '45779', '44448', '44661'];
const MONTHS = ['2026-04', '2026-05', '2026-06'];

/** True when fltNumber is a real carrier+number (1-4 digits, optional suffix). */
function isRealFlight(fltNumber: string): boolean {
  return /^[A-Z]{2}\d{1,4}[A-Z]?$/.test((fltNumber || '').trim().toUpperCase());
}

const dataExists = fs.existsSync(DATA_DIR);

// One describe block per crew so failures are clearly attributed.
for (const crewId of CREWS) {
  describe(`airport enrichment — real portal data crew ${crewId} (Apr–Jun 2026)`, () => {
    const captures: PortalCapture[] = [];
    let loaded = false;

    beforeAll(() => {
      if (!dataExists) return;
      for (const month of MONTHS) {
        const file = path.join(DATA_DIR, `${crewId}_${month}.json`);
        if (!fs.existsSync(file)) continue;
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        // calendar → monthly duty list
        if (raw.calendar) {
          captures.push({ source: 'roster', url: `selectPortalCalendar?${month}`, body: raw.calendar });
        }
        // roster report → airport + hotel enrichment
        if (raw.report) {
          captures.push({ source: 'net', url: `selectCrewRosterReport?${month}`, body: raw.report });
        }
        // detail all → training/course info (also contains some flight info)
        if (raw.detailAll) {
          captures.push({ source: 'net', url: `selectPortalCalendarDetailAll?${month}`, body: raw.detailAll });
        }
      }
      loaded = captures.length > 0;
    });

    it('every real-flight leg has non-empty dep and arv (not DEP/ARR)', () => {
      if (!dataExists || !loaded) {
        console.log(`  [skip] backend/mine/data not found — run locally to validate real data`);
        return;
      }
      const { trips } = parsePortalCaptures(captures, crewId, 'TG');
      const realLegs = trips.flatMap(t => t.legs).filter(l => isRealFlight(l.fltNumber));
      expect(realLegs.length).toBeGreaterThan(0);
      // Exclude flights whose UTC date is before our first captured month (Apr 2026).
      // These are calendar bleed-ins from March that have no report in our data range.
      const firstCaptureDate = new Date('2026-04-01T00:00:00Z');

      const inRange = realLegs.filter(l => {
        // Parse flightDateUTC "DD Mon YYYY HHMM" to check it's within our capture range
        const d = new Date(l.flightDateUTC.replace(/(\d{2}) (\w{3}) (\d{4}) (\d{2})(\d{2})/, '$2 $1 $3 $4:$5 UTC'));
        return isNaN(d.getTime()) || d >= firstCaptureDate;
      });
      const violations: string[] = [];
      for (const leg of inRange) {
        if (!leg.depArp || leg.depArp === 'DEP' || !leg.arvArp || leg.arvArp === 'ARR') {
          violations.push(`${leg.fltNumber}: ${leg.depArp || '(empty)'}→${leg.arvArp || '(empty)'}`);
        }
      }
      if (violations.length > 0) {
        console.log(`  Violations for crew ${crewId}:\n  ` + violations.join('\n  '));
      }
      expect(violations).toEqual([]);
    });

    it('every real-flight leg dep and arv are recognised IATA airports', () => {
      if (!dataExists || !loaded) return;
      const { trips } = parsePortalCaptures(captures, crewId, 'TG');
      const realLegs = trips.flatMap(t => t.legs).filter(l => isRealFlight(l.fltNumber));
      const firstCaptureDate = new Date('2026-04-01T00:00:00Z');
      const inRange = realLegs.filter(l => {
        const d = new Date(l.flightDateUTC.replace(/(\d{2}) (\w{3}) (\d{4}) (\d{2})(\d{2})/, '$2 $1 $3 $4:$5 UTC'));
        return isNaN(d.getTime()) || d >= firstCaptureDate;
      });

      const unknown: string[] = [];
      for (const leg of inRange) {
        if (!isRealAirport(leg.depArp)) unknown.push(`${leg.fltNumber} dep:${leg.depArp}`);
        if (!isRealAirport(leg.arvArp)) unknown.push(`${leg.fltNumber} arv:${leg.arvArp}`);
      }
      if (unknown.length > 0) {
        console.log(`  Unknown airports for crew ${crewId}:\n  ` + unknown.join('\n  '));
      }
      expect(unknown).toEqual([]);
    });
  });
}
