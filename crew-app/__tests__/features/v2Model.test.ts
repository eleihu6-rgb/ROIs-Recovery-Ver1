// v2 view model: greeting bands, fleet shortening, next-trip selection, and the
// month model (flight / layover / off days, focus index) built from a realistic
// BKK→LHR→BKK rotation.
import { buildMonth, greetingFor, nextTrip, shortFleet, creditLabel } from '../../src/features/v2/model';
import type { Trip } from '../../src/features/travel/tripCsv';

const at = (h: number) => new Date(2026, 8, 11, h, 0, 0);

describe('greetingFor (device clock bands)', () => {
  it('maps each band to the right text + icon', () => {
    expect(greetingFor(at(3))).toEqual({ text: 'Good night', icon: 'moon' });
    expect(greetingFor(at(8))).toEqual({ text: 'Good morning', icon: 'sunrise' });
    expect(greetingFor(at(14))).toEqual({ text: 'Good afternoon', icon: 'sun' });
    expect(greetingFor(at(19))).toEqual({ text: 'Good evening', icon: 'sunset' });
    expect(greetingFor(at(22))).toEqual({ text: 'Good night', icon: 'moon' });
  });
});

describe('shortFleet', () => {
  it('shortens manufacturer names to the type code', () => {
    expect(shortFleet('Airbus A350-900')).toBe('A350');
    expect(shortFleet('Boeing 787-9')).toBe('B787');
    expect(shortFleet('A320')).toBe('A320');
    expect(shortFleet('')).toBe('');
  });
});

// Real-shape rotation: BKK→LHR (19 Sep) · LHR→BKK (21 Sep), two-night layover.
const lhr: Trip = {
  id: 'trip-lhr', crewId: '35459', checkInDateUTC: '19 Sep 2026 1545', layoverHours: 50,
  legs: [
    { crewId: '35459', fltNumber: 'TG910', flightDateUTC: '19 Sep 2026 1645', depArp: 'BKK', arvDateUTC: '20 Sep 2026 0410', arvArp: 'LHR', fleet: 'Airbus A350-900', hotel: 'Sofitel Heathrow', localDepTime: '2026-09-19 23:45', localArvTime: '2026-09-20 05:10' },
    { crewId: '35459', fltNumber: 'TG911', flightDateUTC: '21 Sep 2026 1130', depArp: 'LHR', arvDateUTC: '22 Sep 2026 0000', arvArp: 'BKK', fleet: 'Airbus A350-900', hotel: '', localDepTime: '2026-09-21 12:30', localArvTime: '2026-09-22 07:00' },
  ],
};
const sin: Trip = {
  id: 'trip-sin', crewId: '35459', checkInDateUTC: '28 Sep 2026 0000',
  legs: [{ crewId: '35459', fltNumber: 'TG403', flightDateUTC: '28 Sep 2026 0100', depArp: 'BKK', arvDateUTC: '28 Sep 2026 0315', arvArp: 'SIN', fleet: 'A350', hotel: '', localDepTime: '2026-09-28 08:00', localArvTime: '2026-09-28 11:15' }],
};
const now = new Date(2026, 8, 11, 9, 0);

describe('nextTrip', () => {
  it('returns the earliest upcoming rotation', () => {
    expect(nextTrip([sin, lhr], now)?.id).toBe('trip-lhr');
  });
  it('returns null with no upcoming trips', () => {
    expect(nextTrip([], now)).toBeNull();
  });
});

describe('buildMonth', () => {
  const m = buildMonth(2026, 8, [lhr, sin], [], [], 'airport', 'Asia/Bangkok', {}, now);
  it('lays out every day of the month', () => {
    expect(m.days).toHaveLength(30);
    expect(m.days[10].isToday).toBe(true);
  });
  it('marks flight days, the layover in between, and days off', () => {
    const by = (d: number) => m.days[d - 1];
    expect(by(19).kind).toBe('flight');
    expect(by(19).legs[0].leg.fltNumber).toBe('TG910');
    expect(by(19).legs[0].leg.fleet).toBe('A350');
    expect(by(19).legs[0].leg.arvDayOffset).toBe('+1');
    expect(by(20).kind).toBe('layover');
    expect(by(21).kind).toBe('flight');
    expect(by(28).kind).toBe('flight');
    expect(by(11).kind).toBe('off');
    expect(by(22).kind).toBe('off'); // unchanged neighbour after the return leg
  });
  it('opens on the next flight when today is a day off', () => {
    expect(m.days[m.focusIndex].day).toBe(19);
  });
  it('sums block time into the credit label', () => {
    expect(m.flightCount).toBe(3);
    expect(creditLabel(m.blockMinutes)).toBe('26'); // 11h25 + 12h30 + 2h15 ≈ 26h
  });
});
