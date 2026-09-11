import {buildDutyCalendarEvents} from '../../src/features/calendar/flightCalendar';
import {DEFAULT_ALARM_OPTIONS, computeDutyAlarms} from '../../src/features/settings/alarmSetup';
import {
  fetchEkRoster,
  mapEkRosterToDuties,
  mapEkRosterToTrips,
  type EkRosterResponse,
} from '../../src/features/travel/ekRosterApi';
import {classifyTrips} from '../../src/features/travel/tripCsv';

const pairings = [
  ['PROJ-90000503', '2026-08-04T22:50', ['EK5', 'EK6']],
  ['PROJ-90000975', '2026-08-08T22:50', ['EK5', 'EK6']],
  ['PROJ-90001427', '2026-08-12T20:20', ['EK434', 'EK435']],
  ['PROJ-90001923', '2026-08-17T02:05', ['EK225', 'EK226']],
] as const;

const response: EkRosterResponse = {
  apiVersion: '1',
  airline: 'EK',
  crew: { crewId: 'C900001', firstName: 'James', lastName: 'Smith', base: 'DXB', rank: 'CPT' },
  pairings: pairings.map(([pairingId, checkInUtc, numbers], pairingIndex) => ({
    pairingId,
    label: numbers.join('/'),
    checkInUtc,
    releaseUtc: `2026-08-${String(7 + pairingIndex * 4).padStart(2, '0')}T03:45`,
    assignment: 'FLY',
    flights: numbers.map((flightNumber, flightIndex) => ({
      flightId: `${pairingId}-${flightIndex}`,
      flightNumber,
      carrier: 'EK',
      departureAirport: flightIndex === 0 ? 'DXB' : 'LHR',
      arrivalAirport: flightIndex === 0 ? 'LHR' : 'DXB',
      departureUtc: `2026-08-${String(5 + pairingIndex * 4 + flightIndex).padStart(2, '0')}T00:50`,
      arrivalUtc: `2026-08-${String(5 + pairingIndex * 4 + flightIndex).padStart(2, '0')}T08:35`,
      departureLocal: null,
      arrivalLocal: null,
      fleet: 'A388',
      registration: null,
      assignment: 'FLY',
    })),
  })),
  groundDuties: [],
};

const f8Response: EkRosterResponse = {
  apiVersion: '1',
  airline: 'F8',
  crew: {crewId: '113', firstName: 'F8', lastName: 'Crew', base: 'YEG', rank: 'CA'},
  pairings: [{
    pairingId: 'F8-1001',
    label: 'F8101/F8102',
    checkInUtc: '2026-09-03T10:00:00.000Z',
    releaseUtc: '2026-09-04T22:00:00.000Z',
    assignment: 'FLY',
    flights: [{
      flightId: 'F8-1001-1',
      flightNumber: 'F8101',
      carrier: 'F8',
      departureAirport: 'YEG',
      arrivalAirport: 'YVR',
      departureUtc: '2026-09-03T12:00:00.000Z',
      arrivalUtc: '2026-09-03T14:00:00.000Z',
      departureLocal: null,
      arrivalLocal: null,
      fleet: '7M8',
      registration: null,
      assignment: 'FLY',
    }],
  }],
  groundDuties: [{
    dutyId: 'F8-DO-2026-09-05',
    label: 'DO',
    startUtc: '2026-09-05T00:00:00.000Z',
    endUtc: '2026-09-06T00:00:00.000Z',
    assignment: 'DO',
  }],
};

const etResponse: EkRosterResponse = {
  apiVersion: '1',
  airline: 'ET',
  crew: {crewId: 'J4002', firstName: 'Getnet', lastName: 'Kifle', base: 'ADD', rank: 'CA'},
  pairings: [{
    pairingId: 'ET-2001',
    label: 'ET805/ET802',
    checkInUtc: '2026-09-01T12:10:00.000Z',
    releaseUtc: '2026-09-01T18:30:00.000Z',
    assignment: 'FLT',
    flights: [
      {
        flightId: 'ET-2001-1',
        flightNumber: 'ET805',
        carrier: 'ET',
        departureAirport: 'ADD',
        arrivalAirport: 'NBO',
        departureUtc: '2026-09-01T12:30:00.000Z',
        arrivalUtc: '2026-09-01T14:30:00.000Z',
        departureLocal: null,
        arrivalLocal: null,
        fleet: 'B738',
        registration: null,
        assignment: 'FLT',
      },
      {
        flightId: 'ET-2001-2',
        flightNumber: 'ET802',
        carrier: 'ET',
        departureAirport: 'NBO',
        arrivalAirport: 'ADD',
        departureUtc: '2026-09-01T16:00:00.000Z',
        arrivalUtc: '2026-09-01T18:00:00.000Z',
        departureLocal: null,
        arrivalLocal: null,
        fleet: 'B738',
        registration: null,
        assignment: 'FLT',
      },
    ],
  }],
  groundDuties: [],
};

