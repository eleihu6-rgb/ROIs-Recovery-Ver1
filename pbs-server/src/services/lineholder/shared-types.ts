import type { pbsBid } from "../../models/index.js";
import type { PbsComputedPeriodStage } from "../../../../packages/contracts/pbs-current-period.js";

export type LineholderDraftActor = {
  crewId: string;
  userCode: string;
};

export type LineholderPeriodContext = {
  rosterPeriodId: number;
  rosterPeriodKey: string;
  periodCode: string;
  filiale: string | null;
  status: string | null;
  computedStage: PbsComputedPeriodStage;
  bidOpenAt: Date | null;
  bidCloseAt: Date | null;
  base?: string | null;
  zoneId?: string | null;
  timezoneLabel?: string | null;
  rpStartLocal: string;
  rpEndLocal: string;
  canEditBid: boolean;
  readOnlyReason: string | null;
};

export type LineholderPropertyDefinition = {
  propertyCode: number;
  name: string;
};

export type LineholderPropertyIdentity = {
  propertyDefinitionId: number;
  propertyCode: number;
};

export type LineholderPropertyCatalogContext<TDefinition extends LineholderPropertyDefinition> = {
  catalog: TDefinition[];
  catalogByCode: Map<number, TDefinition>;
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>;
  recommendedPropertyCodes: number[];
  recommendedOrderByCode: Map<number, number>;
};

export type CurrentDraftReference = {
  draftKey?: string | null;
  bidId?: number | null;
  periodCode?: string | null;
  draftVersion?: number | null;
};

export type CurrentDraftIdentity = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
};

export type CurrentBidTarget = {
  draftKey: string;
  bidId: number;
  periodId: number | null;
  draftVersion: number;
  periodCode: string;
};

export type ExistingCurrentBid = Pick<
  typeof pbsBid.$inferSelect,
  "id" | "periodCode" | "rosterPeriodId" | "draftVersion" | "remarks"
>;

export type CurrentPeriodBidContext = {
  period: LineholderPeriodContext;
  existingBid: ExistingCurrentBid | null;
};

export const CURRENT_BID_CONTEXT = "Current" as const;

export class LineholderBidServiceError extends Error {
  statusCode: number;
  errorCode?: string;

  constructor(statusCode: number, message: string, errorCode?: string) {
    super(message);
    this.name = "LineholderBidServiceError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
