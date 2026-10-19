/**
 * Duty-level FDP / DP / Block / Rest from the REAL crew-portal payloads.
 *
 * The calendar (`selectPortalCalendar`) and the report/detailAll payloads are
 * separate arrays, so the parser has to match them back together. These tests
 * use the captured TG and PR fixtures (no synthetic flight rows) to prove:
 *   • TG 35459 report totals attach to every leg of a multi-leg duty,
 *   • the same flight number on different days does not cross duties,
 *   • a duty whose local report date differs from its UTC flight date matches,
 *   • a leg with no published totals stays undefined (never 0),
 *   • PR 433535 report totals attach the same way,
 *   • Rest comes from detailAll only (TG 36826 has no report capture),
 *   • the report/detail shapes are matched by flight number + date, not by value.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePortalCaptures, type PortalCapture } from '../../src/features/travel/portalCapture';

const FIX = path.resolve(__dirname, '../fixtures/roster');
const load = (file: string) => JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8'));

const capture = (source: PortalCapture['source'], url: string, file: string): PortalCapture => ({
  source,
  url,
  body: load(file),
});

const tg35459: PortalCapture[] = [
  capture('roster', 'selectPortalCalendar?crewId=35459&2026-05', 'cal_35459_2026-05.json'),
  capture('net', 'selectCrewRosterReport?crewId=35459&2026-05', 'report_35459_2026-05.json'),
];
const tg35459Legs = parsePortalCaptures(tg35459, '35459', 'TG').trips.flatMap(t => t.legs);
const tgLegsByFlt = (n: string) => tg35459Legs.filter(l => l.fltNumber === n);

const pr433535: PortalCapture[] = [
  capture('roster', 'selectPortalCalendar?crewId=433535&2026-08', 'cal_433535_2026-08.json'),
  capture('net', 'selectCrewRosterReport?crewId=433535&2026-08', 'report_433535_2026-08.json'),
];
const prLegs = parsePortalCaptures(pr433535, '433535', 'PR', {
  baseAirport: 'MNL',
  baseOffsetMin: 480,
}).trips.flatMap(t => t.legs);
const prLegsByFlt = (n: string) => prLegs.filter(l => l.fltNumber === n);

const tg36826: PortalCapture[] = [
  capture('roster', 'selectPortalCalendar?crewId=36826&2026-05', 'cal_36826_2026-05.json'),
  capture('net', 'selectPortalCalendarDetailAll?crewId=36826&2026-05', 'detailAll_36826_2026-05.json'),
];
const tg36826Legs = parsePortalCaptures(tg36826, '36826', 'TG').trips.flatMap(t => t.legs);
const tg36826LegsByFlt = (n: string) => tg36826Legs.filter(l => l.fltNumber === n);

describe('TG 35459 — report duty totals attach to trip legs', () => {
  it('applies the 2026-05-02 duty totals to BOTH legs of the multi-leg duty', () => {
    const legs = [...tgLegsByFlt('TG319'), ...tgLegsByFlt('TG320')];
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      // report_35459_2026-05.json: fdpHours 10:12, dpHours 10:12, blhHours 06:54
      expect(leg.dutyFdpMinutes).toBe(612);
      expect(leg.dutyDpMinutes).toBe(612);
      expect(leg.dutyBlockMinutes).toBe(414);
      // briefStart 2026-05-02 08:30 Bangkok (UTC+7) → 01:30 UTC.
      expect(leg.dutyReportUTC).toBe('02 May 2026 0130');
    }
  });

  it('does not cross totals between separate duties that reuse a flight number', () => {
    // TG433 flies on 07, 16 and 22 May with different published totals.
    expect(tgLegsByFlt('TG433').map(l => l.dutyFdpMinutes)).toEqual([631, 603, 628]);
    expect(tgLegsByFlt('TG433').map(l => l.dutyDpMinutes)).toEqual([631, 603, 628]);
    expect(tgLegsByFlt('TG433').map(l => l.dutyBlockMinutes)).toEqual([436, 406, 407]);
    // 06:15 Bangkok brief on each day → 23:15 UTC the previous day.
    expect(tgLegsByFlt('TG433').map(l => l.dutyReportUTC)).toEqual([
      '06 May 2026 2315',
      '15 May 2026 2315',
      '21 May 2026 2315',
    ]);
  });

  it('matches a duty whose local report date differs from its UTC flight date', () => {
    // Report: dutyDate 2026/05/13, briefTime 23:20 (HND local); calendar brief
    // 2026-05-13 21:20 Bangkok, flight start 2026-05-13 22:01 Bangkok.
    const tg661 = tgLegsByFlt('TG661')[0];
    expect(tg661).toBeTruthy();
    expect(tg661.dutyFdpMinutes).toBe(464); // 07:44
    expect(tg661.dutyDpMinutes).toBe(464);
    expect(tg661.dutyBlockMinutes).toBe(393); // 06:33
    expect(tg661.dutyReportUTC).toBe('13 May 2026 1420');
  });

  it('leaves EVERY KPI undefined when the report has no row for the leg (never 0)', () => {
    // The May calendar bleeds in TG925 on 30 Apr; report_35459_2026-05 has no
    // Apr 30 row, so there are no published totals to attach.
    const tg925 = tgLegsByFlt('TG925')[0];
    expect(tg925).toBeTruthy();
    expect(tg925.dutyFdpMinutes).toBeUndefined();
    expect(tg925.dutyDpMinutes).toBeUndefined();
    expect(tg925.dutyBlockMinutes).toBeUndefined();
    expect(tg925.dutyRestHours).toBeUndefined();
    // The report instant is still derived from the duty's briefStart.
    expect(tg925.dutyReportUTC).toBe('30 Apr 2026 1125');
  });

  it('exposes the same totals on the normalised duty list', () => {
    const { duties } = parsePortalCaptures(tg35459, '35459', 'TG');
    const duty319 = duties.find(d => d.assignment === 'FLY' && d.fltNum === '319')!;
    expect(duty319.fdpMinutes).toBe(612);
    expect(duty319.dpMinutes).toBe(612);
    expect(duty319.blockMinutes).toBe(414);
  });
});

describe('TG 36826 — detailAll carries FDP/DP/Block and Rest', () => {
  it('applies the detailAll duty totals and rest to both legs of the duty', () => {
    // detailAll_36826_2026-05.json (the only capture with rest):
    // dutyFdp 08:05, dutyDp 08:05, blockHours 02:01 + 02:11, dutyRestHours 12:00.
    const legs = [...tg36826LegsByFlt('TG415'), ...tg36826LegsByFlt('TG416')];
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      expect(leg.dutyFdpMinutes).toBe(485);
      expect(leg.dutyDpMinutes).toBe(485);
      // Block is published PER FLIGHT in detailAll → duty total is the sum.
      expect(leg.dutyBlockMinutes).toBe(252);
      expect(leg.dutyRestHours).toBe(12);
      // briefStart 2026-05-09 07:05 Bangkok → 00:05 UTC.
      expect(leg.dutyReportUTC).toBe('09 May 2026 0005');
    }
  });

  it('carries rest on the normalised duty as well', () => {
    const { duties } = parsePortalCaptures(tg36826, '36826', 'TG');
    const duty415 = duties.find(d => d.assignment === 'FLY' && d.fltNum === '415')!;
    expect(duty415.restHours).toBe(12);
    expect(duty415.blockMinutes).toBe(252);
  });
});

describe('PR 433535 — the shared schema publishes the same totals', () => {
  it('applies the 2026-08-06 duty totals to both legs of the multi-leg duty', () => {
    const legs = [...prLegsByFlt('PR426'), ...prLegsByFlt('PR425')];
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      // report_433535_2026-08.json: fdpHours 10:15, dpHours 10:45, blhHours 07:25
      expect(leg.dutyFdpMinutes).toBe(615);
      expect(leg.dutyDpMinutes).toBe(645);
      expect(leg.dutyBlockMinutes).toBe(445);
      // briefStart 2026-08-06 08:05 Manila (UTC+8) → 00:05 UTC.
      expect(leg.dutyReportUTC).toBe('06 Aug 2026 0005');
    }
  });

  it('matches a PR duty whose report date is the day before the flight', () => {
    // Report: dutyDate 2026/08/12, brief 23:10; flight departs 00:55 on 08/13.
    const pr400 = prLegsByFlt('PR400')[0];
    expect(pr400).toBeTruthy();
    expect(pr400.dutyFdpMinutes).toBe(50); // 00:50
    expect(pr400.dutyDpMinutes).toBe(50);
    expect(pr400.dutyBlockMinutes).toBe(245); // 04:05
    expect(pr400.dutyReportUTC).toBe('12 Aug 2026 1510');
  });

  it('leaves a KPI undefined when the report publishes "-"', () => {
    // PR401's report row has blhHours "-" but real FDP/DP values.
    const pr401 = prLegsByFlt('PR401')[0];
    expect(pr401.dutyFdpMinutes).toBe(310); // 05:10
    expect(pr401.dutyDpMinutes).toBe(340); // 05:40
    expect(pr401.dutyBlockMinutes).toBeUndefined();
  });

  it('does not invent rest: the PR report payload publishes no rest', () => {
    expect(prLegs.length).toBe(15);
    expect(prLegs.every(l => l.dutyRestHours === undefined)).toBe(true);
  });
});
