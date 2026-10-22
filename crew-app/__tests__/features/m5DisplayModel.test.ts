import {
  buildM5TripSnapshot,
  encodeM5TripSnapshot,
  formatCountdown,
} from '../../src/features/m5-display/m5DisplayModel';
import type { Trip } from '../../src/features/travel/tripCsv';

const trip: Trip = {
  id: 'tg-rotation',
  crewId: 'test-crew',
  checkInDateUTC: '24 Oct 2026 0100',
  legs: [
    {
      crewId: 'test-crew',
      fltNumber: 'TG910',
      flightDateUTC: '24 Oct 2026 0300',
      depArp: 'BKK',
      arvDateUTC: '24 Oct 2026 1530',
      arvArp: 'LHR',
      fleet: '77W',
      hotel: 'Crew Hotel',
    },
    {
      crewId: 'test-crew',
      fltNumber: 'TG911',
      flightDateUTC: '26 Oct 2026 1030',
      depArp: 'LHR',
      arvDateUTC: '27 Oct 2026 0030',
      arvArp: 'BKK',
      fleet: '77W',
      hotel: '',
    },
  ],
};

describe('M5 Crew Display trip snapshot', () => {
  it('uses the roster-published check-in and whole-rotation city card', () => {
    const now = new Date('2026-10-23T00:00:00Z');
    const snapshot = buildM5TripSnapshot([trip], 'BKK', now);

    expect(snapshot).toMatchObject({
      city: 'LONDON',
      destination: 'LHR',
      flight: 'TG910',
      route: 'BKK-LHR-BKK',
      checkInLocal: '08:00',
      checkInEpoch: Date.parse('2026-10-24T01:00:00Z') / 1000,
      departureEpoch: Date.parse('2026-10-24T03:00:00Z') / 1000,
      legCount: 2,
    });
  });

  it('falls back to departure minus two hours when report time is absent', () => {
    const withoutReport = {...trip, checkInDateUTC: ''};
    const snapshot = buildM5TripSnapshot(
      [withoutReport],
      'BKK',
      new Date('2026-10-23T00:00:00Z'),
    );

    expect(snapshot?.checkInEpoch).toBe(Date.parse('2026-10-24T01:00:00Z') / 1000);
  });

  it('encodes no crew identity and sanitizes delimiter characters', () => {
    const snapshot = buildM5TripSnapshot(
      [{...trip, legs: [{...trip.legs[0], fltNumber: 'TG|910\n'}]}],
      'BKK',
      new Date('2026-10-23T00:00:00Z'),
    );
    const encoded = encodeM5TripSnapshot(snapshot);

    expect(encoded.split('|')).toHaveLength(10);
    expect(encoded).toContain('TG 910');
    expect(encoded).not.toContain('test-crew');
  });

  it('returns the explicit empty payload with no upcoming trip', () => {
    const snapshot = buildM5TripSnapshot([], 'BKK', new Date('2026-10-23T00:00:00Z'));
    expect(snapshot).toBeNull();
    expect(encodeM5TripSnapshot(snapshot)).toBe('1|NO TRIP|||||0|0|0|0');
  });

  it('formats a live check-in countdown', () => {
    const now = new Date('2026-10-23T00:00:00Z');
    expect(formatCountdown(Date.parse('2026-10-24T02:30:00Z') / 1000, now)).toBe('1d 2h 30m');
    expect(formatCountdown(Date.parse('2026-10-23T00:00:00Z') / 1000, now)).toBe('CHECK IN NOW');
  });
});
