// Duty grouping for Trip Details, using the real TG HND rotation in
// __tests__/fixtures/roster/report_35459_2026-05.json:
//   D1 12 May  TG660 BKK→HND  brief 11:15 BKK / block 5:50 / FDP 8:15
//   D2 13 May  TG661 HND→BKK  brief 21:20 BKK / block 6:33 / FDP 7:44
// (report fixture: fdpHours/dpHours/blhHours; calendar fixture: briefStart).
import { fmtDutyMinutes, groupDuties } from '../../src/features/v2/dutyGroups';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';

const leg = (over: Partial<TripLeg>): TripLeg => ({
  crewId: '35459',
  fltNumber: 'TG660',
  flightDateUTC: '12 May 2026 0610',
  depArp: 'BKK',
  arvDateUTC: '12 May 2026 1200',
  arvArp: 'HND',
  fleet: '',
  hotel: '',
  ...over,
});

const HND_ROTATION: Trip = {
  id: '35459-12 May 2026 0415-TG660',
  crewId: '35459',
  checkInDateUTC: '12 May 2026 0415',
  legs: [
    leg({
      fltNumber: 'TG660',
      dutyReportUTC: '12 May 2026 0415',
      dutyFdpMinutes: 8 * 60 + 15,
      dutyDpMinutes: 8 * 60 + 15,
      dutyBlockMinutes: 5 * 60 + 50,
    }),
    leg({
      fltNumber: 'TG661',
      flightDateUTC: '13 May 2026 1501',
      depArp: 'HND',
      arvDateUTC: '13 May 2026 2134',
      arvArp: 'BKK',
      dutyReportUTC: '13 May 2026 1420',
      dutyFdpMinutes: 7 * 60 + 44,
      dutyDpMinutes: 7 * 60 + 44,
      dutyBlockMinutes: 6 * 60 + 33,
      dutyRestHours: 26.3,
    }),
  ],
};

describe('groupDuties — Trip Details timeline', () => {
  it('splits a real BKK–HND–BKK rotation into two duties with their own totals', () => {
    const groups = groupDuties(HND_ROTATION);

    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.label)).toEqual(['D1', 'D2']);
    expect(groups[0].legs.map(l => l.fltNumber)).toEqual(['TG660']);
    expect(groups[1].legs.map(l => l.fltNumber)).toEqual(['TG661']);
    expect(groups[0].fdpMinutes).toBe(495);
    expect(groups[0].dpMinutes).toBe(495);
    expect(groups[0].blockMinutes).toBe(350);
    expect(groups[1].fdpMinutes).toBe(464);
    expect(groups[1].dpMinutes).toBe(464);
    expect(groups[1].blockMinutes).toBe(393);
  });

  it('carries the same published totals and duty key on every leg of a multi-leg duty', () => {
    // Real TG319/TG320 turn, 2 May: one report (08:30), two sectors.
    const turn: Trip = {
      id: '35459-02 May 2026 0130-TG319',
      crewId: '35459',
      checkInDateUTC: '02 May 2026 0130',
      legs: [
        leg({
          fltNumber: 'TG319',
          flightDateUTC: '02 May 2026 0311',
          arvDateUTC: '02 May 2026 0540',
          arvArp: 'KTM',
          dutyReportUTC: '02 May 2026 0130',
          dutyFdpMinutes: 612,
          dutyDpMinutes: 612,
          dutyBlockMinutes: 414,
        }),
        leg({
          fltNumber: 'TG320',
          flightDateUTC: '02 May 2026 0647',
          depArp: 'KTM',
          arvDateUTC: '02 May 2026 1112',
          arvArp: 'BKK',
          dutyReportUTC: '02 May 2026 0130',
          dutyFdpMinutes: 612,
          dutyDpMinutes: 612,
          dutyBlockMinutes: 414,
        }),
      ],
    };

    const groups = groupDuties(turn);
    expect(groups).toHaveLength(1);
    expect(groups[0].legs).toHaveLength(2);
    expect(groups[0].legs.map(l => l.dutyReportUTC)).toEqual([
      '02 May 2026 0130',
      '02 May 2026 0130',
    ]);
    expect(groups[0].fdpMinutes).toBe(612);
    expect(groups[0].blockMinutes).toBe(414);
    expect(groups[0].restHours).toBeNull();
  });

  it('computes the layover gap from the previous arrival to the next report', () => {
    const groups = groupDuties(HND_ROTATION);
    // TG660 block-in 12:00 UTC → TG661 report 14:20 UTC next day = 26h20.
    expect(groups[1].layover).toEqual({ airport: 'HND', hotel: '', hours: 26.33 });
    expect(groups[1].restHours).toBe(26.3); // published value wins over the computed gap
    expect(groups[0].layover).toBeNull();
  });

  it('falls back to the roster structure when the capture has no report time', () => {
    const withHotel: Trip = {
      ...HND_ROTATION,
      legs: [
        leg({ fltNumber: 'TG660', hotel: 'Radisson Blu', dutyReportUTC: undefined }),
        leg({
          fltNumber: 'TG661',
          flightDateUTC: '13 May 2026 1501',
          depArp: 'HND',
          arvDateUTC: '13 May 2026 2134',
          arvArp: 'BKK',
          dutyReportUTC: undefined,
        }),
      ],
    };

    const groups = groupDuties(withHotel);
    expect(groups).toHaveLength(2);
    // No published report instant → no arrival→report rest can be proven.
    expect(groups[1].layover).toEqual({ airport: 'HND', hotel: 'Radisson Blu', hours: null });
    expect(groups[1].restHours).toBeNull();
    // Block still comes from the legs' own times.
    expect(groups[1].blockMinutes).toBe(393);
  });

  it('formats duty totals as durations', () => {
    expect(fmtDutyMinutes(612)).toBe('10h 12m');
    expect(fmtDutyMinutes(350)).toBe('5h 50m');
    expect(fmtDutyMinutes(45)).toBe('45m');
    expect(fmtDutyMinutes(120)).toBe('2h');
  });
});
