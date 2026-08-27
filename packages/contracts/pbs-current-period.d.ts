export type PbsComputedPeriodStage = "NOT_OPEN" | "OPEN" | "CLOSED" | "INCOMPLETE";

export type PbsCurrentPeriod = {
  id: number | null;
  rosterPeriodId?: number | null;
  rosterPeriodKey?: string | null;
  periodCode: string;
  filiale?: string | null;
  status?: string | null;
  computedStage: PbsComputedPeriodStage;
  bidOpenAt?: string | null;
  bidCloseAt?: string | null;
  base?: string | null;
  zoneId?: string | null;
  timezoneLabel?: string | null;
  rpStartLocal?: string | null;
  rpEndLocal?: string | null;
  canEditBid: boolean;
  readOnlyReason: string | null;
};

export type PbsRosterPeriodContext = PbsCurrentPeriod & {
  id: number;
  rosterPeriodId: number;
  rosterPeriodKey: string;
  rpStartLocal: string;
  rpEndLocal: string;
};
