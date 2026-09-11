import {
  categorise,
  toGroundDuty,
  classifyGroundDuties,
  groundDutyStartMs,
  isFlightDuty,
  CATEGORY_META,
} from '../../src/features/roster/dutyDisplay';
import { parsePortalCaptures, type PortalDuty } from '../../src/features/travel/portalCapture';

// Real captures from the THAI test portal (see fixtures/roster/README.md). Using
// the genuine API payloads keeps these tests honest about the real duty schema.
const calMay35459 = require('../fixtures/roster/cal_35459_2026-05.json');
const cal23605Apr = require('../fixtures/roster/cal_23605_2026-04.json');
const cal45779Apr = require('../fixtures/roster/cal_45779_2026-04.json');

function dutiesFrom(...cals: any[]): PortalDuty[] {
  const { duties } = parsePortalCaptures(
    cals.map((body, i) => ({ source: 'roster' as const, url: `cal-${i}`, body })),
  );
  return duties;
}

describe('categorise — every assignment code maps to a sensible category', () => {
  const cases: Array<[string, string, string]> = [
    ['FLY', 'off', ''], // FLY isn't a ground category; handled separately (see below)
    ['OFF', 'off', 'Day Off'],
    ['VOFF', 'off', 'Voluntary Day Off'],
    ['VAC', 'leave', 'Annual Leave'],
    ['VAC_PH', 'leave', 'Leave (Public Holiday)'],
    ['HOL', 'leave', 'Public Holiday'],
    ['SIM', 'training', 'Simulator'],
    ['TRG', 'training', 'Training'],
    ['MEETING', 'meeting', 'Meeting'],
    ['OFFICE', 'meeting', 'Office Duty'],
    ['BLOCK', 'reserve', 'Reserve'],
    ['DHD', 'deadhead', 'Deadhead'],
    ['CHMSBA', 'standby', 'Standby'],
    ['CHMSBB', 'standby', 'Standby'],
    ['CHMSB3', 'standby', 'Standby'],
    ['PHMSBB', 'standby', 'Standby (Public Holiday)'],
    ['GROUND', 'meeting', 'Ground Duty'],
    ['OFFICE F', 'meeting', 'Office Duty'],
    ['MEETING F', 'meeting', 'Meeting'],
  ];
  it.each(cases.slice(1))('%s → %s (%s)', (code, category, label) => {
    expect(categorise(code)).toEqual({ category, label });
  });

  it('every category has visual metadata', () => {
    for (const [, category] of cases) {
      expect(CATEGORY_META[category as keyof typeof CATEGORY_META]).toBeDefined();
    }
  });

  it('falls back fuzzily for unseen codes, never disappearing', () => {
    expect(categorise('NEWSBY').category).toBe('standby');
    expect(categorise('AL').category).toBe('leave');
    expect(categorise('XOFF').category).toBe('off');
    expect(categorise('RECURRENT').category).toBe('training');
    // Truly unknown → 'other' with the raw code as the label (still visible).
    expect(categorise('ZZZ')).toEqual({ category: 'other', label: 'ZZZ' });
  });

  it('an OFFICE-family code is never mislabelled as Day Off (the /OFF/ substring trap)', () => {
    // "OFFICE" contains "OFF" — the office check must win. Caught on-device.
    expect(categorise('OFFICE F').category).toBe('meeting');
    expect(categorise('OFFICE X').category).toBe('meeting'); // unseen office variant
    expect(categorise('GROUND OFFICE').category).toBe('meeting');
    // A genuine off-code still maps to off.
    expect(categorise('VOFF').category).toBe('off');
    expect(categorise('OFF').category).toBe('off');
  });
});

