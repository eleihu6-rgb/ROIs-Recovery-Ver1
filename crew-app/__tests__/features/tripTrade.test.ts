// Trip Trade · Page 1 (My Duty) — model, roster source, and overlay slice.
//
// Page 1 shows the crew's ACTUAL captured duties (TG/PR crew portal) and lets
// them publish (all / individual) and attach a desired-duty "trade". This covers:
//   • the derived trade type (Generic / Hybrid / Specific) + placement,
//   • the roster→duty transform (real Trip → My Duty card),
//   • the publish/trade overlay reducers.

import {
  tradeKind, kindLabel, isDateSpecific, tradePlacement,
  mergeOverlay, allPublished, anyPublished, swappableCount, emptyOverlay,
  type Trade, type TradeDuty,
} from '../../src/features/tripTrade/tripTradeModel';
import {
  tripToDuty, dutiesFromTrips, pairingLabel, dateParts,
} from '../../src/features/tripTrade/tripTradeSource';
import reducer, { tripTradeActions } from '../../src/features/tripTrade/tripTradeSlice';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';

const {
  _setPublished, _setManyPublished, _setTrade, _clearTrade,
  _addGenericWant, _removeGenericWant, _hydrate,
} = tripTradeActions;

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// A real-shaped captured trip: TG640 BKK→NRT then TG641 NRT→BKK, 20–21 Aug 2026.
const leg = (over: Partial<TripLeg> = {}): TripLeg => ({
  crewId: '44117', fltNumber: 'TG640', flightDateUTC: '20 Aug 2026 0120',
  depArp: 'BKK', arvDateUTC: '20 Aug 2026 0930', arvArp: 'NRT', fleet: '350', hotel: '',
  localDepTime: '2026-08-20 08:20', localArvTime: '2026-08-20 16:30', ...over,
});
const trip = (over: Partial<Trip> = {}): Trip => ({
  id: '44117-20 Aug 2026 0620-TG640', crewId: '44117', checkInDateUTC: '20 Aug 2026 0620',
  legs: [
    leg(),
    leg({
      fltNumber: 'TG641', depArp: 'NRT', arvArp: 'BKK',
      flightDateUTC: '21 Aug 2026 0900', arvDateUTC: '21 Aug 2026 1430',
      localDepTime: '2026-08-21 18:00', localArvTime: '2026-08-21 23:30',
    }),
  ],
  ...over,
});

// ─── Classification — derived, not chosen ─────────────────────────────────────
describe('tradeKind — the four spec cases + more', () => {
  it('#1 dated + condition → Hybrid', () => {
    expect(tradeKind({ date: '2026-08-20', wantsExactDuty: false })).toBe('hybrid');
  });
  it('#2 dated + exact duty → Specific (DO)', () => {
    expect(tradeKind({ date: '2026-08-22', wantsExactDuty: true })).toBe('specific');
  });
  it('#3 dateless → Generic (FRA layover)', () => {
    expect(tradeKind({ wantsExactDuty: false })).toBe('generic');
  });
  it('#4 dated + exact flight → Specific (TG123 ARN)', () => {
    expect(tradeKind({ date: '2026-08-25', wantsExactDuty: true })).toBe('specific');
  });
  it('dateless-exact folds into Generic; empty date is dateless', () => {
    expect(tradeKind({ wantsExactDuty: true })).toBe('generic');
    expect(tradeKind({ date: '', wantsExactDuty: false })).toBe('generic');
  });
  it('kindLabel + placement', () => {
    expect(kindLabel('hybrid')).toBe('HYBRID');
    expect(isDateSpecific({ date: '2026-08-20' })).toBe(true);
    expect(tradePlacement({ date: '2026-08-20' })).toBe('inline');
    expect(tradePlacement({})).toBe('top');
  });
});

// ─── Roster → duty transform (real data) ──────────────────────────────────────
describe('tripToDuty — maps a captured trip to a My Duty card', () => {
  const d = tripToDuty(trip())!;

  it('derives date, weekday, pairing, dest, duration, report, fleet', () => {
    expect(d.date).toBe('2026-08-20');
    expect(d.weekday).toBe(WEEKDAY[new Date(2026, 7, 20).getDay()]);
    expect(d.dayNum).toBe('20');
    expect(d.monthLabel).toBe('Aug');
    expect(d.pairing).toBe('TG640/641');   // airline prefix stripped from 2nd leg
    expect(d.dest).toBe('NRT');             // outbound turnaround port
    expect(d.durationDays).toBe(2);         // 20 Aug → 21 Aug
    expect(d.report).toBe('06:20');         // check-in local time
    expect(d.fleet).toBe('A350');
    expect(d.published).toBe(false);        // private by default (PDPA)
  });

  it('returns null for a trip with no legs', () => {
    expect(tripToDuty(trip({ legs: [] }))).toBeNull();
  });

  it('single-leg one-way still works', () => {
    const one = tripToDuty(trip({ legs: [leg()] }))!;
    expect(one.pairing).toBe('TG640');
    expect(one.durationDays).toBe(1);
  });
});

