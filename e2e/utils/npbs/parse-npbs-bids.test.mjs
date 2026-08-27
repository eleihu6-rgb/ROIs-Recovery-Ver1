// Unit tests for the NPBS parser/mapper. Run: node --test e2e/utils/npbs/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shiftDates,
  splitRecords,
  selectContext,
  primaryGroupPredicates,
  buildCrewBids,
  selectCrew,
} from './parse-npbs-bids.mjs';
import { mapPredicate, isNoiseLine } from './mapping.mjs';

const LONG = '-'.repeat(76);
const SHORT = '-'.repeat(51);

const sampleRecord = (employeeId, category, context, prefLines) =>
  [
    LONG,
    `Seniority 5              Category ${category}          Employee #           ${employeeId}`,
    `Confirmation: 123 on 2026-02-12T13:41:53 UTC              ${context} Bid`,
    LONG,
    'Buddies:',
    '',
    'Bid Preferences:',
    `       ${SHORT}`,
    ...prefLines.map((l, i) => `   ${i + 1}.  ${l}`),
    '       Award Pairings',
    `       ${SHORT}`,
    '       Reserve Bid Group',
    '',
  ].join('\n');

test('shiftDates moves March 2026 to June 2026 (text + ISO + period)', () => {
  assert.equal(shiftDates('Prefer Off Mar 20, 2026, Mar 3, 2026'), 'Prefer Off Jun 20, 2026, Jun 3, 2026');
  assert.equal(shiftDates('on 2026-03-05 done'), 'on 2026-06-05 done');
  assert.equal(shiftDates('Period: March 2026'), 'Period: June 2026');
  assert.equal(shiftDates('Mar 9, 2026'), 'Jun 9, 2026');
});

test('isNoiseLine flags group headers/footers, keeps real predicates', () => {
  assert.ok(isNoiseLine('Pairing Bid Group'));
  assert.ok(isNoiseLine('Reserve Bid Group'));
  assert.ok(isNoiseLine('Award Pairings'));
  assert.ok(isNoiseLine('Clear Schedule and Start Next Bid Group'));
  assert.ok(!isNoiseLine('Prefer Off Jun 3, 2026'));
});

test('selectContext prefers Current over Default for the same crew', () => {
  const text = [
    sampleRecord('19', 'YYZ-737-IFD', 'Default', ['Pairing Bid Group', 'Prefer Off Weekends']),
    sampleRecord('19', 'YYZ-737-IFD', 'Current', ['Pairing Bid Group', 'Prefer Off Jun 3, 2026']),
  ].join('\n');
  const records = splitRecords(text);
  assert.equal(records.length, 2);
  const eff = selectContext(records);
  assert.equal(eff.size, 1);
  assert.equal(eff.get('19').context, 'Current');
});

test('primaryGroupPredicates returns ordered numbered lines only', () => {
  const text = sampleRecord('73', 'YYZ-737-FO', 'Current', [
    'Pairing Bid Group',
    'Avoid Pairings If Any Landing In CUN, FLL',
    'Award Pairings If Pairing Number TB5355',
  ]);
  const rec = splitRecords(text)[0];
  const preds = primaryGroupPredicates(rec.lines);
  assert.deepEqual(preds, [
    'Pairing Bid Group',
    'Avoid Pairings If Any Landing In CUN, FLL',
    'Award Pairings If Pairing Number TB5355',
  ]);
});

test('splitRecords produces identical bids for LF and CRLF exports', () => {
  const lf = sampleRecord('73', 'YYZ-737-FO', 'Current', [
    'Pairing Bid Group',
    'Prefer Off Jul 11, 2026',
    'Avoid Pairings If Any Landing In FLL, YEG',
  ]);
  const crlf = lf.replace(/\n/g, '\r\n');

  const lfCrew = buildCrewBids(splitRecords(lf)[0]);
  const crlfCrew = buildCrewBids(splitRecords(crlf)[0]);

  assert.deepEqual(crlfCrew, lfCrew);
  assert.equal(crlfCrew.properties.length, 2);
});

