import { evaluateDuty, formatDuration, newDutyTiming } from '../../src/features/dutyAnalyzer/dutyAnalyzerEngine';
import {
  cloneDutyTimeline,
  divertAndAddRecovery,
  editSegmentTimes,
  rosterDuties,
  rosterInput,
  rosterPairings,
  shiftLinkedTimes,
  shiftReportTime,
  timelineInput,
} from '../../src/features/dutyAnalyzer/dutyAnalyzerRoster';
import type {
  AnalyzerMetric,
  DutyAnalyzerInput,
  DutyAnalyzerResult,
} from '../../src/features/dutyAnalyzer/dutyAnalyzerTypes';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';

const input = (overrides: Partial<DutyAnalyzerInput> = {}): DutyAnalyzerInput => ({
  crewCategory: 'flight-deck',
  acclimatisation: 'acclimatised',
  composition: 'basic',
  restFacility: null,
  reportMinuteOfDay: 7 * 60,
  sectors: 2,
  fdpMinutes: 700,
  dpMinutes: 600,
  blockMinutes: 420,
  restBeforeMinutes: 900,
  restAfterMinutes: 900,
  atHomeBase: true,
  timezoneDifferenceHours: 0,
  splitBreakMinutes: 0,
  useDiscretion: false,
  ...overrides,
});

const metric = (result: DutyAnalyzerResult, key: AnalyzerMetric['key']): AnalyzerMetric => {
  const found = result.metrics.find(candidate => candidate.key === key);
  if (!found) throw new Error(`Missing ${key} metric`);
  return found;
};

const leg = (overrides: Partial<TripLeg>): TripLeg => ({
  crewId: '35459',
  fltNumber: 'TG102',
  flightDateUTC: '01 Nov 2026 0130',
  depArp: 'BKK',
  arvDateUTC: '01 Nov 2026 0340',
  arvArp: 'CNX',
  fleet: 'A320',
  hotel: '',
  ...overrides,
});

const BASE_TO_BASE_ROTATION: Trip = {
  id: '35459-01 Nov 2026 0030-TG102',
  crewId: '35459',
  checkInDateUTC: '01 Nov 2026 0030',
  legs: [
    leg({
      dutyReportUTC: '01 Nov 2026 0030',
      dutyFdpMinutes: 255,
      dutyDpMinutes: 300,
      dutyBlockMinutes: 250,
    }),
    leg({
      fltNumber: 'TG103',
      flightDateUTC: '01 Nov 2026 0410',
      depArp: 'CNX',
      arvDateUTC: '01 Nov 2026 0620',
      arvArp: 'BKK',
      dutyReportUTC: '01 Nov 2026 0030',
      dutyFdpMinutes: 255,
      dutyDpMinutes: 300,
      dutyBlockMinutes: 250,
    }),
    leg({
      fltNumber: 'TG201',
      flightDateUTC: '01 Nov 2026 1830',
      depArp: 'BKK',
      arvDateUTC: '01 Nov 2026 1945',
      arvArp: 'HKT',
      dutyReportUTC: '01 Nov 2026 1730',
      dutyFdpMinutes: 300,
      dutyDpMinutes: 345,
      dutyBlockMinutes: 150,
      dutyRestHours: 11.17,
    }),
    leg({
      fltNumber: 'TG202',
      flightDateUTC: '01 Nov 2026 2030',
      depArp: 'HKT',
      arvDateUTC: '01 Nov 2026 2145',
      arvArp: 'BKK',
      dutyReportUTC: '01 Nov 2026 1730',
      dutyFdpMinutes: 300,
      dutyDpMinutes: 345,
      dutyBlockMinutes: 150,
      dutyRestHours: 11.17,
    }),
  ],
};

