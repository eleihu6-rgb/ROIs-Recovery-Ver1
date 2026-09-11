import {
  airlineByCode,
  loginRouteForAirline,
  prefillForAirline,
  AIRLINES,
  TEST_CREDENTIALS,
} from '../../src/features/auth/airlines';

describe('ET airline selection', () => {
  it('wires Ethiopian Airlines onto the F8 mobile-roster API adapter', () => {
    const airline = airlineByCode('ET');
    expect(airline).toMatchObject({
      code: 'ET',
      name: 'Ethiopian Airlines',
      carrier: 'ET',
      portalKind: 'rois-api',
    });
    expect(airline.apiBaseUrl).not.toBeNull();
    expect(loginRouteForAirline('ET')).toBe('EkRoster');
  });

  it('prefills approved ET test credentials', () => {
    expect(TEST_CREDENTIALS.ET).toEqual({crewId: 'J4002', password: 'Pier2026'});
    expect(prefillForAirline('ET', '35459', 'Pier2026')).toEqual({
      crewId: 'J4002',
      password: 'Pier2026',
    });
  });

  it('does not overwrite user-entered credentials for ET', () => {
    expect(prefillForAirline('ET', 'MYCREW', 'secret')).toEqual({
      crewId: 'MYCREW',
      password: 'secret',
    });
  });

  it('appears only once in the catalogue (WIRED entry wins over duplicate)', () => {
    const matches = AIRLINES.filter(a => a.code === 'ET');
    expect(matches).toHaveLength(1);
    expect(matches[0].portalKind).toBe('rois-api');
  });
});

describe('crew id keyboard per airline', () => {
  const {crewIdKeyboardType} = require('../../src/features/auth/airlines');
  it('gives ET an alphanumeric keyboard so J4002 can be typed', () => {
    expect(crewIdKeyboardType('ET')).toBe('default');
    expect(crewIdKeyboardType('EK')).toBe('default');
  });
  it('keeps the number pad for numeric-id carriers', () => {
    expect(crewIdKeyboardType('TG')).toBe('number-pad');
    expect(crewIdKeyboardType('F8')).toBe('number-pad');
  });
});