test('mapPredicate maps representative pairing + days-off predicates', () => {
  const land = mapPredicate('Avoid Pairings If Any Landing In CUN, FLL, YVR');
  assert.equal(land.page, 'pairing');
  assert.equal(land.propertyCode, 168);
  assert.equal(land.name, 'Airport Preference');
  assert.equal(land.action, 'avoid');
  assert.equal(land.bid.event, 'landing');
  assert.deepEqual(land.bid.locations, ['CUN', 'FLL', 'YVR']);

  const credit = mapPredicate('Award Pairings If Pairing Total Credit > 40:00');
  assert.ok(credit.skipped);
  assert.match(credit.reason, /hidden-current-catalog: Pairing Total Credit/);

  const off = mapPredicate('Prefer Off Weekends');
  assert.equal(off.page, 'days-off');
  assert.equal(off.propertyCode, 201);
  assert.equal(off.bid.mode, 'weekends');

  const sc = mapPredicate('Set Condition Short Call Type CRPM');
  assert.equal(sc.page, 'reserve');
  assert.equal(sc.propertyCode, 301);
  assert.equal(sc.bid.callType, 'CRPM');

  const mostFlying = mapPredicate('Set Condition Most Flying Hours In Least Flying Days');
  assert.equal(mostFlying.page, 'pairing');
  assert.equal(mostFlying.propertyCode, 428);
  assert.equal(mostFlying.name, 'Efficient Flying First');
  assert.deepEqual(mostFlying.bid, { type: 'efficient-flying-preference', mode: 'efficient' });

  const mostFlyingWorkingDays = mapPredicate('Set Condition Most Flying In Least Working Days');
  assert.equal(mostFlyingWorkingDays.page, 'pairing');
  assert.equal(mostFlyingWorkingDays.propertyCode, 428);
  assert.equal(mostFlyingWorkingDays.name, 'Efficient Flying First');
  assert.deepEqual(mostFlyingWorkingDays.bid, { type: 'efficient-flying-preference', mode: 'efficient' });

  const explicitEfficient = mapPredicate('Award Pairings If Efficient Flying First');
  assert.equal(explicitEfficient.page, 'pairing');
  assert.equal(explicitEfficient.action, 'award');
  assert.deepEqual(explicitEfficient.bid, { type: 'efficient-flying-preference', mode: 'efficient' });

  const explicitInefficient = mapPredicate('Award Pairings If Inefficient Flying');
  assert.equal(explicitInefficient.page, 'pairing');
  assert.equal(explicitInefficient.action, 'award');
  assert.deepEqual(explicitInefficient.bid, { type: 'efficient-flying-preference', mode: 'inefficient' });

  const ambiguousAvoid = mapPredicate('Avoid Pairings If Efficient Flying First');
  assert.ok(ambiguousAvoid.skipped);
  assert.match(ambiguousAvoid.reason, /efficient_flying_mode_ambiguous/);
});

test('mapPredicate maps legacy check-in and check-out text to unified property 103', () => {
  const checkIn = mapPredicate('Avoid Pairings If Pairing Check-In Time > 07:00');
  assert.equal(checkIn.propertyCode, 103);
  assert.deepEqual(checkIn.bid, {
    type: 'pairing-check-time',
    timeType: 'check_in',
    operator: '>',
    value: '07:00',
    dateScope: null,
  });

  const checkOut = mapPredicate('Award Pairings If Pairing Check-Out Time Between 14:00 And 22:00');
  assert.equal(checkOut.propertyCode, 103);
  assert.deepEqual(checkOut.bid, {
    type: 'pairing-check-time',
    timeType: 'check_out',
    operator: 'Between',
    from: '14:00',
    to: '22:00',
    dateScope: null,
  });
});

test('mapPredicate keeps "Mon D, YYYY" dates intact when comma-splitting', () => {
  const m = mapPredicate('Award Pairings If Departing On Jun 16, 2026, Jun 20, 2026');
  assert.ok(m.skipped);
  assert.match(m.reason, /hidden-current-catalog: Departing On/);

  const off = mapPredicate('Prefer Off Jun 3, 2026, Jun 5, 2026');
  assert.equal(off.propertyCode, 201);
  assert.deepEqual(off.bid.values, ['Jun 3, 2026', 'Jun 5, 2026']);

  // airport lists (no years) are unaffected
  const land = mapPredicate('Avoid Pairings If Any Landing In CUN, FLL, YVR');
  assert.deepEqual(land.bid.locations, ['CUN', 'FLL', 'YVR']);
});

test('mapPredicate strips Check-In Date from pairing numbers and parses date ranges', () => {
  const pn = mapPredicate('Award Pairings If Pairing Number V4105 Check-In Date Jun 2, 2026, V4110 Check-In Date Jun 3, 2026');
  assert.equal(pn.propertyCode, 102);
  assert.equal(pn.name, 'Pairing Preference');
  assert.deepEqual(pn.bid.values, ['V4105', 'V4110']);

  const range = mapPredicate('Prefer Off Jun 7, 2026 - Jun 8, 2026');
  assert.equal(range.propertyCode, 201);
  assert.equal(range.bid.mode, 'date_range');
  assert.equal(range.bid.from, 'Jun 7, 2026');
  assert.equal(range.bid.to, 'Jun 8, 2026');

  const win = mapPredicate('Prefer Off Jun 3, 2026 Between 06:00 And 18:00');
  assert.deepEqual(win.bid.values, ['Jun 3, 2026']);
  assert.deepEqual(win.bid.window, { from: '06:00', to: '18:00' });
});