const PR_TWO_SEGMENT_DUTY: Trip = {
  id: '473006-2026-09-06 13:25-PR501',
  crewId: '473006',
  checkInDateUTC: '2026-09-06 13:25',
  legs: [
    leg({
      crewId: '473006', fltNumber: 'PR501', flightDateUTC: '06 Sep 2026 0732',
      depArp: 'MNL', arvDateUTC: '06 Sep 2026 1056', arvArp: 'SIN',
      dutyReportUTC: '06 Sep 2026 0525', dutyFdpMinutes: 620,
      dutyDpMinutes: 635, dutyBlockMinutes: 421,
    }),
    leg({
      crewId: '473006', fltNumber: 'PR512', flightDateUTC: '06 Sep 2026 1208',
      depArp: 'SIN', arvDateUTC: '06 Sep 2026 1545', arvArp: 'MNL',
      dutyReportUTC: '06 Sep 2026 0525', dutyFdpMinutes: 620,
      dutyDpMinutes: 635, dutyBlockMinutes: 421,
    }),
  ],
};

const PR_NEXT_PAIRING: Trip = {
  id: '473006-2026-09-08 19:10-PR535',
  crewId: '473006',
  checkInDateUTC: '2026-09-08 19:10',
  legs: [leg({
    crewId: '473006', fltNumber: 'PR535', flightDateUTC: '08 Sep 2026 1242',
    depArp: 'MNL', arvDateUTC: '08 Sep 2026 1640', arvArp: 'CGK',
    dutyReportUTC: '08 Sep 2026 1110', dutyFdpMinutes: 290,
    dutyDpMinutes: 290, dutyBlockMinutes: 490,
  })],
};

const PR_ONE_SEGMENT_DUTIES: Trip = {
  id: '473006-2026-09-20 19:10-PR116',
  crewId: '473006',
  checkInDateUTC: '2026-09-20 19:10',
  legs: [
    leg({
      crewId: '473006', fltNumber: 'PR116', flightDateUTC: '20 Sep 2026 1244',
      depArp: 'MNL', arvDateUTC: '21 Sep 2026 0046', arvArp: 'YVR',
      dutyReportUTC: '20 Sep 2026 1110', dutyFdpMinutes: 290,
      dutyDpMinutes: 290, dutyBlockMinutes: 722,
    }),
    leg({
      crewId: '473006', fltNumber: 'PR117', flightDateUTC: '23 Sep 2026 0752',
      depArp: 'YVR', arvDateUTC: '23 Sep 2026 2116', arvArp: 'MNL',
      dutyReportUTC: '23 Sep 2026 0605',
    }),
  ],
};

const PR_OCTOBER_NEXT_PAIRING: Trip = {
  id: '473006-2026-10-07 20:05-PR211',
  crewId: '473006',
  checkInDateUTC: '2026-10-07 20:05',
  legs: [leg({
    crewId: '473006', fltNumber: 'PR211', flightDateUTC: '07 Oct 2026 1431',
    depArp: 'MNL', arvDateUTC: '07 Oct 2026 2238', arvArp: 'SYD',
    dutyReportUTC: '07 Oct 2026 1205', dutyFdpMinutes: 235,
    dutyDpMinutes: 235, dutyBlockMinutes: 500,
  })],
};

