import { parsePortalCaptures } from '../../src/features/travel/portalCapture';
import { buildMonth } from '../../src/features/v2/model';
import { haversineKm, monthRoutes, monthStats, positionOf } from '../../src/features/v2/schedView';

describe('PR calendar detail route-map regression', () => {
  it('covers every airport in crew 473006’s captured October roster, including Haneda', () => {
    for (const airport of ['BKK', 'HKG', 'HND', 'MEL', 'MNL', 'PVG', 'SYD', 'YVR']) {
      expect(positionOf(airport)).not.toBeNull();
    }
    const km = haversineKm(positionOf('MNL')!, positionOf('HND')!);
    expect(km).toBeGreaterThan(2950);
    expect(km).toBeLessThan(3050);
  });

  it('reads the PR arrival field arp and closes the MNL–TPE–MNL rotation', () => {
    // PR detailAll uses dep/arp (not dep/arv). Field order includes arpIntervalHour
    // to guard against treating an arbitrary airport-related field as the code.
    const flights = [
      { fltNum: 'PR890', dep: 'MNL', arp: 'TPE', start: '2026-10-29 06:00', end: '2026-10-29 08:30' },
      { fltNum: 'PR891', dep: 'TPE', arp: 'MNL', start: '2026-10-29 10:00', end: '2026-10-29 12:30' },
    ];
    const { trips } = parsePortalCaptures([
      { source: 'net', url: '/selectPortalCalendar', body: { data: flights.map((f, i) => ({
        id: i + 1, assignment: 'FLY', type: 'F', fltNum: f.fltNum,
        briefStart: '2026-10-29 05:00', startDateTime: f.start, endDateTime: f.end,
        localStartDateTime: f.start, localEndDateTime: f.end,
      })) } },
      { source: 'net', url: '/selectPortalCalendarDetailAll', body: { data: flights.map(f => ({
        fltId: 123, fltNum: f.fltNum, dep: f.dep, arpIntervalHour: 8,
        arp: f.arp, fltDate: '2026-10-29', fleet: '321', flightBookingLocator: 'BOOKING-TEST',
      })) } },
    ], '487424', 'PR', { baseAirport: 'MNL', baseOffsetMin: 480 });
    expect(trips).toHaveLength(1);
    expect(trips[0].legs.map(l => [l.depArp, l.arvArp])).toEqual([['MNL', 'TPE'], ['TPE', 'MNL']]);
    expect(trips[0].legs.every(l => l.crewId === '487424')).toBe(true);
    const month = buildMonth(2026, 9, trips, [], [], 'airport', 'Asia/Manila', {}, new Date('2026-10-08T00:00:00Z'));
    expect(monthRoutes(month, 'MNL').map(r => [r.code, r.legs])).toEqual([['TPE', 2]]);
    const stats = monthStats(month, 'MNL');
    expect(stats).toMatchObject({ flights: 2, routes: 1, airports: 2, countries: 2, blockMinutes: 300 });
    expect(stats.km).toBeGreaterThan(2300);
    expect(stats.km).toBeLessThan(2400);
  });
});
