// Duty Swap (Concept D) — pure model, against real PR TEST-tenant responses
// captured 2026-10-07 for crew 392923 (names anonymised).
import {
  activeFilterCount, cellLevel, cellLines, compareRows, daysBetween, detailFor, dutyRows, emptyFilters, fleetsOf,
  kpiDelta, mergeCells, parseRuleMessage, portalToIso, recordActions, recordStatusLabel, routeOf, searchQuery,
  signedHhmm, submitBody, toCrews, validateFilters,
  type ApiCompare, type ApiCrewRow, type ApiRecord,
} from '../../src/features/dutySwap/dutySwapModel';

const search: { data: ApiCrewRow[] } = require('../fixtures/dutySwap/search.json');
const cmp447841: { data: ApiCompare } = require('../fixtures/dutySwap/compare-447841.json');
const cmp421051: { data: ApiCompare } = require('../fixtures/dutySwap/compare-421051.json');
const records: { data: { records: ApiRecord[] } } = require('../fixtures/dutySwap/records-after-submit.json');

const crews = toCrews(search.data);
const me = crews[0];
const byCode = (crewId: string, code: string) => crews.find(c => c.crewId === crewId)!.duties.find(d => d.code === code)!;

describe('mergeCells — per-day/per-leg cells become whole duties', () => {
  it('returns me first, then the 6 candidate crews', () => {
    expect(crews.map(c => c.crewId)).toEqual(['392923', '402452', '421051', '423003', '435623', '447841', '450673']);
  });

  it('merges a 4-day, 2-leg pairing into one duty named by its legs', () => {
    const trip = byCode('392923', 'PR124/PR125');
    expect(trip).toMatchObject({ id: 625688, isGround: false, kind: 'fly', startDt: '2026-10-08T20:50:00', endDt: '2026-10-11T04:30:00', swappable: true });
    expect(me.duties.filter(d => d.id === 625688)).toHaveLength(1);
  });

  it('classifies standby, day off, ground and locked (Hide) duties', () => {
    expect(byCode('392923', '2HB')).toMatchObject({ kind: 'standby', swappable: true });
    expect(byCode('392923', 'XX')).toMatchObject({ kind: 'off', isGround: true });
    expect(byCode('392923', 'EXAM')).toMatchObject({ kind: 'ground', swappable: false });
    expect(byCode('421051', '1HB')).toMatchObject({ id: 674390, kind: 'standby', swappable: true });
  });
});