describe('dutyAnalyzerEngine', () => {
  it.each([
    ['05:00 band', 5 * 60, 2, 720],
    ['06:00 band', 6 * 60, 2, 720],
    ['07:00 main band', 7 * 60, 2, 780],
    ['13:00 band', 13 * 60, 2, 720],
    ['17:00 overnight band', 17 * 60, 2, 600],
    ['four landings', 7 * 60, 4, 750],
  ])('selects the EASA duty limit for %s', (_case, reportMinuteOfDay, sectors, expectedLimit) => {
    const result = evaluateDuty(input({ reportMinuteOfDay, sectors, fdpMinutes: 0 }));

    expect(metric(result, 'fdp').limitMinutes).toBe(expectedLimit);
    expect(result.source).toBe('EASA duty limits');
    expect(result.explanation.join(' ')).not.toMatch(/6007|6008/);
  });

  it('uses prior off-duty period when acclimatisation is unknown', () => {
    const result = evaluateDuty(input({
      acclimatisation: 'unknown',
      restBeforeMinutes: 12 * 60,
      sectors: 4,
      fdpMinutes: 570,
    }));

    expect(metric(result, 'fdp')).toMatchObject({ limitMinutes: 570, status: 'tight' });
    expect(result.explanation[0]).toContain('Unknown acclimatisation');
  });

  it.each([
    ['missing prior rest', null, 'Prior off-duty period is required when acclimatisation is unknown.'],
    ['unmatched prior rest', 1800, 'No approved limit row matches this prior off-duty period and landing count.'],
  ])('requires review for unknown acclimatisation with %s', (_case, restBeforeMinutes, detail) => {
    const result = evaluateDuty(input({ acclimatisation: 'unknown', restBeforeMinutes }));

    expect(result.status).toBe('needs-review');
    expect(metric(result, 'fdp')).toMatchObject({ status: 'needs-review', detail });
  });

  it.each([
    ['3 pilots, Class 3', '3P' as const, 3 as const, 840],
    ['3 pilots, Class 1', '3P' as const, 1 as const, 960],
    ['4 pilots, Class 1', '4P' as const, 1 as const, 1020],
  ])('selects the augmented limit for %s', (_case, composition, restFacility, expectedLimit) => {
    const result = evaluateDuty(input({ composition, restFacility, sectors: 2, fdpMinutes: 0 }));

    expect(metric(result, 'fdp').limitMinutes).toBe(expectedLimit);
    expect(result.explanation[0]).toContain(`Class ${restFacility}`);
  });

  it('adds half of the split break and keeps commander discretion separate', () => {
    const split = evaluateDuty(input({ sectors: 2, fdpMinutes: 825, splitBreakMinutes: 90 }));
    const normal = evaluateDuty(input({ fdpMinutes: 840, blockMinutes: 1390 }));
    const discretion = evaluateDuty(input({ fdpMinutes: 840, blockMinutes: 1390, useDiscretion: true }));

    expect(metric(split, 'fdp')).toMatchObject({ limitMinutes: 825, status: 'tight' });
    expect(metric(normal, 'fdp')).toMatchObject({ limitMinutes: 780, status: 'exceeded' });
    expect(metric(discretion, 'fdp')).toMatchObject({ limitMinutes: 900, status: 'within' });
    expect(metric(discretion, 'block')).toMatchObject({ limitMinutes: 1410, status: 'tight' });
    expect(discretion.explanation).toContain('Commander discretion applied: FDP +2 hours and block +30 minutes.');
  });

  it('treats Rest as a minimum rather than a maximum', () => {
    const exact = evaluateDuty(input({ dpMinutes: 660, restAfterMinutes: 720 }));
    const short = evaluateDuty(input({ dpMinutes: 660, restAfterMinutes: 719 }));
    const sufficient = evaluateDuty(input({ dpMinutes: 660, restAfterMinutes: 780 }));
    const negative = evaluateDuty(input({ dpMinutes: 660, restAfterMinutes: -30 }));

    expect(metric(exact, 'rest')).toMatchObject({ limitMinutes: 720, status: 'tight' });
    expect(metric(short, 'rest')).toMatchObject({ limitMinutes: 720, status: 'exceeded' });
    expect(metric(short, 'rest').detail).toContain('Rest is 1 minutes below the required minimum.');
    expect(metric(sufficient, 'rest')).toMatchObject({ status: 'within' });
    expect(metric(negative, 'rest')).toMatchObject({ status: 'exceeded' });
  });

  it('uses the away-base timezone floor for minimum rest', () => {
    const result = evaluateDuty(input({
      atHomeBase: false,
      timezoneDifferenceHours: 4,
      dpMinutes: 660,
      restAfterMinutes: 840,
    }));

    expect(metric(result, 'rest')).toMatchObject({ limitMinutes: 840, status: 'tight' });
  });

  it.each([
    ['cabin crew', { crewCategory: 'cabin' as const }, 'Cabin-crew limits require an approved cabin rule pack.'],
    ['unsupported landing count', { sectors: 100 }, 'No approved limit row matches this report time and landing count.'],
    ['augmented unknown state', { composition: '3P' as const, restFacility: 1 as const, acclimatisation: 'unknown' as const }, 'Augmented-crew limits with unknown acclimatisation need airline review.'],
  ])('marks %s as needs-review', (_case, overrides, detail) => {
    const result = evaluateDuty(input(overrides));

    expect(result.status).toBe('needs-review');
    expect(metric(result, 'fdp')).toMatchObject({ status: 'needs-review', detail });
  });

  it('projects maximum FDP and latest chock-on while chock-on is empty', () => {
    expect(newDutyTiming(input({
      reportMinuteOfDay: 13 * 60 + 30,
      sectors: 2,
      latestChockOnMinuteOfDay: null,
    }))).toEqual({
      actualFdpMinutes: null,
      requiredRestMinutes: null,
      maximumFdpMinutes: 720,
      latestChockOnMinuteOfDay: 90,
      latestChockOnDayOffset: 1,
    });
  });

  it.each([
    ['same day', 7 * 60, 18 * 60 + 30, 690],
    ['overnight', 20 * 60, 5 * 60 + 15, 555],
  ])('calculates actual FDP from report to %s chock-on', (_case, reportMinuteOfDay, latestChockOnMinuteOfDay, expected) => {
    expect(newDutyTiming(input({ reportMinuteOfDay, latestChockOnMinuteOfDay })).actualFdpMinutes).toBe(expected);
  });

  it.each([
    ['home-base floor', true, 690, 720],
    ['DP when longer', true, 780, 780],
    ['away-base floor', false, 555, 600],
  ])('calculates required rest from DP using the %s rule', (_case, atHomeBase, dpMinutes, expected) => {
    expect(newDutyTiming(input({
      reportMinuteOfDay: 7 * 60,
      latestChockOnMinuteOfDay: 7 * 60 + dpMinutes,
      atHomeBase,
    })).requiredRestMinutes).toBe(expected);
  });

  it('accepts an exact FDP maximum and fails one minute over it', () => {
    const exact = evaluateDuty(input({ fdpMinutes: 780 }));
    const over = evaluateDuty(input({ fdpMinutes: 781 }));

    expect(metric(exact, 'fdp').status).toBe('tight');
    expect(metric(over, 'fdp').status).toBe('exceeded');
  });

  it('formats every duration as zero-padded HH:MM and keeps the generic unavailable fallback for non-roster result surfaces', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(64.6)).toBe('01:05');
    expect(formatDuration(-61)).toBe('−01:01');
    expect(formatDuration(null)).toBe('Not published');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('Not published');
  });
});