test('mapPredicate splits compound If clauses (primary mapped, rest dropped)', () => {
  const m = mapPredicate('Award Pairings If Departing On Monday If Any Landing In PUJ');
  assert.ok(m.skipped); // Departing On is primary but hidden in the current catalog
  assert.match(m.reason, /hidden-current-catalog: Departing On/);
});

test('mapPredicate maps only current-catalog Days Off and Line conditions', () => {
  const longStretch = mapPredicate('Set Condition 5 Consecutive Days Off In A Row Between Jun 1, 2026 And Jun 5, 2026');
  assert.equal(longStretch.page, 'days-off');
  assert.equal(longStretch.propertyCode, 204);
  assert.equal(longStretch.name, 'Long Stretch Off / Compressed Flying');
  assert.deepEqual(longStretch.bid, {
    type: 'stepper-date-range',
    value: 5,
    from: 'Jun 1, 2026',
    to: 'Jun 5, 2026',
  });

  const commuter = mapPredicate('Set Condition Pattern Between 3 and 5 Days On, with 2 Days Off');
  assert.equal(commuter.page, 'line');
  assert.equal(commuter.propertyCode, 408);
  assert.equal(commuter.name, 'Commuter Pattern');
  assert.deepEqual(commuter.bid, {
    type: 'days-off-on-pattern',
    daysOnMin: 3,
    daysOnMax: 5,
    daysOff: 2,
  });

  const baseLayover = mapPredicate('Set Condition Minimum Base Layover 13:00');
  assert.equal(baseLayover.page, 'line');
  assert.equal(baseLayover.propertyCode, 407);
  assert.deepEqual(baseLayover.bid, { type: 'minimum-base-layover', minimumDuration: '13:00' });

  const oldLongStretch = mapPredicate('Set Condition Minimum Days Off In A Row 5');
  assert.ok(oldLongStretch.skipped);
  assert.match(oldLongStretch.reason, /needs-value: Long Stretch Off \/ Compressed Flying/);
});

test('mapPredicate skips exotic predicates with a reason', () => {
  const m = mapPredicate('Award Pairings If Any Layover On Sunday, Monday, Tuesday');
  assert.ok(m.skipped);
  assert.match(m.reason, /unmapped/);
});

test('buildCrewBids tiers predicates T1..T7 and drops beyond 7', () => {
  const preds = [
    'Pairing Bid Group', // noise -> filtered before tiering
    'Avoid Pairings If Any Landing In CUN', // T1
    'Prefer Off Weekends', // T2
    'Set Condition Short Call Type CRPM', // T3
    'Set Condition Most Flying In Least Working Days', // T4
    'Award Pairings If Pairing Length < 3 days', // T5
    'Avoid Pairings If Pairing Check-In Time > 07:00', // T6
    'Award Pairings If Any Flight Number 123, 456', // T7
    'Award Pairings If Any Leg Is Redeye', // beyond 7 -> dropped
  ];
  const rec = splitRecords(sampleRecord('96', 'YVR-737-IFD', 'Current', preds))[0];
  const crew = buildCrewBids(rec);
  assert.equal(crew.properties.length, 7);
  assert.equal(crew.properties[0].tier, 'T1');
  assert.equal(crew.properties[6].tier, 'T7');
  assert.ok(crew.dropped.some((d) => d.reason === 'beyond-tier-7'));
});

test('selectCrew honours buckets, perBucket and minProps', () => {
  const buckets = ['YVR-CA', 'YYZ-FO', 'YVR-IFD', 'YYZ-FA'];
  const recs = [];
  // 2 qualifying YVR-CA crew (>=4 mapped props), 1 under-min crew, 1 wrong bucket.
  const fourProps = [
    'Pairing Bid Group',
    'Avoid Pairings If Any Landing In CUN',
    'Prefer Off Weekends',
    'Set Condition Short Call Type CRPM',
    'Set Condition Most Flying In Least Working Days',
  ];
  recs.push(sampleRecord('1', 'YVR-737-CA', 'Current', fourProps));
  recs.push(sampleRecord('2', 'YVR-737-CA', 'Current', fourProps));
  recs.push(sampleRecord('3', 'YVR-737-CA', 'Current', ['Pairing Bid Group', 'Prefer Off Weekends'])); // 1 prop
  recs.push(sampleRecord('4', 'YYC-737-CA', 'Current', fourProps)); // wrong base
  const records = splitRecords(recs.join('\n'));
  const { selected, counts } = selectCrew(records, { buckets, perBucket: 6, minProps: 4 });
  assert.equal(selected.length, 2);
  assert.equal(counts['YVR-CA'], 2);
  assert.ok(selected.every((c) => c.properties.length >= 4));
});