describe('matrix layout', () => {
  it('places a duty by its start/end within the window (rows = days)', () => {
    const pos = dutyRows(byCode('392923', 'PR124/PR125'), '2026-10-07', 27)!;
    expect(pos.top).toBeCloseTo(1 + 20.8333 / 24, 3);          // 08 Oct 20:50
    expect(pos.top + pos.span).toBeCloseTo(4 + 4.5 / 24, 3);  // 11 Oct 04:30
    expect(dutyRows(byCode('392923', 'PR124/PR125'), '2026-10-12', 5)).toBeNull();
  });

  it('builds the inclusive day list', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('progressive cell detail (compact, more info when the cell has room)', () => {
  const trip = byCode('392923', 'PR124/PR125');
  const detail = detailFor(trip, cmp447841.data.mineTaskDetailList);

  it('picks the level from the rendered size', () => {
    expect([cellLevel(16, 90), cellLevel(30, 90), cellLevel(60, 90), cellLevel(120, 90), cellLevel(120, 110)]).toEqual([0, 1, 2, 2, 3]);
  });

  it('flight cells add the route, then times + layover, then BLH/CRD + fleet', () => {
    expect(routeOf(detail)).toBe('MNL–SEA–MNL');
    expect(cellLines(trip, detail, 0)).toEqual(['PR124/PR125']);
    expect(cellLines(trip, detail, 1)).toEqual(['PR124/PR125', 'MNL–SEA–MNL']);
    expect(cellLines(trip, detail, 2)).toEqual(['PR124/PR125', 'MNL–SEA–MNL', '20:50L → 04:30L', 'LO SEA 25:35']);
    expect(cellLines(trip, detail, 3)).toEqual(['PR124/PR125', 'MNL–SEA–MNL', '20:50L → 04:30L', 'LO SEA 25:35', 'BLH 25:20 · CRD 26:20', 'Fleet 350']);
  });

  it('a flight without loaded detail falls back to times; standby shows its hours', () => {
    expect(cellLines(trip, undefined, 1)).toEqual(['PR124/PR125', '20:50–04:30']);
    expect(cellLines(byCode('421051', '1HB'), undefined, 2)).toEqual(['1HB', '00:00–11:59']);
  });
});

describe('KPI delta = what I take − what I give (matches the web)', () => {
  it('392923 PR124/PR125 ↔ 447841 PR684/PR685: FDP −06:35, BLH −05:40, Credit −06:35, DO 0', () => {
    const give = [detailFor(byCode('392923', 'PR124/PR125'), cmp447841.data.mineTaskDetailList)!];
    const take = [detailFor(crews.find(c => c.crewId === '447841')!.duties.find(d => d.id === 625779)!, cmp447841.data.othersTaskDetailList)!];
    const d = kpiDelta(give, take);
    expect([signedHhmm(d.fdp), signedHhmm(d.blh), signedHhmm(d.crd), d.dayOff]).toEqual(['-06:35', '-05:40', '-06:35', 0]);
  });

  it('fleet of each side comes from the legs (A350 vs A333 — the Basic Competency case)', () => {
    expect(fleetsOf(cmp447841.data.mineTaskDetailList.filter(t => t.pairingId === 625688))).toEqual(['350']);
    expect(fleetsOf(cmp447841.data.othersTaskDetailList.filter(t => t.pairingId === 625779))).toEqual(['333']);
  });
});

describe('search filters → portal query (every web field)', () => {
  it('omits empty fields and comma-joins lists', () => {
    const f = { ...emptyFilters('2026-10-08', '2026-10-11'), taskTypeList: ['SBY', 'FLY'], fltFleetList: ['350'], crdStart: '20', crdEnd: '30',
      briefStart: '17:00', layoverPortList: ['DOH'], filterEmptyDutyCrew: true };
    expect(searchQuery(f)).toEqual({ swapMode: 'NS', startDate: '2026-10-08', endDate: '2026-10-11', filterEmptyDutyCrew: true,
      crdStart: '20', crdEnd: '30', briefStart: '17:00', taskTypeList: 'SBY,FLY', layoverPortList: 'DOH', fltFleetList: '350' });
    expect(searchQuery(f, ['421051']).crewIdList).toBe('421051');
    expect(activeFilterCount(f)).toBe(7);
  });

  it('validates required dates, number and time formats', () => {
    const f = emptyFilters('2026-10-08', '2026-10-11');
    expect(validateFilters(f)).toBeNull();
    expect(validateFilters({ ...f, startDate: '' })).toMatch(/required/);
    expect(validateFilters({ ...f, startDate: '2026-10-12' })).toMatch(/before End/);
    expect(validateFilters({ ...f, crdStart: '10:00' })).toMatch(/CRD: whole numbers/);
    expect(validateFilters({ ...f, blhStart: '30', blhEnd: '20' })).toMatch(/BLH/);
    expect(validateFilters({ ...f, briefStart: '25:00' })).toMatch(/Report time: use HH:mm/);
  });
});

describe('legality messages', () => {
  it('parses the real Basic Competency failure', () => {
    const r = parseRuleMessage('[RuleCheck]Others\r\n08-Oct-2026~12-Oct-2026,Rule ID:8004036,Basic Competency');
    expect(r).toEqual({ soft: false, items: [{ side: 'Others', from: '08-Oct-2026', to: '12-Oct-2026', ruleId: '8004036', rule: 'Basic Competency',
      text: '08-Oct-2026~12-Oct-2026,Rule ID:8004036,Basic Competency' }] });
  });

  it('keeps plain business lines (swap hour difference) as text', () => {
    const r = parseRuleMessage("The swap hour difference (-26:20) is over the allowable limit (-10:00) – (+10:00)\r\nThe other crew member's swap hour difference (+26:20) is over the allowable limit (-10:00) – (+10:00)");
    expect(r.items.map(i => i.text)).toHaveLength(2);
    expect(r.items[0].ruleId).toBeUndefined();
  });

  it('flags CBA soft rules', () => {
    expect(parseRuleMessage('[CBA][RuleCheck]Mine\n10-Oct-2026~10-Oct-2026,Rule ID:9001,Rest').soft).toBe(true);
  });
});

describe('records', () => {
  const rec = records.data.records[0];
  it('shows statuses in crew language and offers the web actions', () => {
    expect(rec.status).toBe('Pending(OTH)');
    expect(recordStatusLabel(rec.status)).toBe('Waiting for the other crew');
    expect(recordStatusLabel('Chanced')).toBe('Changed');
    expect(recordActions(rec)).toEqual(['withdraw']);
    expect(recordActions({ status: 'Pending(ME)' })).toEqual(['accept', 'reject']);
    expect(recordActions({ status: 'Approved' })).toEqual([]);
  });
});

describe('submit body', () => {
  it('splits pairings and ground tasks per side (the body that passed legality on TST)', () => {
    const body = submitBody('392923', '402452', [byCode('392923', '2HB')], [crews[1].duties.find(d => d.id === 675704)!], 'NS', ' test ');
    expect(body).toEqual({ mineCrewId: '392923', minePairingIdList: [674428], mineRosterGroundPublishIdList: [], othersCrewId: '402452',
      othersPairingIdList: [675704], othersRosterGroundPublishIdList: [], swapMode: 'NS', comments: 'test' });
    expect(submitBody('392923', 'x', [byCode('392923', 'XX')], [], 'NS', '').mineRosterGroundPublishIdList).toEqual([2167148991503386]);
  });
});

describe('compare rows (web Pairing Info + Duty Info, aligned by date)', () => {
  it('aligns my 08–11 Oct trip with 421051 1HB (09) and 4FB (10)', () => {
    const mine = cmp421051.data.mineTaskDetailList.filter(t => t.pairingId === 625688);
    const others = cmp421051.data.othersTaskDetailList.filter(t => t.pairingId === 674390 || t.pairingId === 675736);
    const rows = compareRows(mine, others);
    // 11 Oct is inside the trip but nothing starts or flies that day: no row.
    expect(rows.map(r => r.date)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
    expect(rows[0].mine.task?.pairingId).toBe(625688);
    expect(rows[0].mine.legs.map(l => `${l.fltNo} ${l.dep}-${l.arr}`)).toEqual(['124 MNL-SEA']);
    expect(rows[1].others.task?.assignment).toBe('1HB');
    expect(rows[2].others.task?.assignment).toBe('4FB');
    expect(rows[1].mine.legs.map(l => l.fltNo)).toEqual(['125']);
  });

  it('shows only dates with a picked duty or leg, so the swap is in view without scrolling past empty days', () => {
    // Ryan's case: give PR684/PR685 (20–23 Oct) for 421051's PR100/PR101 (22–25 Oct).
    const mine = cmp421051.data.mineTaskDetailList.filter(t => t.pairingId === 625791);
    const others = cmp421051.data.othersTaskDetailList.filter(t => t.pairingId === 625769);
    const rows = compareRows(mine, others);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(!!r.mine.task || r.mine.legs.length || !!r.others.task || r.others.legs.length).toBeTruthy();
    expect(rows[0]).toMatchObject({ date: '2026-10-20', mine: { task: { pairingId: 625791 } } });
    expect(rows.find(r => r.others.task)?.date).toBe('2026-10-22');
    expect(rows.map(r => r.date)).not.toContain('2026-10-21');
    // Nothing outside the picked duties (e.g. my 08 Oct trip) appears.
    expect(rows.every(r => r.date >= '2026-10-20' && r.date <= '2026-10-25')).toBe(true);
  });

  it('parses portal dates', () => {
    expect(portalToIso('08-Oct-2026 20:50')).toBe('2026-10-08T20:50');
    expect(portalToIso('11-Oct-2026')).toBe('2026-10-11');
    expect(portalToIso('-')).toBeNull();
  });
});

describe('portal messages in crew language', () => {
  it('explains "Please publish task." (the Type filter also filters my own duties)', () => {
    const { friendlyPortalMessage } = require('../../src/features/dutySwap/dutySwapModel');
    expect(friendlyPortalMessage('Please publish task.')).toMatch(/no unlocked duties.*Type filter applies to your own duties too/);
    expect(friendlyPortalMessage('No friends were found.')).toMatch(/Switch to Target/);
    expect(friendlyPortalMessage('Other')).toBe('Other');
  });
});

describe('real data from more crews (PR TEST sweep, 2026-10-08)', () => {
  const { myTaskCode, myTaskId, publishBody, routeOf: route } = require('../../src/features/dutySwap/dutySwapModel');
  const tasks421983 = require('../fixtures/dutySwap/mytasks-421983.json').data;

  it('My duties: codes from legs (skipping the empty leg the portal returns), ids and the web publish body', () => {
    expect(tasks421983.map((t: never) => myTaskCode(t, 'PR'))).toEqual(['PR684/PR685', '1HB', '1HB', 'PR402/PR403', 'PR438/PR437']);
    expect(route(tasks421983[3])).toBe('MNL–ICN–MNL');
    const on = new Set([myTaskId(tasks421983[0]), myTaskId(tasks421983[1])]);
    expect(publishBody(tasks421983, on)).toEqual({ pairingIdList: [625785, 674376, 674380, 625662, 688654], rosterGroundPublishIdList: [],
      publishPairingIdList: [625785, 674376], publishRosterGroundPublishIdList: [] });
  });
});

describe('My duties across 8 PR crews (333/350, 321, 777; pairings and ground tasks)', () => {
  const { myTaskCode, myTaskId, publishBody, routeOf: route, portalToIso: toIso } = require('../../src/features/dutySwap/dutySwapModel');
  const sweep: Record<string, never[]> = require('../fixtures/dutySwap/mytasks-sweep.json');

  it.each(Object.keys(sweep))('crew %s: every duty gets a code, an id, a start date and a clean route', crewId => {
    const tasks: any[] = sweep[crewId];
    const ids = new Set<string>();
    for (const t of tasks) {
      const code = myTaskCode(t, 'PR');
      expect(code).toMatch(/^[A-Z0-9/]+$/);
      expect(code).not.toMatch(/null|undefined/i);
      const id = myTaskId(t);
      expect(id).toMatch(/^[PG]\d+$/);
      ids.add(id);
      expect(toIso(t.startDateTimeLocal ?? t.startDateTime)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      const r = route(t);
      if (r) expect(r).toMatch(/^[A-Z]{3}(–[A-Z]{3})*$/); // a standby (MNL→MNL) reads "MNL"
    }
    expect(ids.size).toBe(tasks.length);
    const body = publishBody(tasks, new Set([...ids].slice(0, 1)));
    expect(body.pairingIdList.length + body.rosterGroundPublishIdList.length).toBe(tasks.length);
    expect(body.publishPairingIdList.length + body.publishRosterGroundPublishIdList.length).toBe(tasks.length ? 1 : 0);
  });
});
