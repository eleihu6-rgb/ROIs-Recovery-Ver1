import AsyncStorage from '@react-native-async-storage/async-storage';
import { DUTY_ANALYZER_RULE_PACK_VERSION, type SavedDutyScenario } from './dutyAnalyzerTypes';

export const analyzerOwner = (airline: string | null | undefined, crewId: string | null | undefined): string =>
  `${airline || 'guest'}:${crewId || 'guest'}`;

const storageKey = (owner: string): string => `@royce_duty_analyzer_scenarios:${owner}`;

const isScenario = (value: unknown, owner: string): value is SavedDutyScenario => {
  const scenario = value as SavedDutyScenario;
  const timelineValid = scenario?.timeline == null || (
    typeof scenario.timeline === 'object'
    && typeof scenario.timeline.reportUtc === 'string'
    && Array.isArray(scenario.timeline.segments)
    && scenario.timeline.segments.every(segment =>
      typeof segment?.id === 'string'
      && typeof segment?.departureUtc === 'string'
      && typeof segment?.arrivalUtc === 'string')
  );
  return !!scenario
    && scenario.owner === owner
    && typeof scenario.id === 'string'
    && typeof scenario.name === 'string'
    && (scenario.kind === 'roster-what-if' || scenario.kind === 'new-duty')
    && typeof scenario.input === 'object'
    && typeof scenario.result === 'object'
    && typeof scenario.rulePackVersion === 'string'
    && timelineValid;
};

export const loadDutyScenarios = async (owner: string): Promise<SavedDutyScenario[]> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey(owner));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(value => isScenario(value, owner)) : [];
  } catch {
    return [];
  }
};

const persist = async (owner: string, scenarios: SavedDutyScenario[]): Promise<void> => {
  await AsyncStorage.setItem(storageKey(owner), JSON.stringify(scenarios));
};

export const saveDutyScenario = async (
  owner: string,
  scenarios: SavedDutyScenario[],
  draft: Omit<SavedDutyScenario, 'id' | 'owner' | 'createdAt' | 'updatedAt' | 'rulePackVersion'> & { id?: string },
): Promise<SavedDutyScenario[]> => {
  const ownedScenarios = scenarios.filter(item => item.owner === owner);
  const now = new Date().toISOString();
  const existing = draft.id ? ownedScenarios.find(item => item.id === draft.id) : undefined;
  const saved: SavedDutyScenario = {
    ...draft,
    id: draft.id ?? `${now}-${Math.random().toString(36).slice(2, 8)}`,
    owner,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    rulePackVersion: DUTY_ANALYZER_RULE_PACK_VERSION,
  };
  const next = [saved, ...ownedScenarios.filter(item => item.id !== saved.id)];
  await persist(owner, next);
  return next;
};

export const deleteDutyScenario = async (
  owner: string,
  scenarios: SavedDutyScenario[],
  id: string,
): Promise<SavedDutyScenario[]> => {
  const next = scenarios.filter(item => item.owner === owner && item.id !== id);
  await persist(owner, next);
  return next;
};