describe('pairingLabel / dateParts', () => {
  it('collapses the shared airline prefix', () => {
    expect(pairingLabel([leg(), leg({ fltNumber: 'TG641' })])).toBe('TG640/641');
    expect(pairingLabel([leg({ fltNumber: 'PR537' }), leg({ fltNumber: 'PR538' })])).toBe('PR537/538');
  });
  it('parses both roster date formats', () => {
    expect(dateParts('2026-08-20 08:20')).toEqual({ y: 2026, mo: 7, d: 20 });
    expect(dateParts('20 Aug 2026 0620')).toEqual({ y: 2026, mo: 7, d: 20 });
    expect(dateParts('nonsense')).toBeNull();
  });
});

describe('dutiesFromTrips — filters by crew and sorts by date', () => {
  const trips: Trip[] = [
    trip({ id: 'b', checkInDateUTC: '25 Aug 2026 0000', legs: [leg({ localDepTime: '2026-08-25 00:30' })] }),
    trip({ id: 'a', checkInDateUTC: '20 Aug 2026 0620' }),
    trip({ id: 'other', crewId: '99999' }),
  ];
  it('drops other crews and sorts ascending', () => {
    const out = dutiesFromTrips(trips, '44117');
    expect(out.map(d => d.id)).toEqual(['a', 'b']);
  });
  it('with no crew filter keeps all parseable trips', () => {
    expect(dutiesFromTrips(trips).length).toBe(3);
  });
});

// ─── Overlay merge + publish helpers ──────────────────────────────────────────
describe('mergeOverlay + publish helpers', () => {
  const base: TradeDuty[] = [
    { ...tripToDuty(trip())!, id: 'a' },
    { ...tripToDuty(trip())!, id: 'b' },
  ];
  const someTrade: Trade = { id: 't', date: '2026-08-20', wantsExactDuty: true, title: 'DO', chips: ['DO'] };

  it('applies published flags + trades by id, private by default', () => {
    const merged = mergeOverlay(base, { published: { a: true }, trades: { a: someTrade } });
    expect(merged.find(d => d.id === 'a')!.published).toBe(true);
    expect(merged.find(d => d.id === 'a')!.trade).toEqual(someTrade);
    expect(merged.find(d => d.id === 'b')!.published).toBe(false);
    expect(merged.find(d => d.id === 'b')!.trade).toBeUndefined();
  });

  it('allPublished / anyPublished / swappableCount', () => {
    expect(allPublished(mergeOverlay(base, { published: { a: true }, trades: {} }))).toBe(false);
    expect(anyPublished(mergeOverlay(base, { published: { a: true }, trades: {} }))).toBe(true);
    expect(allPublished(mergeOverlay(base, { published: { a: true, b: true }, trades: {} }))).toBe(true);
    expect(allPublished(mergeOverlay([], { published: {}, trades: {} }))).toBe(false);
    expect(swappableCount(base)).toBe(2);
  });
});

// ─── Overlay slice ────────────────────────────────────────────────────────────
describe('tripTrade overlay slice', () => {
  const init = () => reducer(undefined, { type: '@@INIT' });

  it('starts empty', () => {
    expect(init()).toEqual(emptyOverlay());
  });

  it('_setManyPublished then unpublish one (unpublish after publish-all)', () => {
    let s = reducer(init(), _setManyPublished({ ids: ['a', 'b', 'c'], value: true }));
    expect(s.published).toEqual({ a: true, b: true, c: true });
    s = reducer(s, _setPublished({ id: 'b', value: false }));
    expect(s.published.b).toBe(false);
  });

  it('_setTrade / _clearTrade', () => {
    const t: Trade = { id: 'x', date: '2026-08-20', wantsExactDuty: true, title: 'DO', chips: ['DO'] };
    let s = reducer(init(), _setTrade({ id: 'a', trade: t }));
    expect(s.trades.a).toEqual(t);
    s = reducer(s, _clearTrade('a'));
    expect(s.trades.a).toBeUndefined();
  });

  it('_addGenericWant / _removeGenericWant', () => {
    const w: Trade = { id: 'g1', wantsExactDuty: false, title: 'FRA layover', chips: ['FRA'] };
    let s = reducer(init(), _addGenericWant(w));
    expect(s.genericWants).toHaveLength(1);
    s = reducer(s, _removeGenericWant('g1'));
    expect(s.genericWants).toHaveLength(0);
  });

  it('_hydrate replaces the overlay from persisted state', () => {
    const s = reducer(init(), _hydrate({ published: { a: true }, trades: {}, genericWants: [] }));
    expect(s.published.a).toBe(true);
  });
});