describe('dutyAnalyzerRoster delay propagation', () => {
  it('keeps multiple duties inside their dated pairing projection', () => {
    const pairings = rosterPairings([BASE_TO_BASE_ROTATION], '35459');

    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toMatchObject({
      id: BASE_TO_BASE_ROTATION.id,
      route: 'BKK–CNX–BKK–HKT–BKK',
      dateLabel: '01 Nov 2026',
    });
    expect(pairings[0].duties).toHaveLength(2);
    expect(pairings[0].duties[0]).toMatchObject({ dutyIndex: 0, route: 'BKK–CNX–BKK' });
    expect(pairings[0].duties[1]).toMatchObject({ dutyIndex: 1, route: 'BKK–HKT–BKK' });
  });

  it('delays the second flight of a real 473006 two-segment duty by one hour and recalculates FDP margin, DP and rest', () => {
    const duties = rosterDuties([PR_TWO_SEGMENT_DUTY, PR_NEXT_PAIRING], '473006');
    const simulated = rosterInput(duties[0], 60);
    const result = evaluateDuty(simulated);

    expect(duties[0]).toMatchObject({ route: 'MNL–SIN–MNL', sectors: 2, lastFlight: 'PR512' });
    expect(simulated).toMatchObject({
      reportMinuteOfDay: 13 * 60 + 25,
      fdpMinutes: 680,
      dpMinutes: 695,
      blockMinutes: 421,
      restAfterMinutes: 2530,
    });
    expect(metric(result, 'fdp')).toMatchObject({
      actualMinutes: 680,
      limitMinutes: 720,
      marginMinutes: 40,
      status: 'within',
    });
    expect(metric(result, 'dp')).toMatchObject({ actualMinutes: 695, limitMinutes: 960 });
    expect(metric(result, 'rest')).toMatchObject({ actualMinutes: 2530, limitMinutes: 720 });
  });

  it('keeps report time fixed for a real 473006 one-segment duty delayed by two hours and recalculates FDP, DP and rest', () => {
    const duties = rosterDuties([PR_ONE_SEGMENT_DUTIES], '473006');
    const simulated = rosterInput(duties[0], 120);
    const result = evaluateDuty(simulated);

    expect(duties[0]).toMatchObject({ route: 'MNL–YVR', sectors: 1, lastFlight: 'PR116' });
    expect(simulated).toMatchObject({
      reportMinuteOfDay: 19 * 60 + 10,
      fdpMinutes: 410,
      dpMinutes: 410,
      blockMinutes: 722,
      restAfterMinutes: 3605,
    });
    expect(metric(result, 'fdp')).toMatchObject({ actualMinutes: 410, limitMinutes: 600, marginMinutes: 190 });
    expect(metric(result, 'dp')).toMatchObject({ actualMinutes: 410, limitMinutes: 960 });
    expect(metric(result, 'rest')).toMatchObject({ actualMinutes: 3605, limitMinutes: 720 });
  });

  it('keeps missing portal FDP/DP blank on the roster but calculates them locally for a delayed what-if', () => {
    const duties = rosterDuties([PR_ONE_SEGMENT_DUTIES, PR_OCTOBER_NEXT_PAIRING], '473006');
    const returnDuty = duties[1];
    const simulated = rosterInput(returnDuty, 120);
    const result = evaluateDuty(simulated);

    expect(returnDuty).toMatchObject({
      route: 'YVR–MNL',
      fdpMinutes: null,
      dpMinutes: null,
      releaseUtc: '2026-09-23T21:16:00.000Z',
    });
    expect(simulated).toMatchObject({
      reportMinuteOfDay: 23 * 60 + 5,
      fdpMinutes: 1031,
      dpMinutes: 1031,
      restAfterMinutes: 19489,
      locallyCalculatedMetrics: ['fdp', 'dp'],
    });
    expect(metric(result, 'fdp')).toMatchObject({ actualMinutes: 1031, limitMinutes: 600, marginMinutes: -431 });
    expect(result.explanation[0]).toBe('FDP and DP calculated locally from duty report to release because the portal did not publish them.');
  });

  it('adds delay to FDP/DP, preserves block, and reduces following rest through negative values', () => {
    const duties = rosterDuties([BASE_TO_BASE_ROTATION], '35459');

    expect(duties).toHaveLength(2);
    expect(duties[0]).toMatchObject({
      route: 'BKK–CNX–BKK',
      sectors: 2,
      fdpMinutes: 255,
      dpMinutes: 300,
      blockMinutes: 250,
    });
    expect(duties[1]).toMatchObject({ route: 'BKK–HKT–BKK', sectors: 2 });

    expect(rosterInput(duties[0], 0)).toMatchObject({
      fdpMinutes: 255,
      dpMinutes: 300,
      blockMinutes: 250,
      restAfterMinutes: 720,
    });
    expect(rosterInput(duties[0], 90)).toMatchObject({
      fdpMinutes: 345,
      dpMinutes: 390,
      blockMinutes: 250,
      restAfterMinutes: 630,
    });
    expect(rosterInput(duties[0], 750)).toMatchObject({
      fdpMinutes: 1005,
      dpMinutes: 1050,
      blockMinutes: 250,
      restAfterMinutes: -30,
    });
  });

  it('projects stable PR501 and PR512 segment snapshots without mutating the roster', () => {
    const [duty] = rosterDuties([PR_TWO_SEGMENT_DUTY, PR_NEXT_PAIRING], '473006');
    const timeline = cloneDutyTimeline(duty);

    expect(duty.reportAirport).toBe('MNL');
    expect(duty.segments.map(segment => [segment.flightNumber, segment.from, segment.to])).toEqual([
      ['PR501', 'MNL', 'SIN'],
      ['PR512', 'SIN', 'MNL'],
    ]);
    expect(new Set(duty.segments.map(segment => segment.id)).size).toBe(2);
    expect(timeline).not.toBe(duty);
    expect(timeline.segments[0]).not.toBe(duty.segments[0]);
  });

  it('moves PR512 by 60 minutes while preserving PR501 and portal block', () => {
    const [duty] = rosterDuties([PR_TWO_SEGMENT_DUTY, PR_NEXT_PAIRING], '473006');
    const timeline = cloneDutyTimeline(duty);
    const pr501 = timeline.segments[0];
    const pr512 = timeline.segments[1];
    const shifted = shiftLinkedTimes(timeline, pr512.id, 60, 'segment');

    expect(shifted.segments[0]).toEqual(pr501);
    expect(shifted.segments[1]).toMatchObject({
      departureUtc: '2026-09-06T13:08:00.000Z',
      arrivalUtc: '2026-09-06T16:45:00.000Z',
    });
    expect(timelineInput(shifted)).toMatchObject({
      fdpMinutes: 680,
      dpMinutes: 695,
      blockMinutes: 421,
      restAfterMinutes: 2530,
    });
  });

  it('moves following or whole-duty flight times without moving report time', () => {
    const [duty] = rosterDuties([PR_TWO_SEGMENT_DUTY, PR_NEXT_PAIRING], '473006');
    const timeline = cloneDutyTimeline(duty);
    const following = shiftLinkedTimes(timeline, timeline.segments[1].id, 47, 'following');
    const wholeDuty = shiftLinkedTimes(timeline, timeline.segments[1].id, -30, 'duty');

    expect(following.reportUtc).toBe(timeline.reportUtc);
    expect(following.segments[0]).toEqual(timeline.segments[0]);
    expect(wholeDuty.reportUtc).toBe(timeline.reportUtc);
    expect(wholeDuty.segments.map(segment => segment.departureUtc)).toEqual([
      '2026-09-06T07:02:00.000Z',
      '2026-09-06T11:38:00.000Z',
    ]);
    expect(shiftReportTime(timeline, 5).reportUtc).toBe('2026-09-06T05:30:00.000Z');
  });

  it('recalculates block when one segment arrival changes directly', () => {
    const [duty] = rosterDuties([PR_TWO_SEGMENT_DUTY, PR_NEXT_PAIRING], '473006');
    const timeline = cloneDutyTimeline(duty);
    const edited = editSegmentTimes(timeline, timeline.segments[1].id, {
      arrivalUtc: '2026-09-06T16:05:00.000Z',
    });

    expect(timelineInput(edited)).toMatchObject({
      fdpMinutes: 640,
      dpMinutes: 655,
      blockMinutes: 441,
      restAfterMinutes: 2570,
    });
  });

  it('adds and updates one CRK recovery segment with full ripple calculations', () => {
    const [duty] = rosterDuties([PR_TWO_SEGMENT_DUTY, PR_NEXT_PAIRING], '473006');
    const timeline = cloneDutyTimeline(duty);
    const pr512 = timeline.segments[1];
    const diverted = divertAndAddRecovery(timeline, pr512.id, {
      destination: 'CRK',
      divertArrivalUtc: '2026-09-06T16:20:00.000Z',
      recoveryDepartureUtc: '2026-09-06T17:05:00.000Z',
      recoveryArrivalUtc: '2026-09-06T17:50:00.000Z',
    });
    const updated = divertAndAddRecovery(diverted, pr512.id, {
      destination: 'CRK',
      divertArrivalUtc: '2026-09-06T16:20:00.000Z',
      recoveryDepartureUtc: '2026-09-06T17:10:00.000Z',
      recoveryArrivalUtc: '2026-09-06T17:55:00.000Z',
    });

    expect(diverted.segments.map(segment => [segment.flightNumber, segment.from, segment.to])).toEqual([
      ['PR501', 'MNL', 'SIN'],
      ['PR512', 'SIN', 'CRK'],
      ['PR512R', 'CRK', 'MNL'],
    ]);
    expect(timelineInput(diverted)).toMatchObject({
      sectors: 3,
      fdpMinutes: 745,
      dpMinutes: 760,
      blockMinutes: 501,
      restAfterMinutes: 2465,
    });
    expect(evaluateDuty(timelineInput(diverted)).metrics.find(item => item.key === 'fdp')).toMatchObject({
      status: 'exceeded',
      marginMinutes: -25,
    });
    expect(updated.segments).toHaveLength(3);
    expect(updated.segments[2]).toMatchObject({
      departureUtc: '2026-09-06T17:10:00.000Z',
      arrivalUtc: '2026-09-06T17:55:00.000Z',
    });
    expect(timeline.segments).toHaveLength(2);
  });
});
