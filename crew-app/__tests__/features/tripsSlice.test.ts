import reducer, {
  addTrips,
  setTrips,
  syncCapturedTrips,
  clearTrips,
} from '../../src/features/travel/tripsSlice';
import type { Trip } from '../../src/features/travel/tripCsv';

const leg = (fltNumber: string, depArp: string, arvArp: string) => ({
  crewId: '35459', fltNumber, flightDateUTC: '02 May 2026 0311', depArp,
  arvDateUTC: '02 May 2026 0540', arvArp, fleet: '', hotel: '',
});

// A trip captured WITHOUT airports (the stale DEP/ARR state)…
const stale: Trip = {
  id: '35459-2026-05-02 08:30-TG319', crewId: '35459', checkInDateUTC: '2026-05-02 08:30',
  legs: [leg('TG319', '', '')],
};
// …and the SAME trip re-captured WITH real airports (same id).
const enriched: Trip = {
  id: '35459-2026-05-02 08:30-TG319', crewId: '35459', checkInDateUTC: '2026-05-02 08:30',
  legs: [leg('TG319', 'BKK', 'KTM')],
};

describe('tripsSlice addTrips (upsert)', () => {
  it('REPLACES a stale trip with the re-captured enriched one (same id)', () => {
    let state = reducer(undefined, setTrips([stale]));
    expect(state.trips[0].legs[0].depArp).toBe(''); // stale: no airport

    state = reducer(state, addTrips([enriched]));
    expect(state.trips).toHaveLength(1); // not duplicated
    expect(state.trips[0].legs[0].depArp).toBe('BKK'); // updated in place
    expect(state.trips[0].legs[0].arvArp).toBe('KTM');
  });

  it('adds genuinely new trips while leaving others intact', () => {
    const other: Trip = { id: 'x', crewId: '35459', checkInDateUTC: '2026-06-01 06:00', legs: [leg('TG401', 'BKK', 'SIN')] };
    let state = reducer(undefined, setTrips([stale]));
    state = reducer(state, addTrips([other]));
    expect(state.trips.map(t => t.id)).toEqual([stale.id, 'x']);
  });

  it('clearTrips empties the list', () => {
    let state = reducer(undefined, setTrips([stale, enriched]));
    state = reducer(state, clearTrips());
    expect(state.trips).toHaveLength(0);
  });
});

// ─── syncCapturedTrips: authoritative replace cleans up stale records ──────────
// A portal re-capture must REMOVE stale cards (old split single-leg trips, or a
// duty dropped from the republished roster) for that crew inside the captured
// window — addTrips' upsert could only ever leave them behind.
describe('tripsSlice syncCapturedTrips (authoritative window replace)', () => {
  const mkLeg = (fltNumber: string, depArp: string, arvArp: string, depUTC: string, arvUTC: string) => ({
    crewId: '35459', fltNumber, flightDateUTC: depUTC, depArp, arvDateUTC: arvUTC, arvArp, fleet: '', hotel: '',
  });
  const trip = (id: string, crewId: string, checkIn: string, legs: any[]): Trip => ({ id, crewId, checkInDateUTC: checkIn, legs });

  // Existing (stale) state: a BKK-SIN-BKK round trip split into two single-leg
  // cards, a Frankfurt orphan no longer on the roster, an older out-of-window
  // April trip, and a different crew's trip.
  const oldOut = trip('35459-2026-05-24 17:25-TG401', '35459', '2026-05-24 17:25', [mkLeg('TG401', 'BKK', 'SIN', '24 May 2026 1210', '24 May 2026 1441')]);
  const oldBack = trip('35459-2026-05-25 06:00-TG402', '35459', '2026-05-25 06:00', [mkLeg('TG402', 'SIN', 'BKK', '25 May 2026 0018', '25 May 2026 0239')]);
  const fraOrphan = trip('35459-2026-05-25 11:00-TG921', '35459', '2026-05-25 11:00', [mkLeg('TG921', 'FRA', 'BKK', '25 May 2026 1243', '25 May 2026 2316')]);
  const marchTrip = trip('35459-2026-03-10 06:00-TG100', '35459', '2026-03-10 06:00', [mkLeg('TG100', 'BKK', 'HKG', '10 Mar 2026 0100', '10 Mar 2026 0400')]);
  const otherCrew = trip('99999-2026-05-20 06:00-TG200', '99999', '2026-05-20 06:00', [mkLeg('TG200', 'BKK', 'NRT', '20 May 2026 0100', '20 May 2026 0700')]);

  // Fresh capture spanning Apr–Jun: the round trip is now ONE grouped trip
  // (same id as the old outbound), plus window-edge trips so the span covers May.
  const grouped = trip('35459-2026-05-24 17:25-TG401', '35459', '2026-05-24 17:25', [
    mkLeg('TG401', 'BKK', 'SIN', '24 May 2026 1210', '24 May 2026 1441'),
    mkLeg('TG402', 'SIN', 'BKK', '25 May 2026 0018', '25 May 2026 0239'),
  ]);
  const aprEdge = trip('35459-2026-04-01 06:00-TG303', '35459', '2026-04-01 06:00', [mkLeg('TG303', 'BKK', 'RGN', '01 Apr 2026 0100', '01 Apr 2026 0300')]);
  const junEdge = trip('35459-2026-06-30 06:00-TG433', '35459', '2026-06-30 06:00', [mkLeg('TG433', 'BKK', 'CGK', '30 Jun 2026 0100', '30 Jun 2026 0400')]);

  it('removes stale in-window cards, keeps out-of-window history and other crews', () => {
    let state = reducer(undefined, setTrips([oldOut, oldBack, fraOrphan, marchTrip, otherCrew]));
    state = reducer(state, syncCapturedTrips([aprEdge, grouped, junEdge]));
    const ids = state.trips.map(t => t.id).sort();

    // Stale split return + Frankfurt orphan are GONE.
    expect(ids).not.toContain('35459-2026-05-25 06:00-TG402');
    expect(ids).not.toContain('35459-2026-05-25 11:00-TG921');
    // The grouped two-leg trip replaced the old single-leg outbound.
    const sin = state.trips.find(t => t.id === '35459-2026-05-24 17:25-TG401')!;
    expect(sin.legs.map(l => l.fltNumber)).toEqual(['TG401', 'TG402']);
    // Out-of-window March history and the other crew survive.
    expect(ids).toContain('35459-2026-03-10 06:00-TG100');
    expect(ids).toContain('99999-2026-05-20 06:00-TG200');
  });

  it('is a no-op on an empty capture (never wipes existing trips)', () => {
    let state = reducer(undefined, setTrips([oldOut, marchTrip]));
    state = reducer(state, syncCapturedTrips([]));
    expect(state.trips).toHaveLength(2);
  });
});
