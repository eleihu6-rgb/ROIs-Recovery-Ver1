/**
 * PR destination landmarks + base-aware trip destination (Home postcards).
 *
 * PR flies to places TG doesn't (CEB/POM from the real roster, plus PR's Philippine
 * hubs and long-haul network) — each must resolve to a real landmark image, not the
 * default. And because PR is Manila-based, tripDestination must treat MNL (not BKK)
 * as home so a return leg isn't shown as the destination.
 */

import { cityForAirport, tripDestination } from '../../src/features/home/cities';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const defaultImage = cityForAirport('ZZZ').image; // unknown code → default image

describe('PR + OSL destination landmarks', () => {
  const cases: Array<[string, string]> = [
    ['CEB', 'Cebu'],
    ['POM', 'Port Moresby'],
    ['DVO', 'Davao'],
    ['HNL', 'Honolulu'],
    ['GUM', 'Guam'],
    ['LAX', 'Los Angeles'],
    ['SFO', 'San Francisco'],
    ['JFK', 'New York'],
    ['YVR', 'Vancouver'],
    ['BNE', 'Brisbane'],
    ['AKL', 'Auckland'],
    ['OSL', 'Oslo'],
    ['SEA', 'Seattle'],
    ['DOH', 'Doha'],
    ['DAD', 'Da Nang'],
    ['RUH', 'Riyadh'],
    ['BKK', 'Bangkok'],
  ];

  it.each(cases)('%s resolves to %s with a real (non-default) landmark', (code, name) => {
    const card = cityForAirport(code);
    expect(card.name).toBe(name);
    expect(card.airport).toBe(code);
    expect(card.image).toBeTruthy();
    expect(card.image).not.toBe(defaultImage);
  });

  it('an unknown airport still falls back to the default image', () => {
    const card = cityForAirport('QQQ');
    expect(card.image).toBe(defaultImage);
    expect(card.name).toBe('QQQ');
  });

  it('SIN bundles the user-approved Merlion / Marina Bay Sands photo', () => {
    expect(cityForAirport('SIN').name).toBe('Singapore');
    expect(cityForAirport('SIN').image).toEqual(require('../../src/features/home/cityImages/singapore.jpg'));
    const bytes = readFileSync(resolve(__dirname, '../../src/features/home/cityImages/singapore.jpg'));
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('4ed321dcfe8a31a4b2ca54d260e53cf12ae2969bc4fe9fbc92807ef40464812a');
  });
});

describe('tripDestination is base-aware (PR = MNL, not BKK)', () => {
  const leg = (dep: string, arv: string): TripLeg => ({
    crewId: '433535',
    fltNumber: 'PR000',
    flightDateUTC: '',
    depArp: dep,
    arvDateUTC: '',
    arvArp: arv,
    fleet: '',
    hotel: '',
  });
  const trip = (legs: TripLeg[]): Trip =>
    ({ id: 't', crewId: '433535', legs } as unknown as Trip);

  it('a PR MNL→CEB→MNL rotation shows Cebu, never Manila', () => {
    const dest = tripDestination(trip([leg('MNL', 'CEB'), leg('CEB', 'MNL')]), 'MNL');
    expect(dest.name).toBe('Cebu');
  });

  it.each(['SEA', 'DOH', 'DAD', 'RUH'])('MNL→%s→MNL uses its own landmark, not the fallback', code => {
    const dest = tripDestination(trip([leg('MNL', code), leg(code, 'MNL')]), 'MNL');
    expect(dest.airport).toBe(code);
    expect(dest.image).not.toBe(defaultImage);
  });

  it('under the default BKK base, MNL WOULD be treated as a destination (proves the fix matters)', () => {
    // Same rotation with the old BKK-only base: the return arrival MNL is "away"
    // from BKK, so without the MNL base it can surface as Manila.
    const dest = tripDestination(trip([leg('MNL', 'CEB'), leg('CEB', 'MNL')]));
    // First away-from-BKK arrival is still CEB here, but a positioning-inbound-first
    // trip would wrongly pick MNL — assert the base param actually changes behaviour:
    const inboundFirst = tripDestination(trip([leg('CEB', 'MNL'), leg('MNL', 'CEB')]), 'BKK');
    expect(inboundFirst.name).toBe('Manila'); // wrong home under BKK base
    const fixed = tripDestination(trip([leg('CEB', 'MNL'), leg('MNL', 'CEB')]), 'MNL');
    expect(fixed.name).toBe('Cebu'); // correct under MNL base
    expect(dest.name).toBe('Cebu');
  });
});

describe('readable October PR roster destination coverage', () => {
  // Read-only portal audit, 2026-10-08. Two other requested accounts did not
  // issue a login token; no empty-roster claim is made for those accounts.
  it.each([
    ['452320', 'CGK HKG LAX MNL SFO SIN'],
    ['487424', 'HAN LAX MNL NGO PVG SFO SIN TPE'],
    ['540753', 'DOH LAX MNL'],
    ['473006', 'BKK HKG HND MEL MNL PVG SYD YVR'],
    ['563044', 'CEB DAD ICN LAX MNL YVR'],
    ['465800', 'BKK HNL MNL NRT SEA'],
    ['479274', 'FUK HKG HND MNL NGO NRT PVG RUH TPE'],
    ['532510', 'CGK DVO HND HNL LAX MNL RUH SIN'],
  ])('%s has no generic-image airports in the audited month', (_crew, airports) => {
    for (const code of airports.split(' ')) {
      expect(cityForAirport(code).image).not.toBe(defaultImage);
      expect(cityForAirport(code).name).not.toBe(code);
    }
  });
});
