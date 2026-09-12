import fs from 'fs';
import path from 'path';

import {
  airlineByCode,
  loginRouteForAirline,
  prefillForAirline,
  resolveEkRosterApiBaseUrl,
  TEST_CREDENTIALS,
} from '../../src/features/auth/airlines';

describe('EK airline selection', () => {
  it('wires Emirates to the API adapter with the ROIS live-server roster base', () => {
    expect(airlineByCode('EK')).toMatchObject({
      code: 'EK', name: 'Emirates', carrier: 'EK', portalKind: 'rois-api',
      // Roster: ROIS live-server mobile-roster contract (real EK crews, K1003).
      rosterApiBaseUrl: 'http://127.0.0.1:3000/api',
      // Notifications / discretion: still the EVACC crew-app gateway.
      apiBaseUrl: 'http://127.0.0.1:8000/api',
    });
    expect(loginRouteForAirline('EK')).toBe('EkRoster');
  });

  it('wires Flair Airlines to the API adapter and live-server simulator endpoint', () => {
    expect(airlineByCode('F8')).toMatchObject({
      code: 'F8', name: 'Flair Airlines', carrier: 'F8', portalKind: 'rois-api',
      apiBaseUrl: 'http://127.0.0.1:3000/api',
    });
    expect(TEST_CREDENTIALS.F8).toEqual({crewId: '113', password: ''});
    expect(loginRouteForAirline('F8')).toBe('EkRoster');
  });

  it('prefills the approved EK test credentials', () => {
    // K1003 (Khalid Al Nuaimi) is a real Emirates crew, the default EK login.
    expect(TEST_CREDENTIALS.EK).toEqual({crewId: 'K1003', password: 'Pier2026'});
    expect(prefillForAirline('EK', '35459', 'Pier2026')).toEqual({
      crewId: 'K1003', password: 'Pier2026',
    });
  });

  it('does not overwrite user-entered credentials', () => {
    expect(prefillForAirline('EK', 'MYCREW', 'secret')).toEqual({
      crewId: 'MYCREW', password: 'secret',
    });
  });

  it('leaves TG and PR on the existing capture route and configuration', () => {
    expect(loginRouteForAirline('TG')).toBe('Capture');
    expect(loginRouteForAirline('PR')).toBe('Capture');
    expect(airlineByCode('TG').portalKind).toBe('rois');
    expect(airlineByCode('PR').portalKind).toBe('rois');
    expect(TEST_CREDENTIALS.PR).toEqual({crewId: '433535', password: 'Pier2020'});
  });

  it('uses simulator localhost only as the explicit development fallback', () => {
    expect(resolveEkRosterApiBaseUrl(undefined, true)).toBe('http://127.0.0.1:8000/api');
    expect(resolveEkRosterApiBaseUrl(undefined, false)).toBeNull();
  });

  it('accepts a build-configured HTTPS endpoint and normalizes its trailing slash', () => {
    expect(resolveEkRosterApiBaseUrl('https://rois.example.test/api/', false))
      .toBe('https://rois.example.test/api');
  });

  it('rejects insecure shared/device configuration outside development', () => {
    expect(() => resolveEkRosterApiBaseUrl('http://192.168.1.50:8000/api', false))
      .toThrow('EK roster API must use HTTPS outside development');
    expect(() => resolveEkRosterApiBaseUrl('not-a-url', true))
      .toThrow('Invalid EK roster API URL');
  });

  it('publishes the iOS build setting to the React Native settings bridge', () => {
    const appDelegate = fs.readFileSync(path.join(
      __dirname,
      '../../ios/RoyceTravelTemplate/AppDelegate.mm',
    ), 'utf8');

    expect(appDelegate).toContain('objectForInfoDictionaryKey:@"EKRosterApiBaseURL"');
    expect(appDelegate).toContain('registerDefaults:@{@"EKRosterApiBaseURL": ekRosterApiBaseURL}');
    expect(appDelegate).toContain('objectForInfoDictionaryKey:@"F8RosterApiBaseURL"');
    expect(appDelegate).toContain('registerDefaults:@{@"F8RosterApiBaseURL": f8RosterApiBaseURL}');
  });
});