describe('EK roster API adapter', () => {
  it('maps four pairings and eight flights to existing Trip structures', () => {
    const trips = mapEkRosterToTrips(response);
    expect(trips).toHaveLength(4);
    expect(trips.flatMap(trip => trip.legs)).toHaveLength(8);
    expect(trips.map(trip => trip.id)).toEqual(pairings.map(pairing => pairing[0]));
    expect(trips[0].crewId).toBe('C900001');
    expect(trips[0].legs[0]).toMatchObject({
      crewId: 'C900001', fltNumber: 'EK5', depArp: 'DXB', arvArp: 'LHR', fleet: 'A388',
    });
  });

  it('maps F8 mobile roster payload through API-backed trip structures', () => {
    const trips = mapEkRosterToTrips(f8Response);

    expect(trips[0].crewId).toBe('113');
    expect(trips[0].legs[0].fltNumber).toBe('F8101');
  });

  it('maps ET mobile roster payload two-leg pairing through Trip structures', () => {
    const trips = mapEkRosterToTrips(etResponse);

    expect(trips).toHaveLength(1);
    expect(trips[0].crewId).toBe('J4002');
    expect(trips[0].legs).toHaveLength(2);
    expect(trips[0].legs[0].fltNumber).toBe('ET805');
    expect(trips[0].legs[1].fltNumber).toBe('ET802');
  });

  it('maps F8 ground duties into UTC portal duties', () => {
    const duties = mapEkRosterToDuties(f8Response);

    expect(duties).toEqual([expect.objectContaining({
      id: 'F8-DO-2026-09-05',
      crewId: '113',
      carrier: 'F8',
      assignment: 'DO',
      startUTC: '2026-09-05T00:00:00.000Z',
      endUTC: '2026-09-06T00:00:00.000Z',
      baseOffsetMin: 0,
    })]);
  });

  it('derives a stable F8 duty id when the API omits dutyId', () => {
    const duties = mapEkRosterToDuties({
      ...f8Response,
      groundDuties: [{...f8Response.groundDuties[0], dutyId: undefined}],
    });

    expect(duties).toEqual([expect.objectContaining({
      id: 'F8:113:DO:DO:2026-09-05T00:00:00.000Z:2026-09-06T00:00:00.000Z',
      crewId: '113',
      carrier: 'F8',
      baseOffsetMin: 0,
    })]);
  });

  it('normalizes UTC timestamps through trip classification, calendar, and alarm consumers', () => {
    const trips = mapEkRosterToTrips(response);

    expect(trips[0].checkInDateUTC).toBe('04 Aug 2026 2250');
    expect(trips[0].legs[0].flightDateUTC).toBe('05 Aug 2026 0050');
    expect(trips[0].legs[0].arvDateUTC).toBe('05 Aug 2026 0835');
    expect(classifyTrips(trips, new Date('2026-08-07T09:00:00Z')).past).toHaveLength(1);

    const flightEvent = buildDutyCalendarEvents(trips[0], DEFAULT_ALARM_OPTIONS)
      .find(event => event.key.endsWith(':flight:0'));
    expect(flightEvent).toMatchObject({
      startISO: '2026-08-05T00:50:00Z',
      endISO: '2026-08-05T08:35:00Z',
    });
    expect(computeDutyAlarms([trips[0]])[0].wakeUp.instant.toISOString())
      .toBe('2026-08-04T20:50:00.000Z');
  });

  it('rejects an unsupported API version before saving data', () => {
    expect(() => mapEkRosterToTrips({...response, apiVersion: '2'})).toThrow('Unsupported roster API version');
  });

  it.each([
    ['non-object response', null],
    ['non-array pairings', {...response, pairings: {}}],
    ['missing required crew string', {...response, crew: {...response.crew, crewId: ''}}],
    ['malformed pairing timestamp', {
      ...response,
      pairings: [{...response.pairings[0], checkInUtc: '04 Aug 2026 2250'}],
    }],
    ['non-array nested flights', {
      ...response,
      pairings: [{...response.pairings[0], flights: {}}],
    }],
    ['missing required flight string', {
      ...response,
      pairings: [{
        ...response.pairings[0],
        flights: [{...response.pairings[0].flights[0], arrivalAirport: ''}],
      }],
    }],
    ['malformed optional local timestamp', {
      ...response,
      pairings: [{
        ...response.pairings[0],
        flights: [{...response.pairings[0].flights[0], departureLocal: 'tomorrow morning'}],
      }],
    }],
    ['duplicate pairing IDs', {
      ...response,
      pairings: [response.pairings[0], {...response.pairings[1], pairingId: response.pairings[0].pairingId}],
    }],
    ['duplicate flight IDs across pairings', {
      ...response,
      pairings: [
        response.pairings[0],
        {
          ...response.pairings[1],
          flights: [{
            ...response.pairings[1].flights[0],
            flightId: response.pairings[0].flights[0].flightId,
          }],
        },
      ],
    }],
  ])('rejects malformed payload: %s', (_label, malformed) => {
    expect(() => mapEkRosterToTrips(malformed as never)).toThrow(/EK roster response|Unsupported/);
  });

  it('posts normalized credentials to the configured base URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => response}) as jest.Mock;
    await fetchEkRoster('http://127.0.0.1:8000/api/', {crewId: 'c900001', password: 'Pier2026'});
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/crew-app/v1/roster',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({airline: 'EK', crewId: 'C900001', password: 'Pier2026'}),
      }),
    );
  });

  it('posts F8 credentials to the mobile roster session endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({code: 200, data: f8Response, message: 'ok'}),
    }) as jest.Mock;

    await fetchEkRoster('http://127.0.0.1:3000/api', {
      airline: 'F8',
      crewId: '113',
      password: 'test-password',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/mobile-roster/session',
      expect.objectContaining({
        body: JSON.stringify({airline: 'F8', crewId: '113', password: 'test-password'}),
      }),
    );
  });

  it('posts ET credentials to the mobile roster session endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({code: 200, data: etResponse, message: 'ok'}),
    }) as jest.Mock;

    await fetchEkRoster('http://127.0.0.1:3000/api', {
      airline: 'ET',
      crewId: 'j4002',
      password: 'Pier2026',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/mobile-roster/session',
      expect.objectContaining({
        body: JSON.stringify({airline: 'ET', crewId: 'J4002', password: 'Pier2026'}),
      }),
    );
  });

  it('defaults a flight missing carrier to the ET envelope airline', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        message: 'ok',
        data: {
          ...etResponse,
          pairings: [{
            ...etResponse.pairings[0],
            flights: [{
              ...etResponse.pairings[0].flights[0],
              carrier: undefined,
            }],
          }],
        },
      }),
    }) as jest.Mock;

    const roster = await fetchEkRoster('http://127.0.0.1:3000/api', {
      airline: 'ET',
      crewId: 'J4002',
      password: 'Pier2026',
    });

    expect(roster.airline).toBe('ET');
    expect(roster.pairings[0].flights[0]).toMatchObject({
      carrier: 'ET',
      flightNumber: 'ET805',
    });
  });

  it('accepts F8 live-server flight timestamps from mobile roster envelope', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        message: 'ok',
        data: {
          ...f8Response,
          pairings: [{
            ...f8Response.pairings[0],
            flights: [{
              flightId: '140587',
              flightNumber: '824',
              departureAirport: 'YVR',
              arrivalAirport: 'YEG',
              startUtc: '2026-08-30T07:40:00.000Z',
              endUtc: '2026-08-30T09:15:00.000Z',
            }],
          }],
        },
      }),
    }) as jest.Mock;

    const roster = await fetchEkRoster('https://cr.rois.one/api', {
      airline: 'F8',
      crewId: '113',
      password: 'test-password',
    });

    expect(roster.pairings[0].flights[0]).toMatchObject({
      carrier: 'F8',
      departureUtc: '2026-08-30T07:40:00.000Z',
      arrivalUtc: '2026-08-30T09:15:00.000Z',
      departureLocal: null,
      arrivalLocal: null,
      fleet: null,
      registration: null,
      assignment: 'FLY',
    });
  });

  it('rejects a non-success F8 roster envelope', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({code: 401, data: null, message: 'invalid credentials'}),
    }) as jest.Mock;

    await expect(fetchEkRoster('http://127.0.0.1:3000/api', {
      airline: 'F8', crewId: '113', password: 'wrong',
    })).rejects.toThrow('F8 roster API rejected request');
  });

  it.each([
    ['missing data', {code: 200, message: 'ok'}],
    ['malformed data', {code: 200, data: {airline: 'F8'}, message: 'ok'}],
  ])('rejects an F8 roster envelope with %s', async (_label, envelope) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => envelope,
    }) as jest.Mock;

    await expect(fetchEkRoster('http://127.0.0.1:3000/api', {
      airline: 'F8', crewId: '113', password: 'test-password',
    })).rejects.toThrow('Invalid F8 roster envelope');
  });

  it('surfaces authentication failure without returning a roster', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: false, status: 401}) as jest.Mock;
    await expect(fetchEkRoster('http://127.0.0.1:8000/api', {
      crewId: 'C900001', password: 'wrong',
    })).rejects.toThrow('Invalid crew credentials');
  });

  it('validates the complete response before returning it to persistence callers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({...response, pairings: [{...response.pairings[0], flights: null}]}),
    }) as jest.Mock;

    await expect(fetchEkRoster('http://127.0.0.1:8000/api', {
      crewId: 'C900001', password: 'Pier2026',
    })).rejects.toThrow('Invalid EK roster response');
  });
});
