export declare const pbsCrewBidImportRoutes: {
  readonly dryRun: "/admin/crew-bid-imports/dry-run";
  readonly runs: "/admin/crew-bid-imports";
  readonly byRunId: (runId: string) => string;
};

export type PbsCrewBidImportPairingSelectionReference = {
  pairingId?: string | null;
  pairingNumber?: string | null;
};

export type PbsCrewBidImportPairingSelection = {
  pairingIds: string[];
  pairingLabels: string[];
  conflictingPairingIds: string[];
};

export declare const buildPbsCrewBidImportPairingSelection: (
  references: PbsCrewBidImportPairingSelectionReference[],
) => PbsCrewBidImportPairingSelection;

export type PbsCrewBidImportMode = "dry_run" | "import";
export type PbsCrewBidImportStatus = "queued" | "running" | "completed" | "completed_with_warnings" | "failed" | "rolled_back";
export type PbsCrewBidImportItemStatus = "imported" | "ready" | "skipped" | "failed";
export type PbsCrewBidImportProblemSeverity = "warning" | "error";

export type PbsCrewBidImportScope = {
  base?: string;
  categories?: string[];
  crewIds?: string[];
};

export type PbsCrewBidImportOptions = {
  importCurrentBid?: boolean;
  importDefaultAsStanding?: boolean;
  useCurrentBidWhenAvailable?: boolean;
  fallbackToDefaultBid?: boolean;
  firstPairingBidGroupOnly?: boolean;
  overwriteCurrentBid?: boolean;
  overwriteStandingBid?: boolean;
  failOnUnmatchedPairing?: boolean;
  failOnUnmatchedAirport?: boolean;
};

export type PbsCrewBidImportSourceContext = "Current" | "Default";
export type PbsCrewBidImportTargetContext = "Current" | "StandingLineholder" | "StandingReserve";

export type PbsCrewBidImportUploadFields = {
  rosterPeriodId: string;
  sourcePeriodCode?: string;
  scopeBase?: string;
  scopeCategories?: string;
  scopeCrewIds?: string;
  options?: string;
  confirm?: string | boolean;
};

export type PbsCrewBidImportServiceRequest = {
  rosterPeriodId: number;
  sourcePeriodCode?: string;
  sourceText: string;
  scope?: PbsCrewBidImportScope;
  options?: PbsCrewBidImportOptions;
  confirm?: boolean;
};

export type PbsCrewBidImportRunQuery = {
  rosterPeriodId?: number;
  limit?: number;
};

export type PbsCrewBidImportProblem = {
  crewId?: string;
  category?: string;
  bidContext?: PbsCrewBidImportSourceContext;
  targetBidContext?: PbsCrewBidImportTargetContext;
  sourceLineNumber?: number;
  sourceSeq?: number;
  severity: PbsCrewBidImportProblemSeverity;
  code: string;
  message: string;
  rawText?: string;
};

export type PbsCrewBidImportItem = {
  crewId: string;
  category: string;
  bidContext: PbsCrewBidImportSourceContext;
  targetBidContext: PbsCrewBidImportTargetContext;
  status: PbsCrewBidImportItemStatus;
  parsedPreferenceCount: number;
  importablePreferenceCount: number;
  importedPreferenceCount: number;
  skippedPreferenceCount: number;
  failedPreferenceCount: number;
  matchedPairingCount: number;
  unmatchedPairingCount: number;
  importedBidId?: number;
  message?: string;
};

export type PbsCrewBidImportSummary = {
  totalBlocks: number;
  totalCrew: number;
  selectedCrew: number;
  readyCrew: number;
  importedCrew: number;
  skippedCrew: number;
  failedCrew: number;
  parsedPreferenceCount: number;
  importablePreferenceCount: number;
  importedPreferenceCount: number;
  skippedPreferenceCount: number;
  failedPreferenceCount: number;
  matchedPairingCount: number;
  unmatchedPairingCount: number;
};

export type PbsCrewBidImportPerformancePhase =
  | "parseSource"
  | "selectBlocks"
  | "prepareItems"
  | "loadCrewContext"
  | "resolvePairings"
  | "resolveAirports"
  | "loadPropertyIdentities"
  | "writeBids"
  | "writeSnapshots"
  | "writeRunDetail"
  | "total";

export type PbsCrewBidImportPerformanceTiming = {
  phase: PbsCrewBidImportPerformancePhase;
  durationMs: number;
  detail?: Record<string, number | string | boolean>;
};

export type PbsCrewBidImportPerformance = {
  totalMs: number;
  timings: PbsCrewBidImportPerformanceTiming[];
  selectedCrew: number;
  selectedBlocks: number;
  resolverScopeCount?: number;
  pairingResolverQueryCount?: number;
  airportResolverQueryCount?: number;
  writtenBidCount?: number;
};

export type PbsCrewBidImportResponse = {
  runId?: string;
  rosterPeriodId: number;
  mode: PbsCrewBidImportMode;
  status: PbsCrewBidImportStatus;
  periodCode: string;
  sourcePeriodCode?: string;
  startedAt: string;
  completedAt?: string;
  summary: PbsCrewBidImportSummary;
  items: PbsCrewBidImportItem[];
  problems: PbsCrewBidImportProblem[];
  performance?: PbsCrewBidImportPerformance;
};

export type PbsCrewBidImportRunListItem = {
  runId: string;
  rosterPeriodId: number;
  periodCode: string;
  sourcePeriodCode?: string;
  mode: PbsCrewBidImportMode;
  status: PbsCrewBidImportStatus;
  summary: PbsCrewBidImportSummary;
  createdAt: string;
  completedAt?: string;
  createdBy: string;
};

export type PbsCrewBidImportRunListResponse = {
  runs: PbsCrewBidImportRunListItem[];
};

export type PbsCrewBidImportRunDetailResponse = PbsCrewBidImportResponse & {
  createdBy: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
};

export type PbsCrewBidImportRollbackRequest = {
  confirm: boolean;
  restorePrevious?: boolean;
};

export type PbsCrewBidImportRollbackResponse = {
  runId: string;
  status: "rolled_back";
  restoredBidCount: number;
  deletedImportedBidCount: number;
  completedAt: string;
};
