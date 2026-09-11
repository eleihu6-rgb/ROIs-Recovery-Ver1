// v2 view model: greeting bands, fleet shortening, next-trip selection, and the
// month model (flight / layover / off days, focus index) built from a realistic
// BKK→LHR→BKK rotation.
import {
  alarmsByTrip,
  buildMonth,
  dutyAlarmsByTrip,
  resolveCardIndex,
  creditLabel,
  greetingFor,
  hasDutyCard,
  legView,
  nextTrip,
  shortFleet,
} from '../../src/features/v2/model';
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

// ─── Days-off concept + first-leg markers ────────────────────────────────────
describe('hasDutyCard (nothing published = no card)', () => {
  const month = buildMonth(2026, 8, [lhr, sin], [], [], 'airport', 'Asia/Bangkok', {}, now);
  const by = (d: number) => month.days[d - 1];

  it('gives a card to flight, layover and duty days', () => {
    expect(hasDutyCard(by(19))).toBe(true); // flight
    expect(hasDutyCard(by(20))).toBe(true); // layover
    expect(hasDutyCard(by(28))).toBe(true); // flight
  });

  it('gives NO card to a blank roster day — blank is not a day off', () => {
    expect(by(11).kind).toBe('off');
    expect(by(11).ground).toBeNull();
    expect(hasDutyCard(by(11))).toBe(false);
    expect(hasDutyCard(by(24))).toBe(false);
  });

  it('DOES give a card to an explicit airline days-off duty', () => {
    const doDuty = {
      id: 'ET:J4002:DO', code: 'DO', category: 'off' as const, label: 'Day Off',
      localStart: '2026-09-09 00:00', localEnd: '2026-09-09 23:59',
      startRosterUTC: '08 Sep 2026 2100', endRosterUTC: '09 Sep 2026 2059',
      allDay: true, crewId: 'J4002', airport: 'ADD',
    };
    const withOff = buildMonth(2026, 8, [], [{
      id: doDuty.id, assignment: 'DO', fltNum: '', dutyType: 'DO',
      localStart: doDuty.localStart, localEnd: doDuty.localEnd,
      startUTC: '2026-09-08T21:00:00.000Z', endUTC: '2026-09-09T20:59:00.000Z',
      briefStart: '2026-09-08T21:00:00.000Z', crewId: 'J4002', carrier: 'ET',
      baseOffsetMin: 0, airportCode: 'ADD', raw: {},
    }], [], 'airport', 'Africa/Addis_Ababa', {}, now);

    const day9 = withOff.days[8];
    expect(day9.ground?.label).toBe('Day Off');
    expect(day9.kind).toBe('off');
    expect(hasDutyCard(day9)).toBe(true);
    // And the blank neighbour still has none.
    expect(hasDutyCard(withOff.days[11])).toBe(false);
  });
});

// Crash fix: browsing to a month with nothing published used to blow up the
// Schedule tab — FlatList.scrollToIndex throws "item length 0 but minimum is 1"
// when the card list is empty, and the mount effect always asked for index 0.
describe('resolveCardIndex (empty month must not throw)', () => {
  it('returns null when the month has no card to scroll to', () => {
    expect(resolveCardIndex(new Map(), 0, 0)).toBeNull();
    // A blank month can still be focused on day 30 — still nothing to scroll to.
    expect(resolveCardIndex(new Map(), 29, 0)).toBeNull();
  });

  it('maps a day chip to its card, and a blank day to the first card', () => {
    const stripToList = new Map([[2, 0], [7, 3], [9, 4]]);
    expect(resolveCardIndex(stripToList, 7, 12)).toBe(3);
    expect(resolveCardIndex(stripToList, 5, 12)).toBe(0); // blank day → first card
    expect(resolveCardIndex(stripToList, 20, 5)).toBe(0);
  });

  it('never asks for an index past the end of the list', () => {
    const stripToList = new Map([[9, 40]]);
    expect(resolveCardIndex(stripToList, 9, 12)).toBe(11);
  });
});

describe('legView duty markers', () => {
  // Ryan's on-device review: the 10 Sep ET805 card listed CHECK-IN but neither
  // WAKE UP nor LEAVE HOME. Those two came from the alarm model, which only covers
  // duties that have not finished yet — so a flown duty lost half of its marker row
  // while still showing check-in. The schedule is a record: it keeps all three.
  it('keeps wake-up + leave-home on a duty that has already been flown', () => {
    const flown: Trip = {
      id: 'trip-flown', crewId: 'J4002',
      checkInDateUTC: '01 Sep 2026 0500',
      legs: [{
        crewId: 'J4002', fltNumber: 'ET805', flightDateUTC: '01 Sep 2026 0510',
        depArp: 'ADD', arvDateUTC: '01 Sep 2026 0800', arvArp: 'DAR', fleet: '7M8', hotel: '',
      }],
    };
    const longAfter = new Date('2026-09-11T21:00:00Z');

    // Nothing to SCHEDULE for a duty that is over …
    expect(alarmsByTrip([flown], 2, 3, {}, longAfter).all).toHaveLength(0);

    // … but the record view still derives all three marker times from the roster.
    const { byTrip } = dutyAlarmsByTrip([flown], 2, 3, {});
    const month = buildMonth(2026, 8, [flown], [], [], 'airport', 'Africa/Addis_Ababa', byTrip, longAfter);
    const leg = month.days[0].legs[0].leg;
    expect(leg.firstLeg).toBe(true);
    expect(leg.ready).not.toBe('—');
    expect(leg.leaveHome).not.toBe('—');
    expect(leg.checkIn).not.toBe('—');
  });

  it('marks the first leg only, and labels times with the zone marker', () => {
    const trip = lhr;
    const first = legView(trip.legs[0], trip, 'airport', 'Asia/Bangkok', undefined);
    const second = legView(trip.legs[1], trip, 'airport', 'Asia/Bangkok', undefined);

    expect(first.firstLeg).toBe(true);
    expect(second.firstLeg).toBe(false);
    // Airport mode + explicit local wall clock → the airport's own time, marked L.
    expect(first.depTime).toBe('23:45L');
    // Check-in is a duty-level marker; the second leg never repeats it.
    expect(first.checkIn).toMatch(/L$/);
    expect(second.checkIn).toBe('—');
    expect(second.leaveHome).toBe('—');
    expect(second.ready).toBe('—');
  });

  it('converts API-fed UTC legs into the airport own clock', () => {
    // ET877 ADD→LLW on 11 Sep 2026: 07:10Z dep → 10:10 ADD local, 11:10Z arr → 13:10 LLW.
    const et: Trip = {
      id: 'et-877', crewId: 'J4001', checkInDateUTC: '11 Sep 2026 0530',
      legs: [{
        crewId: 'J4001', fltNumber: 'ET877', flightDateUTC: '11 Sep 2026 0710',
        depArp: 'ADD', arvDateUTC: '11 Sep 2026 1110', arvArp: 'LLW',
        fleet: 'B738', hotel: '', assignment: 'FLY',
      }],
    };
    const view = legView(et.legs[0], et, 'airport', 'Africa/Addis_Ababa', undefined);
    expect(view.depTime).toBe('10:10L');
    expect(view.arvTime).toBe('13:10L');
    expect(view.checkIn).toBe('08:30L');

    const utcView = legView(et.legs[0], et, 'utc', 'Africa/Addis_Ababa', undefined);
    expect(utcView.depTime).toBe('07:10Z');

    const baseView = legView(et.legs[0], et, 'base', 'Africa/Addis_Ababa', undefined);
    expect(baseView.depTime).toBe('10:10B');
  });
});
