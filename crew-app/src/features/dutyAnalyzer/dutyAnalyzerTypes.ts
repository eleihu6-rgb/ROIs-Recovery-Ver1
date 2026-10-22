export const DUTY_ANALYZER_RULE_PACK_VERSION = '2026.10.21-1';

export type CrewCategory = 'flight-deck' | 'cabin';
export type Acclimatisation = 'acclimatised' | 'unknown';
export type CrewComposition = 'basic' | '2P' | '3P' | '4P';
export type RestFacility = 1 | 2 | 3 | null;
export type MetricStatus = 'within' | 'tight' | 'exceeded' | 'not-evaluated' | 'needs-review';

export interface DutyAnalyzerInput {
  crewCategory: CrewCategory;
  acclimatisation: Acclimatisation;
  composition: CrewComposition;
  restFacility: RestFacility;
  reportMinuteOfDay: number;
  latestChockOnMinuteOfDay?: number | null;
  sectors: number;
  fdpMinutes: number | null;
  dpMinutes: number | null;
  blockMinutes: number | null;
  restBeforeMinutes: number | null;
  restAfterMinutes: number | null;
  atHomeBase: boolean;
  timezoneDifferenceHours: number;
  splitBreakMinutes: number;
  useDiscretion: boolean;
  locallyCalculatedMetrics?: Array<'fdp' | 'dp'>;
}

export interface AnalyzerMetric {
  key: 'fdp' | 'dp' | 'block' | 'rest';
  label: string;
  actualMinutes: number | null;
  limitMinutes: number | null;
  marginMinutes: number | null;
  extendedLimitMinutes?: number | null;
  status: MetricStatus;
  detail: string;
  ruleId: string;
}

export interface DutyAnalyzerResult {
  status: MetricStatus;
  headline: string;
  metrics: AnalyzerMetric[];
  explanation: string[];
  source: string;
  rulePackVersion: string;
}

export interface AnalyzerRosterSegment {
  id: string;
  sourceSegmentId: string | null;
  kind: 'roster' | 'recovery';
  flightNumber: string;
  fleet: string;
  from: string;
  to: string;
  plannedTo: string;
  departureUtc: string;
  arrivalUtc: string;
  publishedDepartureUtc: string | null;
  publishedArrivalUtc: string | null;
  recoveryForSegmentId: string | null;
}

export interface AnalyzerPublishedDutyBaseline {
  source: 'portal';
  reportUtc: string;
  releaseUtc: string | null;
  nextReportUtc: string | null;
  finalArrivalUtc: string | null;
  sectors: number;
  fdpMinutes: number | null;
  dpMinutes: number | null;
  blockMinutes: number | null;
  restMinutes: number | null;
}

export interface AnalyzerRosterDuty {
  id: string;
  tripId: string;
  dutyIndex: number;
  route: string;
  reportAirport: string;
  reportUtc: string;
  releaseUtc: string | null;
  nextReportUtc: string | null;
  sectors: number;
  fdpMinutes: number | null;
  dpMinutes: number | null;
  blockMinutes: number | null;
  restMinutes: number | null;
  lastFlight: string;
  segments: AnalyzerRosterSegment[];
  publishedBaseline: AnalyzerPublishedDutyBaseline;
}

export interface AnalyzerDutyTimeline {
  dutyId: string;
  reportAirport: string;
  reportUtc: string;
  reportFrozen: boolean;
  nextReportUtc: string | null;
  segments: AnalyzerRosterSegment[];
  publishedBaseline: AnalyzerPublishedDutyBaseline;
}

export type TimelineShiftScope = 'segment' | 'following' | 'duty';

export interface AnalyzerSegmentTimeEdit {
  departureUtc?: string;
  arrivalUtc?: string;
}

export interface AnalyzerDiversionEdit {
  destination: string;
  divertArrivalUtc: string;
  recoveryDepartureUtc: string;
  recoveryArrivalUtc: string;
  recoveryFlightNumber?: string;
  recoveryFleet?: string;
}

export interface AnalyzerRosterPairing {
  id: string;
  route: string;
  dateLabel: string;
  duties: AnalyzerRosterDuty[];
}

export interface SavedDutyScenario {
  id: string;
  owner: string;
  name: string;
  kind: 'roster-what-if' | 'new-duty';
  createdAt: string;
  updatedAt: string;
  sourceDuty: AnalyzerRosterDuty | null;
  delayMinutes: number;
  /** Optional so delay-only scenarios saved before segment editing remain readable. */
  timeline?: AnalyzerDutyTimeline;
  input: DutyAnalyzerInput;
  result: DutyAnalyzerResult;
  rulePackVersion: string;
}