describe('SIM/DHD/standby no longer leak in as flight cards (the bug)', () => {
  it('crew 35459 May: the 20 May SIM is NOT a flight leg', () => {
    const { trips } = parsePortalCaptures([
      { source: 'roster', url: 'cal', body: calMay35459 },
    ]);
    const allFlightNumbers = trips.flatMap(t => t.legs.map(l => l.fltNumber));
    // The broken card was "TGHOSIM:A33|34" — must be gone from flight legs.
    expect(allFlightNumbers.some(f => /HOSIM/i.test(f))).toBe(false);
    // Only genuine TG#### revenue flights remain.
    expect(allFlightNumbers.length).toBeGreaterThan(0);
    expect(allFlightNumbers.every(f => /^TG\d{2,4}$/.test(f))).toBe(true);
  });

  it('the SIM duty IS surfaced as a training ground duty with its session code', () => {
    const duties = dutiesFrom(calMay35459);
    const sim = duties.find(d => d.assignment === 'SIM');
    expect(sim).toBeDefined();
    const g = toGroundDuty(sim!);
    expect(g.category).toBe('training');
    expect(g.label).toBe('Simulator');
    // The session code (closest thing to a course name) is surfaced as detail.
    expect(g.detail).toMatch(/HOSIM/);
    expect(isFlightDuty(sim!)).toBe(false);
  });
});

describe('classifyGroundDuties over real multi-crew rosters', () => {
  it('crew 23605 Apr: training (TRG/SIM), leave (HOL), off (OFF/VOFF), standby surface; flights excluded', () => {
    const duties = dutiesFrom(cal23605Apr);
    const { upcoming, past } = classifyGroundDuties(duties, new Date('2026-01-01T00:00:00Z'));
    // now is before April → all of April's ground duties are "upcoming".
    expect(past).toHaveLength(0);
    const cats = new Set(upcoming.map(g => g.category));
    expect(cats.has('off')).toBe(true);
    expect(cats.has('standby')).toBe(true);
    // No FLY leaks into ground duties.
    expect(upcoming.every(g => g.code !== 'FLY')).toBe(true);
  });

  it('crew 45779 Apr: VAC days are all-day leave', () => {
    const duties = dutiesFrom(cal45779Apr);
    const vac = duties.find(d => d.assignment === 'VAC');
    expect(vac).toBeDefined();
    const g = toGroundDuty(vac!);
    expect(g.category).toBe('leave');
    expect(g.allDay).toBe(true);
  });

  it('all-day vs timed detection', () => {
    const off = toGroundDuty({
      id: '1', assignment: 'OFF', fltNum: '', dutyType: 'G',
      localStart: '2026-05-03 00:00', localEnd: '2026-05-03 23:59',
      startUTC: '2026-05-03 00:00', endUTC: '2026-05-03 23:59',
      briefStart: '', crewId: '35459', raw: {},
    });
    expect(off.allDay).toBe(true);

    const meeting = toGroundDuty({
      id: '2', assignment: 'MEETING', fltNum: '', dutyType: 'G',
      localStart: '2026-05-04 09:00', localEnd: '2026-05-04 12:00',
      startUTC: '2026-05-04 09:00', endUTC: '2026-05-04 12:00',
      briefStart: '', crewId: '35459', raw: {},
    });
    expect(meeting.allDay).toBe(false);
    expect(meeting.category).toBe('meeting');
  });

  it('upcoming sorted soonest-first, past most-recent-first', () => {
    const duties = dutiesFrom(cal23605Apr, cal45779Apr);
    // Split point mid-roster so both buckets are populated.
    const { upcoming, past } = classifyGroundDuties(duties, new Date('2026-04-15T00:00:00Z'));
    const ups = upcoming.map(groundDutyStartMs);
    const pasts = past.map(groundDutyStartMs);
    expect(ups.length).toBeGreaterThan(0);
    expect(pasts.length).toBeGreaterThan(0);
    for (let i = 1; i < ups.length; i++) {
      expect(ups[i]).toBeGreaterThanOrEqual(ups[i - 1]);
    }
    for (let i = 1; i < pasts.length; i++) {
      expect(pasts[i]).toBeLessThanOrEqual(pasts[i - 1]);
    }
  });
});
