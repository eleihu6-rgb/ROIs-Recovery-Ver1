export type TierStatisticRow = {
  id: string;
  tier: string;
  totalItems: number;
  pairingCount: number;
  daysOffCount: number;
  lineCount: number;
  unsupportedItemCount: number;
  segments: number[];
  highlightIndex: number;
};

export type TierBidType = "Pairing" | "Line" | "DaysOff" | "Reserve" | "Unsupported";

export type TierSummaryCondition = {
  id: string;
  text: string;
};

export type TierSummaryItem = {
  id: string;
  groupKey: string;
  bidType: TierBidType;
  action?: string;
  displayTier?: string;
  label: string;
  readableText: string;
  tiers: string[];
  conditions: TierSummaryCondition[];
  warningCode?: string;
  editableSource?: {
    module: "Pairing" | "DaysOff" | "Line" | "Reserve";
    propertyGroupKey: string;
  };
  isEditable: boolean;
};

export type TierSummaryGroup = {
  tier: string;
  totalItems: number;
  items: TierSummaryItem[];
};

export type TierWarning = {
  code: string;
  message: string;
  tier?: string;
};

export type TierDiagnostic = {
  id: string;
  code: string;
  severity: "info" | "warning";
  message: string;
  tier?: string;
  tiers: string[];
  groupKey?: string;
  itemIds: string[];
};

export type TierPageData = {
  statisticsTitle: string;
  summaryTitle: string;
  diagnosticsTitle: string;
  warningsTitle: string;
  statisticsRows: TierStatisticRow[];
  summaryGroups: TierSummaryGroup[];
  legacyItems: TierSummaryItem[];
  diagnostics: TierDiagnostic[];
  warnings: TierWarning[];
};
