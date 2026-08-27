export declare const pbsLineholderBidRoutes: {
  readonly summary: "/lineholder-bids/current/summary";
};

export type PbsLineholderSummaryStatistic = {
  tier: string;
  totalItems: number;
  pairingCount: number;
  lineCount: number;
  daysOffCount: number;
  reserveCount?: number;
  unsupportedItemCount?: number;
};

export type PbsLineholderSummaryCondition = {
  id: string;
  label: string;
  operator?: string;
  value: string;
  connector?: "AND";
};

export type PbsLineholderSummaryWarning = {
  code: "unsupportedTier" | "unsupportedProperty" | "legacyOnly";
  message: string;
  tier?: string;
};

export type PbsLineholderSummaryDiagnosticSeverity = "info" | "warning";

export type PbsLineholderSummaryDiagnosticCode =
  | "emptyTier"
  | "legacyTier"
  | "unsupportedProperty"
  | "duplicateAcrossTier"
  | "heavyTier"
  | "lightTier"
  | "restrictiveHint";

export type PbsLineholderSummaryDiagnostic = {
  id: string;
  code: PbsLineholderSummaryDiagnosticCode;
  severity: PbsLineholderSummaryDiagnosticSeverity;
  message: string;
  tier?: string;
  tiers?: string[];
  groupKey?: string;
  itemIds?: string[];
};

export type PbsLineholderSummaryItem = {
  id: string;
  groupKey?: string;
  bidType: "Pairing" | "Line" | "DaysOff" | "Reserve" | "Unsupported";
  action?: "Award" | "Avoid" | "SetCondition";
  label: string;
  bid: string;
  operator?: string;
  value?: string;
  readableText?: string;
  tiers: string[];
  conditions?: PbsLineholderSummaryCondition[];
  source?: "currentDraft" | "legacy";
  warningCode?: "unsupportedTier" | "unsupportedProperty" | "legacyOnly";
  editableSource?: {
    module: "Pairing" | "DaysOff" | "Line";
    propertyGroupKey: string;
  };
};

export type PbsLineholderCurrentSummaryResponse = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: "Current";
  statistics: PbsLineholderSummaryStatistic[];
  summaryItems: PbsLineholderSummaryItem[];
  warnings?: PbsLineholderSummaryWarning[];
  diagnostics?: PbsLineholderSummaryDiagnostic[];
};
