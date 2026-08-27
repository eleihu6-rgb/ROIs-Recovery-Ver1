import type { Pool, PoolClient } from "pg";
import type {
  PbsCrewBidImportProblem,
  PbsCrewBidImportServiceRequest,
  PbsCrewBidImportResponse,
  PbsCrewBidImportRollbackResponse,
  PbsCrewBidImportRunDetailResponse,
  PbsCrewBidImportRunListResponse,
  PbsCrewBidImportRunQuery,
  PbsCrewBidImportTargetContext,
} from "../../../../packages/contracts/pbs-crew-bid-imports.js";

export type CrewBidImportActor = {
  userCode: string;
};

export type CrewBidImportServiceDependencies = {
  pgPool: Pool;
  pbsSchema: string;
  liveSchema: string;
};

export type CrewBidImportDbClient = Pick<PoolClient, "query">;

export type ParsedCrewBidPreference = {
  sourceLineNumber: number;
  sourceSeq: number;
  rawText: string;
  groupIndex: number | null;
};

export type ParsedCrewBidBlock = {
  sourceStartLine: number;
  seniority: number | null;
  category: string;
  crewId: string;
  bidContext: "Current" | "Default";
  preferences: ParsedCrewBidPreference[];
};

export type ParsedCrewBidDocument = {
  periodLabel: string | null;
  blocks: ParsedCrewBidBlock[];
};

export type CrewBidImportIssue = PbsCrewBidImportProblem;

export type CrewBidImportPairingReference = {
  pairingNumber: string;
  sourceOriginDate?: string;
  targetOriginDate?: string;
  pairingId?: string;
  occurrenceId?: string;
};

export type CrewBidImportMappedCondition = {
  propertyCode: number;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
  pairingReferences?: CrewBidImportPairingReference[];
};

export type CrewBidImportMappedPreference = {
  sourceLineNumber: number;
  sourceSeq: number;
  rawText: string;
  targetTier?: number;
  sourcePreferenceRank?: number;
  bidType: "Pairing" | "DaysOff" | "Reserve" | "Line";
  propertyCode: number;
  actionId: number | null;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
  preferenceJson: Record<string, unknown> | null;
  limitN: number | null;
  allOrNothing: number | null;
  minimumN: number | null;
  conditions: CrewBidImportMappedCondition[];
  pairingReferences: CrewBidImportPairingReference[];
  warnings: CrewBidImportIssue[];
};

export type CrewBidImportTargetContext = PbsCrewBidImportTargetContext;

export type CrewBidImportPreferenceMapResult =
  | {
      status: "importable";
      preference: CrewBidImportMappedPreference;
    }
  | {
      status: "skipped" | "failed";
      issues: CrewBidImportIssue[];
    };

export interface PbsCrewBidImportService {
  dryRun(actor: CrewBidImportActor, request: PbsCrewBidImportServiceRequest): Promise<PbsCrewBidImportResponse>;
  startImport(actor: CrewBidImportActor, request: PbsCrewBidImportServiceRequest): Promise<PbsCrewBidImportResponse>;
  importBids(actor: CrewBidImportActor, request: PbsCrewBidImportServiceRequest): Promise<PbsCrewBidImportResponse>;
  listRuns(query: PbsCrewBidImportRunQuery): Promise<PbsCrewBidImportRunListResponse>;
  getRun(runId: string): Promise<PbsCrewBidImportRunDetailResponse>;
  rollbackRun(
    actor: CrewBidImportActor,
    runId: string,
    input: { confirm: boolean; restorePrevious?: boolean },
  ): Promise<PbsCrewBidImportRollbackResponse>;
}
