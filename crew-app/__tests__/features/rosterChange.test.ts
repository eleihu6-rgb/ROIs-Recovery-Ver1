import {
  describeRosterChange,
  formatAfterDuty,
  formatDay,
  formatLegRoute,
  formatLegWindow,
  parseRosterChange,
} from '../../src/features/notifications/rosterChange';

const LEG = {
  fltNum: 'ET422',
  dep: 'ADD',
  arv: 'DMM',
  std: '2026-09-11T07:15:00.000Z',
  sta: '2026-09-11T10:00:00.000Z',
  register: 'ET-AVK',
  fleet: 'Boeing 737-800',
};

describe('parseRosterChange', () => {
  it('reads a sick-leave stand-down into a before/after pair', () => {
    const change = parseRosterChange({
      kind: 'absence',
      absenceId: 3,
      absenceType: 'sick',
      assignment: 'ILL',
      fromDate: '2026-09-11',
      toDate: '2026-09-11',
      before: [{pairingId: 151529, date: '2026-09-11', legs: [LEG]}],
      after: [{date: '2026-09-11', assignment: 'ILL', label: 'Sick leave', base: 'ADD'}],
    });

    expect(change).not.toBeNull();
    expect(change!.kind).toBe('absence');
    expect(change!.before).toHaveLength(1);
    expect(change!.before[0]!.legs[0]!.fltNum).toBe('ET422');
    expect(change!.after[0]).toEqual({
      date: '2026-09-11',
      assignment: 'ILL',
      label: 'Sick leave',
      base: 'ADD',
    });
  });

  it('returns null for an older row that carries no payload', () => {
    // Rows written before the payload existed arrive as {} — the screen must fall
    // back to the plain body text rather than render an empty comparison.
    expect(parseRosterChange({})).toBeNull();
    expect(parseRosterChange(undefined)).toBeNull();
    expect(parseRosterChange(null)).toBeNull();
    expect(parseRosterChange([])).toBeNull();
    expect(parseRosterChange('roster_change')).toBeNull();
  });

  it('returns null when there is nothing on either side of the change', () => {
    expect(parseRosterChange({kind: 'absence', before: [], after: []})).toBeNull();
  });

  it('drops malformed legs and entries instead of throwing', () => {
    const change = parseRosterChange({
      before: [
        {pairingId: 1, date: '2026-09-11', legs: [{}, null, 'ET422']},
        {pairingId: 2, date: '2026-09-12', legs: [LEG]},
        null,
      ],
      after: [{assignment: ''}, {assignment: 'ill', label: 'Sick leave'}],
    });

    expect(change!.before).toHaveLength(1);
    expect(change!.before[0]!.pairingId).toBe(2);
    // One entry is skipped (no code, no label); the other is upper-cased.
    expect(change!.after).toHaveLength(1);
    expect(change!.after[0]!.assignment).toBe('ILL');
  });
});

describe('roster-change formatting', () => {
  it('formats a local day without repeating the year', () => {
    expect(formatDay('2026-09-11')).toBe('11 Sep');
    expect(formatDay('')).toBe('');
    expect(formatDay('not-a-date')).toBe('not-a-date');
  });

  it('formats the route with only the parts the row carries', () => {
    expect(formatLegRoute(parseLeg())).toBe('ET422 · ADD → DMM');
    expect(
      formatLegRoute({...parseLeg(), fltNum: '', dep: '', arv: 'DMM'}),
    ).toBe('DMM');
  });

  it('renders a leg window in the crew display mode, in airport-local time', () => {
    // ADD is UTC+3: 07:15Z departs as 10:15 local.
    expect(formatLegWindow(parseLeg(), 'airport', 'Asia/Bangkok')).toBe('10:15L → 13:00L');
    // The same instant in UTC mode is the raw roster clock.
    expect(formatLegWindow(parseLeg(), 'utc', 'Asia/Bangkok')).toBe('07:15Z → 10:00Z');
  });

  it('falls back to the code alone when the label repeats it', () => {
    expect(formatAfterDuty({date: '2026-09-11', assignment: 'ILL', label: 'Sick leave', base: 'ADD'}))
      .toBe('ILL · Sick leave');
    expect(formatAfterDuty({date: '2026-09-11', assignment: 'X', label: 'x', base: 'ADD'}))
      .toBe('X');
  });

  it('describes the whole change in one spoken sentence', () => {
    const change = parseRosterChange({
      before: [{pairingId: 151529, date: '2026-09-11', legs: [LEG]}],
      after: [{date: '2026-09-11', assignment: 'ILL', label: 'Sick leave', base: 'ADD'}],
    })!;

    expect(describeRosterChange(change, 'airport', 'Asia/Bangkok')).toBe(
      'Before ET422 · ADD → DMM 10:15L → 13:00L. After ILL · Sick leave 11 Sep.',
    );
  });
});

/** The parsed leg the format assertions share. */
function parseLeg() {
  const change = parseRosterChange({before: [{pairingId: 1, date: '2026-09-11', legs: [LEG]}]});
  return change!.before[0]!.legs[0]!;
}
