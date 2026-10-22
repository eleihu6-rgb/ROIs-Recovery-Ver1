import { normalizeCompare } from '../../src/features/dutySwap/dutySwapApi';
import type { ApiTaskDetail } from '../../src/features/dutySwap/dutySwapModel';

const detail = (pairingId: number, dep: string, arr: string): ApiTaskDetail => ({
  taskDate: '2026-10-27T00:00:00',
  taskType: 'PAIRING',
  pairingId,
  startDateTime: '27-Oct-2026 00:00',
  endDateTime: '27-Oct-2026 07:00',
  fdp: '07:00',
  blh: '06:00',
  crd: '06:00',
  duration: 1,
  assignment: 'FLY',
  segmentDetailVoList: [{
    fltDt: '27-Oct-2026', fltNo: '960', ac: '350', dep, arr,
    std: '00:05', sta: '06:45', blh: '06:40',
  }],
});

describe('TG Duty Swap compare contract', () => {
  it('promotes Handshake table-row details so airport legs reach every match step', () => {
    const mine = detail(375245156, 'BKK', 'MEL');
    const theirs = detail(375244439, 'BKK', 'ARN');

    const result = normalizeCompare({
      mineTaskDetailList: null,
      othersTaskDetailList: null,
      mineTableRowTask: { crewId: '35459', taskDetailList: [mine] },
      otherTableRowTask: { crewId: '34098', taskDetailList: [theirs] },
    }, '35459', '34098', 'FS');

    expect(result.mineCrewId).toBe('35459');
    expect(result.othersCrewId).toBe('34098');
    expect(result.swapMode).toBe('FS');
    expect(result.mineTaskDetailList).toEqual([mine]);
    expect(result.othersTaskDetailList).toEqual([theirs]);
  });

  it('uses populated TG table-row details when empty top-level lists are present', () => {
    const mine = detail(375245156, 'BKK', 'MEL');
    const theirs = detail(375244439, 'BKK', 'ARN');

    const result = normalizeCompare({
      mineTaskDetailList: [],
      othersTaskDetailList: [],
      mineTableRowTask: { crewId: '35459', taskDetailList: [mine] },
      otherTableRowTask: { crewId: '34098', taskDetailList: [theirs] },
    }, '35459', '34098', 'FS');

    expect(result.mineTaskDetailList).toEqual([mine]);
    expect(result.othersTaskDetailList).toEqual([theirs]);
  });

  it('keeps the existing PR top-level compare lists unchanged', () => {
    const mine = detail(625688, 'MNL', 'SEA');
    const theirs = detail(625656, 'MNL', 'PEK');
    const result = normalizeCompare({
      mineCrewId: '392923', othersCrewId: '421051', swapMode: 'NS',
      mineTaskDetailList: [mine], othersTaskDetailList: [theirs],
    }, '392923', '421051', 'NS');

    expect(result.mineTaskDetailList).toEqual([mine]);
    expect(result.othersTaskDetailList).toEqual([theirs]);
  });
});
