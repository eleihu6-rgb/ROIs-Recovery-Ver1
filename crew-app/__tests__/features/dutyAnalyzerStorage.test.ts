import AsyncStorage from '@react-native-async-storage/async-storage';
import { evaluateDuty } from '../../src/features/dutyAnalyzer/dutyAnalyzerEngine';
import {
  analyzerOwner,
  deleteDutyScenario,
  loadDutyScenarios,
  saveDutyScenario,
} from '../../src/features/dutyAnalyzer/dutyAnalyzerStorage';
import type { DutyAnalyzerInput } from '../../src/features/dutyAnalyzer/dutyAnalyzerTypes';

const input: DutyAnalyzerInput = {
  crewCategory: 'flight-deck',
  acclimatisation: 'acclimatised',
  composition: 'basic',
  restFacility: null,
  reportMinuteOfDay: 420,
  sectors: 2,
  fdpMinutes: 600,
  dpMinutes: 660,
  blockMinutes: 420,
  restBeforeMinutes: 720,
  restAfterMinutes: 720,
  atHomeBase: true,
  timezoneDifferenceHours: 0,
  splitBreakMinutes: 0,
  useDiscretion: false,
};

beforeEach(async () => { await AsyncStorage.clear(); });

it('saves, reloads and deletes scenarios without mixing TG and PR crew accounts', async () => {
  const tg = analyzerOwner('TG', '35459');
  const pr = analyzerOwner('PR', '433535');
  const saved = await saveDutyScenario(tg, [], {
    name: 'TG what-if',
    kind: 'new-duty',
    sourceDuty: null,
    delayMinutes: 0,
    input,
    result: evaluateDuty(input),
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ owner: 'TG:35459', name: 'TG what-if', kind: 'new-duty' });
  expect(await loadDutyScenarios(pr)).toEqual([]);
  expect((await loadDutyScenarios(tg))[0].result.headline).toBe('Within limit · tight');
  expect(await deleteDutyScenario(tg, saved, saved[0].id)).toEqual([]);
  expect(await loadDutyScenarios(tg)).toEqual([]);
});

it('rejects a stored scenario whose embedded owner does not match the storage owner', async () => {
  const tg = analyzerOwner('TG', '35459');
  await AsyncStorage.setItem('@royce_duty_analyzer_scenarios:TG:35459', JSON.stringify([{
    id: 'bad', owner: 'PR:433535', name: 'wrong account', kind: 'new-duty', input, result: evaluateDuty(input), rulePackVersion: 'x',
  }]));
  expect(await loadDutyScenarios(tg)).toEqual([]);
});
