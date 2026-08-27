import crypto from "node:crypto";
import { performance as nodePerformance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { buildPbsCrewBidImportPairingSelection } from "../../../../packages/contracts/pbs-crew-bid-imports.js";
import type {
  PbsCrewBidImportPerformance,
  PbsCrewBidImportPerformancePhase,
  PbsCrewBidImportItem,
  PbsCrewBidImportOptions,
  PbsCrewBidImportProblem,
  PbsCrewBidImportResponse,
  PbsCrewBidImportRunDetailResponse,
  PbsCrewBidImportRunListItem,
  PbsCrewBidImportRunListResponse,
  PbsCrewBidImportRunQuery,
  PbsCrewBidImportServiceRequest,
  PbsCrewBidImportSummary,
  PbsCrewBidImportTargetContext,
} from "../../../../packages/contracts/pbs-crew-bid-imports.js";
import { buildPairingDisplayLabelExpression, buildPairingExternalLabelExpression } from "../pairing-search/pairing-display-label.js";
import { parseCrewBidTxt } from "./crew-bid-txt-parser.js";
import { mapCrewBidPreference } from "./crew-bid-property-mapper.js";
import type {
  CrewBidImportActor,
  CrewBidImportDbClient,
  CrewBidImportIssue,
  CrewBidImportMappedPreference,
  CrewBidImportPairingReference,
  CrewBidImportServiceDependencies,
  ParsedCrewBidBlock,
  ParsedCrewBidDocument,
  PbsCrewBidImportService,
} from "./types.js";

type SelectedCrewBidBlock = {
  block: ParsedCrewBidBlock;
  allBlocks: ParsedCrewBidBlock[];
  targetBidContext: PbsCrewBidImportTargetContext;
};

export type PreparedImportItem = {
  item: PbsCrewBidImportItem;
  mappedPreferences: CrewBidImportMappedPreference[];
  problems: PbsCrewBidImportProblem[];
  actorRank: string | null;
};

type ResumeImportedCrew = {
  runKey: string;
  importedBidId: number;
  importedAt: string | Date;
};

const selectedBlockKey = (
  crewId: string,
  targetBidContext: PbsCrewBidImportTargetContext,
) => `${normalizeCrewId(crewId)}:${targetBidContext}`;

type CrewBidImportExecutionContext = {
  period: CrewBidImportPeriodContext;
  options: Required<PbsCrewBidImportOptions>;
  document: ParsedCrewBidDocument;
  selectedBlocks: SelectedCrewBidBlock[];
  pendingBlocks: SelectedCrewBidBlock[];
  resumeSkippedItems: PreparedImportItem[];
  initialSummary: PbsCrewBidImportSummary;
  performanceTracker: CrewBidImportPerformanceTracker;
};

type PerformanceCounterKey =
  | "resolverScopeCount"
  | "pairingResolverQueryCount"
  | "airportResolverQueryCount"
  | "writtenBidCount";

type CrewBidImportPerformanceTracker = {
  measure: <T>(phase: PbsCrewBidImportPerformancePhase, action: () => Promise<T>, detail?: Record<string, number | string | boolean>) => Promise<T>;
  measureSync: <T>(phase: PbsCrewBidImportPerformancePhase, action: () => T, detail?: Record<string, number | string | boolean>) => T;
  increment: (counter: PerformanceCounterKey, amount?: number) => void;
  build: (input: { selectedCrew: number; selectedBlocks: number }) => PbsCrewBidImportPerformance;
};

type PropertyIdentity = {
  id: string;
  bidType: string;
  propertyName: string;
};

type PairingOccurrenceRow = {
  pairing_id: string;
  pairing_label: string;
  origin_date: string;
};

type PairingAirportOptions = {
  landingAirports: Set<string>;
  layoverAirports: Set<string>;
  workStartStations: Set<string>;
  flightNumbers: Set<string>;
};

type CrewImportContext = {
  exists: boolean;
  rank: string | null;
};

type ResolveScope = {
  key: string;
  base: string;
  rank: string | null;
};

type ImportRunRow = {
  id: string;
  run_key: string;
  mode: "dry_run" | "import";
  status: PbsCrewBidImportResponse["status"];
  period_code: string;
  roster_period_id: string;
  source_period_code: string | null;
  scope_json: unknown;
  options_json: unknown;
  total_blocks: number;
  total_crew: number;
  selected_crew: number;
  ready_crew: number;
  imported_crew: number;
  skipped_crew: number;
  failed_crew: number;
  parsed_preference_count: number;
  importable_preference_count: number;
  imported_preference_count: number;
  skipped_preference_count: number;
  failed_preference_count: number;
  matched_pairing_count: number;
  unmatched_pairing_count: number;
  started_at: string | Date;
  completed_at: string | Date | null;
  rolled_back_at: string | Date | null;
  rolled_back_by: string | null;
  performance_json: unknown;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type ImportItemRow = {
  crew_id: string;
  category: string;
  bid_context: "Current" | "Default";
  target_bid_context: PbsCrewBidImportTargetContext;
  status: PbsCrewBidImportItem["status"];
  parsed_preference_count: number;
  importable_preference_count: number;
  imported_preference_count: number;
  skipped_preference_count: number;
  failed_preference_count: number;
  matched_pairing_count: number;
  unmatched_pairing_count: number;
  imported_bid_id: string | null;
  message: string | null;
};

type ImportProblemRow = {
  crew_id: string | null;
  category: string | null;
  bid_context: "Current" | "Default" | null;
  target_bid_context: PbsCrewBidImportTargetContext | null;
  source_line_number: number | null;
  source_seq: number | null;
  severity: "warning" | "error";
  problem_code: string;
  message: string;
  raw_text: string | null;
};

type BidSnapshot = {
  bid: Record<string, unknown> | null;
  tiers: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  conditions: Record<string, unknown>[];
  daysOff: Record<string, unknown>[];
  pairingOccurrences: Record<string, unknown>[];
  favorites: Record<string, unknown>[];
};

type CrewBidImportPeriodContext = {
  rosterPeriodId: number;
  periodCode: string;
  startDate: string;
  endDate: string;
  startTimestamp: string;
  endTimestamp: string;
};

const DEFAULT_IMPORT_OPTIONS: Required<PbsCrewBidImportOptions> = {
  importCurrentBid: true,
  importDefaultAsStanding: true,
  useCurrentBidWhenAvailable: true,
  fallbackToDefaultBid: true,
  firstPairingBidGroupOnly: true,
  overwriteCurrentBid: true,
  overwriteStandingBid: true,
  failOnUnmatchedPairing: false,
  failOnUnmatchedAirport: false,
};

const IMPORT_CREATED_BY = "crew-bid-import";
const IMPORT_RUN_HEARTBEAT_MS = 15_000;
const IMPORT_RUN_STALE_SECONDS = 30 * 60;
const IMPORT_RUN_STALE_MESSAGE = "Import worker stopped updating this run for more than 30 minutes. The import was marked failed automatically.";
const MAX_IMPORT_TIERS = 7;
const IMPORT_WRITE_CONCURRENCY = 8;
const IMPORT_DETAIL_BATCH_SIZE = 1_000;
const AIRPORT_PROPERTY_ROLES = new Map<number, keyof PairingAirportOptions>([
  [165, "workStartStations"],
]);

const PERFORMANCE_PHASE_ORDER: PbsCrewBidImportPerformancePhase[] = [
  "parseSource",
  "selectBlocks",
  "loadCrewContext",
  "prepareItems",
  "resolvePairings",
  "resolveAirports",
  "loadPropertyIdentities",
  "writeBids",
  "writeSnapshots",
  "writeRunDetail",
  "total",
];

const quoteIdentifier = (identifier: string) => {
  if (!/^[a-z][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, "\"\"")}"`;
};

const normalizePeriodCode = (value: string) => value.trim().replace(/\s+/g, " ");
const createCrewBidImportServiceError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

const loadPeriodContext = async (
  client: CrewBidImportDbClient,
  liveSchema: string,
  rosterPeriodId: number,
): Promise<CrewBidImportPeriodContext> => {
  if (!Number.isSafeInteger(rosterPeriodId) || rosterPeriodId <= 0) {
    throw createCrewBidImportServiceError(400, "A valid rosterPeriodId is required.");
  }

  const result = await client.query<{
    rosterPeriodId: string;
    periodCode: string | null;
    startDate: string | null;
    endDate: string | null;
    startTimestamp: string | null;
    endTimestamp: string | null;
  }>(`
    select
      id::varchar as "rosterPeriodId",
      pbs_period_code::varchar as "periodCode",
      rp_start::date::text as "startDate",
      rp_end::date::text as "endDate",
      rp_start::text as "startTimestamp",
      rp_end::text as "endTimestamp"
    from ${liveSchema}.roster_period
    where id = $1::bigint
    limit 1
  `, [rosterPeriodId]);
  const row = result.rows[0];

  if (!row) {
    throw createCrewBidImportServiceError(404, "The selected roster period was not found.");
  }

  const periodCode = row.periodCode?.trim();
  const startDate = row.startDate?.trim();
  const endDate = row.endDate?.trim();
  const startTimestamp = row.startTimestamp?.trim();
  const endTimestamp = row.endTimestamp?.trim();

  if (!periodCode || !startDate || !endDate || !startTimestamp || !endTimestamp || startTimestamp > endTimestamp) {
    throw createCrewBidImportServiceError(409, "The selected roster period configuration is incomplete or invalid.");
  }

  return {
    rosterPeriodId: Number.parseInt(row.rosterPeriodId, 10),
    periodCode: normalizePeriodCode(periodCode),
    startDate,
    endDate,
    startTimestamp,
    endTimestamp,
  };
};
const normalizeCrewId = (value: string) => value.trim();
const normalizeRank = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() ?? "";

  return normalized.length > 0 ? normalized : null;
};
const normalizeScopeList = (values?: string[]) =>
  Array.from(new Set((values ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean)));
const isFirstGroupCandidatePreference = (preference: { rawText: string; groupIndex: number | null }) => {
  if (preference.groupIndex && preference.groupIndex > 1) {
    return false;
  }

  const rawText = preference.rawText.trim();

  return !/^(?:Pairing Bid Group|Reserve Bid Group|Award Pairings)$/i.test(rawText);
};
const hasFirstGroupCandidatePreference = (block: ParsedCrewBidBlock) =>
  block.preferences.some((preference) => isFirstGroupCandidatePreference(preference));

const toIsoString = (value: string | Date | null | undefined) => {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const computeSha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const REPORT_MESSAGE_MAX_LENGTH = 16_000;
const REPORT_MESSAGE_TRUNCATED_SUFFIX = "... [truncated]";
const normalizeReportMessage = (value: unknown, maxLength = REPORT_MESSAGE_MAX_LENGTH) => {
  if (value === null || value === undefined) {
    return null;
  }

  const message = String(value).replace(/\u0000/g, "");

  if (message.length <= maxLength) {
    return message;
  }

  const prefixLength = Math.max(maxLength - REPORT_MESSAGE_TRUNCATED_SUFFIX.length, 0);

  return `${message.slice(0, prefixLength)}${REPORT_MESSAGE_TRUNCATED_SUFFIX}`;
};
const requireReportMessage = (value: unknown, fallback: string) => normalizeReportMessage(value) ?? fallback;
const roundDurationMs = (value: number) => Math.round(value * 100) / 100;

const mergePerformanceDetail = (
  current: Record<string, number | string | boolean> | undefined,
  next: Record<string, number | string | boolean> | undefined,
) => {
  if (!next) {
    return current;
  }

  const merged = { ...(current ?? {}) };

  for (const [key, value] of Object.entries(next)) {
    const currentValue = merged[key];

    if (typeof currentValue === "number" && typeof value === "number") {
      merged[key] = currentValue + value;
    } else {
      merged[key] = value;
    }
  }

  return merged;
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const workerCount = Math.min(Math.max(concurrency, 1), values.length);
  const results: Array<{ value: R } | undefined> = new Array(values.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = { value: await worker(values[index] as T, index) };
    }
  }));

  return results.map((result, index) => {
    if (!result) {
      throw new Error(`Concurrent import worker did not return a result for item ${index + 1}.`);
    }

    return result.value;
  });
};

const createPerformanceTracker = (): CrewBidImportPerformanceTracker => {
  const startedAt = nodePerformance.now();
  const timings = new Map<PbsCrewBidImportPerformancePhase, {
    durationMs: number;
    detail?: Record<string, number | string | boolean>;
  }>();
  const counters = new Map<PerformanceCounterKey, number>();

  const record = (
    phase: PbsCrewBidImportPerformancePhase,
    durationMs: number,
    detail?: Record<string, number | string | boolean>,
  ) => {
    const previous = timings.get(phase);

    timings.set(phase, {
      durationMs: (previous?.durationMs ?? 0) + durationMs,
      detail: mergePerformanceDetail(previous?.detail, detail),
    });
  };

  return {
    async measure(phase, action, detail) {
      const start = nodePerformance.now();

      try {
        return await action();
      } finally {
        record(phase, nodePerformance.now() - start, detail);
      }
    },
    measureSync(phase, action, detail) {
      const start = nodePerformance.now();

      try {
        return action();
      } finally {
        record(phase, nodePerformance.now() - start, detail);
      }
    },
    increment(counter, amount = 1) {
      counters.set(counter, (counters.get(counter) ?? 0) + amount);
    },
    build(input) {
      const totalMs = roundDurationMs(nodePerformance.now() - startedAt);
      const timingsWithoutTotal = PERFORMANCE_PHASE_ORDER
        .filter((phase) => phase !== "total")
        .flatMap((phase) => {
          const timing = timings.get(phase);

          if (!timing) {
            return [];
          }

          return [{
            phase,
            durationMs: roundDurationMs(timing.durationMs),
            ...(timing.detail ? { detail: timing.detail } : {}),
          }];
        });

      return {
        totalMs,
        timings: [
          ...timingsWithoutTotal,
          {
            phase: "total",
            durationMs: totalMs,
          },
        ],
        selectedCrew: input.selectedCrew,
        selectedBlocks: input.selectedBlocks,
        ...(counters.has("resolverScopeCount") ? { resolverScopeCount: counters.get("resolverScopeCount") ?? 0 } : {}),
        ...(counters.has("pairingResolverQueryCount") ? { pairingResolverQueryCount: counters.get("pairingResolverQueryCount") ?? 0 } : {}),
        ...(counters.has("airportResolverQueryCount") ? { airportResolverQueryCount: counters.get("airportResolverQueryCount") ?? 0 } : {}),
        ...(counters.has("writtenBidCount") ? { writtenBidCount: counters.get("writtenBidCount") ?? 0 } : {}),
      } satisfies PbsCrewBidImportPerformance;
    },
  };
};

const mapPerformance = (value: unknown): PbsCrewBidImportPerformance | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<PbsCrewBidImportPerformance>;

  if (typeof candidate.totalMs !== "number" || !Array.isArray(candidate.timings)) {
    return undefined;
  }

  return candidate as PbsCrewBidImportPerformance;
};

const isMissingColumnError = (error: unknown) => (
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: unknown }).code === "42703"
);

const emptySummary = (): PbsCrewBidImportSummary => ({
  totalBlocks: 0,
  totalCrew: 0,
  selectedCrew: 0,
  readyCrew: 0,
  importedCrew: 0,
  skippedCrew: 0,
  failedCrew: 0,
  parsedPreferenceCount: 0,
  importablePreferenceCount: 0,
  importedPreferenceCount: 0,
  skippedPreferenceCount: 0,
  failedPreferenceCount: 0,
  matchedPairingCount: 0,
  unmatchedPairingCount: 0,
});

const buildInitialSummary = (
  document: { blocks: ParsedCrewBidBlock[] },
  selectedBlocks: SelectedCrewBidBlock[],
): PbsCrewBidImportSummary => ({
  ...emptySummary(),
  totalBlocks: document.blocks.length,
  totalCrew: new Set(document.blocks.map((block) => normalizeCrewId(block.crewId))).size,
  selectedCrew: new Set(selectedBlocks.map((selected) => normalizeCrewId(selected.block.crewId))).size,
});

const summaryFromRows = (row: ImportRunRow): PbsCrewBidImportSummary => ({
  totalBlocks: row.total_blocks,
  totalCrew: row.total_crew,
  selectedCrew: row.selected_crew,
  readyCrew: row.ready_crew,
  importedCrew: row.imported_crew,
  skippedCrew: row.skipped_crew,
  failedCrew: row.failed_crew,
  parsedPreferenceCount: row.parsed_preference_count,
  importablePreferenceCount: row.importable_preference_count,
  importedPreferenceCount: row.imported_preference_count,
  skippedPreferenceCount: row.skipped_preference_count,
  failedPreferenceCount: row.failed_preference_count,
  matchedPairingCount: row.matched_pairing_count,
  unmatchedPairingCount: row.unmatched_pairing_count,
});

const combineSummary = (
  base: Pick<PbsCrewBidImportSummary, "totalBlocks" | "totalCrew" | "selectedCrew">,
  items: PbsCrewBidImportItem[],
): PbsCrewBidImportSummary => {
  const summary = {
    ...emptySummary(),
    ...base,
  };

  const itemsByCrew = new Map<string, PbsCrewBidImportItem[]>();

  for (const item of items) {
    const crewItems = itemsByCrew.get(normalizeCrewId(item.crewId)) ?? [];
    crewItems.push(item);
    itemsByCrew.set(normalizeCrewId(item.crewId), crewItems);
    summary.parsedPreferenceCount += item.parsedPreferenceCount;
    summary.importablePreferenceCount += item.importablePreferenceCount;
    summary.importedPreferenceCount += item.importedPreferenceCount;
    summary.skippedPreferenceCount += item.skippedPreferenceCount;
    summary.failedPreferenceCount += item.failedPreferenceCount;
    summary.matchedPairingCount += item.matchedPairingCount;
    summary.unmatchedPairingCount += item.unmatchedPairingCount;
  }

  for (const crewItems of itemsByCrew.values()) {
    const statuses = new Set(crewItems.map((item) => item.status));

    if (statuses.has("failed")) {
      summary.failedCrew += 1;
    } else if (statuses.has("imported")) {
      summary.importedCrew += 1;
    } else if (statuses.has("ready")) {
      summary.readyCrew += 1;
    } else {
      summary.skippedCrew += 1;
    }
  }

  return summary;
};

const determineStatus = (
  mode: "dry_run" | "import",
  summary: PbsCrewBidImportSummary,
  problems: PbsCrewBidImportProblem[],
): PbsCrewBidImportResponse["status"] => {
  if (summary.selectedCrew > 0 && summary.failedCrew === summary.selectedCrew) {
    return "failed";
  }

  if (mode === "import" && summary.importedCrew === 0 && summary.skippedCrew === 0) {
    return "failed";
  }

  return problems.some((problem) => problem.severity === "warning" || problem.severity === "error")
    ? "completed_with_warnings"
    : "completed";
};

const normalizeOptions = (options?: PbsCrewBidImportOptions): Required<PbsCrewBidImportOptions> => {
  const input = options ?? {};

  return {
    ...DEFAULT_IMPORT_OPTIONS,
    ...input,
    importCurrentBid: input.importCurrentBid ?? input.useCurrentBidWhenAvailable ?? true,
    importDefaultAsStanding: input.importDefaultAsStanding ?? input.fallbackToDefaultBid ?? true,
  };
};

const selectCrewBlocks = (
  blocks: ParsedCrewBidBlock[],
  request: PbsCrewBidImportServiceRequest,
  options: Required<PbsCrewBidImportOptions>,
) => {
  const baseScope = request.scope?.base?.trim().toUpperCase();
  const categoryScope = normalizeScopeList(request.scope?.categories);
  const crewIdScope = normalizeScopeList(request.scope?.crewIds);
  const blocksByCrew = new Map<string, ParsedCrewBidBlock[]>();

  for (const block of blocks) {
    const normalizedCrewId = normalizeCrewId(block.crewId);
    const crewBlocks = blocksByCrew.get(normalizedCrewId);

    if (crewBlocks) {
      crewBlocks.push(block);
    } else {
      blocksByCrew.set(normalizedCrewId, [block]);
    }
  }

  const selected: SelectedCrewBidBlock[] = [];

  for (const [crewId, crewBlocks] of blocksByCrew.entries()) {
    const firstBlock = crewBlocks[0];

    if (!firstBlock) {
      continue;
    }

    const category = firstBlock.category.trim().toUpperCase();
    const categoryBase = category.split("-")[0] ?? "";

    if (baseScope && categoryBase !== baseScope) {
      continue;
    }

    if (categoryScope.length > 0 && !categoryScope.includes(category)) {
      continue;
    }

    if (crewIdScope.length > 0 && !crewIdScope.includes(crewId.toUpperCase())) {
      continue;
    }

    const currentBlock = options.importCurrentBid
      ? crewBlocks.find((block) => block.bidContext === "Current")
      : undefined;
    const defaultBlock = options.importDefaultAsStanding
      ? crewBlocks.find((block) => block.bidContext === "Default")
      : undefined;

    if (currentBlock && hasFirstGroupCandidatePreference(currentBlock)) {
      selected.push({
        block: currentBlock,
        allBlocks: crewBlocks,
        targetBidContext: "Current",
      });
    }

    if (defaultBlock && hasFirstGroupCandidatePreference(defaultBlock)) {
      selected.push(
        {
          block: defaultBlock,
          allBlocks: crewBlocks,
          targetBidContext: "StandingLineholder",
        },
        {
          block: defaultBlock,
          allBlocks: crewBlocks,
          targetBidContext: "StandingReserve",
        },
      );
    }
  }

  return selected;
};

const loadPropertyIdentities = async (
  client: CrewBidImportDbClient,
  schema: string,
) => {
  const result = await client.query<{
    property_code: number;
    id: string;
    bid_type: string;
    property_name: string;
  }>(
    `
      select property_code, id::varchar, bid_type, property_name
      from ${schema}.pbs_bid_property
      where is_active = 1
    `,
  );

  return new Map<number, PropertyIdentity>(
    result.rows.map((row) => [
      row.property_code,
      {
        id: row.id,
        bidType: row.bid_type,
        propertyName: row.property_name,
      },
    ]),
  );
};

const loadVisiblePropertyCodesByContext = async (
  client: CrewBidImportDbClient,
  schema: string,
) => {
  const result = await client.query<{
    property_code: number;
    bid_context: PbsCrewBidImportTargetContext;
  }>(
    `
      select property.property_code, context.bid_context
      from ${schema}.pbs_bid_property_context context
      join ${schema}.pbs_bid_property property
        on property.id = context.property_id
      where context.is_visible_in_portal = 1
        and property.is_active = 1
    `,
  );
  const visibleByContext = new Map<PbsCrewBidImportTargetContext, Set<number>>();

  for (const row of result.rows) {
    const visibleCodes = visibleByContext.get(row.bid_context) ?? new Set<number>();
    visibleCodes.add(row.property_code);
    visibleByContext.set(row.bid_context, visibleCodes);
  }

  return visibleByContext;
};

const applyTargetContextVisibility = (
  preparedItem: PreparedImportItem,
  visiblePropertyCodes: Set<number>,
): PreparedImportItem => {
  const hiddenPreferences = preparedItem.mappedPreferences.filter(
    (preference) => !visiblePropertyCodes.has(preference.propertyCode),
  );

  if (hiddenPreferences.length === 0) {
    return preparedItem;
  }

  const visiblePreferences = preparedItem.mappedPreferences.filter(
    (preference) => visiblePropertyCodes.has(preference.propertyCode),
  );
  const hiddenSourceKeys = new Set(hiddenPreferences.map(sourcePreferenceKey));

  return {
    ...preparedItem,
    mappedPreferences: visiblePreferences,
    problems: [
      ...preparedItem.problems,
      ...hiddenPreferences.map((preference) => ({
        crewId: preparedItem.item.crewId,
        category: preparedItem.item.category,
        bidContext: preparedItem.item.bidContext,
        targetBidContext: preparedItem.item.targetBidContext,
        sourceLineNumber: preference.sourceLineNumber,
        sourceSeq: preference.sourceSeq,
        severity: "warning" as const,
        code: preparedItem.item.targetBidContext === "Current"
          ? "hidden_current_catalog"
          : "STANDING_PROPERTY_NOT_VISIBLE",
        message: `Property ${preference.propertyCode} is not visible in ${preparedItem.item.targetBidContext}; the preference was skipped.`,
        rawText: preference.rawText,
      })),
    ],
    item: {
      ...preparedItem.item,
      importablePreferenceCount: visiblePreferences.length,
      skippedPreferenceCount: preparedItem.item.skippedPreferenceCount + hiddenSourceKeys.size,
      status: visiblePreferences.length > 0 ? preparedItem.item.status : "skipped",
      message: visiblePreferences.length > 0
        ? preparedItem.item.message
        : `No properties are visible in ${preparedItem.item.targetBidContext}; target skipped.`,
    },
  };
};

const loadCrewImportContexts = async (
  client: CrewBidImportDbClient,
  schema: string,
  crewIds: string[],
) => {
  if (crewIds.length === 0) {
    return new Map<string, CrewImportContext>();
  }

  const result = await client.query<{ crew_id: string; rank: string | null }>(
    `
      select crew_id, rank
      from ${schema}.pbs_user
      where crew_id = any($1::varchar[])
    `,
    [crewIds],
  );

  return new Map<string, CrewImportContext>(
    result.rows.map((row) => [
      normalizeCrewId(row.crew_id),
      {
        exists: true,
        rank: normalizeRank(row.rank),
      },
    ]),
  );
};

const loadResumeImportedCrew = async (
  client: CrewBidImportDbClient,
  schema: string,
  rosterPeriodId: number,
  sourceSha256: string,
  selectedBlocks: SelectedCrewBidBlock[],
) => {
  const crewIds = Array.from(new Set(selectedBlocks.map((selected) => normalizeCrewId(selected.block.crewId)).filter(Boolean)));

  if (crewIds.length === 0) {
    return new Map<string, ResumeImportedCrew>();
  }

  const result = await client.query<{
    crew_id: string;
    target_bid_context: PbsCrewBidImportTargetContext;
    run_key: string;
    imported_bid_id: string;
    imported_at: string | Date;
  }>(
    `
      select distinct on (item.crew_id, item.target_bid_context)
        item.crew_id,
        item.target_bid_context,
        run.run_key,
        item.imported_bid_id::varchar,
        coalesce(item.updated_at, item.created_at, run.completed_at, run.created_at) as imported_at
      from ${schema}.pbs_crew_bid_import_item item
      join ${schema}.pbs_crew_bid_import_run run
        on run.id = item.run_id
      join ${schema}.pbs_bid bid
        on bid.id = item.imported_bid_id
      where run.mode = 'import'
        and run.roster_period_id = $1::bigint
        and run.source_sha256 = $2::varchar
        and run.rolled_back_at is null
        and run.status <> 'rolled_back'
        and item.status = 'imported'
        and item.imported_bid_id is not null
        and item.crew_id = any($3::varchar[])
      order by item.crew_id, item.target_bid_context, run.created_at desc, item.id desc
    `,
    [rosterPeriodId, sourceSha256, crewIds],
  );

  return new Map<string, ResumeImportedCrew>(
    result.rows.map((row) => [
      selectedBlockKey(row.crew_id, row.target_bid_context),
      {
        runKey: row.run_key,
        importedBidId: Number.parseInt(row.imported_bid_id, 10),
        importedAt: row.imported_at,
      },
    ]),
  );
};

const buildResumeSkippedItems = (
  selectedBlocks: SelectedCrewBidBlock[],
  resumeImportedCrew: Map<string, ResumeImportedCrew>,
) => {
  const skippedItems: PreparedImportItem[] = [];
  const pendingBlocks: SelectedCrewBidBlock[] = [];

  for (const selected of selectedBlocks) {
    const key = selectedBlockKey(selected.block.crewId, selected.targetBidContext);
    const resumeInfo = resumeImportedCrew.get(key);

    if (!resumeInfo) {
      pendingBlocks.push(selected);
      continue;
    }

    skippedItems.push({
      item: {
        crewId: selected.block.crewId,
        category: selected.block.category,
        bidContext: selected.block.bidContext,
        targetBidContext: selected.targetBidContext,
        status: "skipped",
        parsedPreferenceCount: selected.block.preferences.length,
        importablePreferenceCount: 0,
        importedPreferenceCount: 0,
        skippedPreferenceCount: 0,
        failedPreferenceCount: 0,
        matchedPairingCount: 0,
        unmatchedPairingCount: 0,
        importedBidId: resumeInfo.importedBidId,
        message: `Already imported by previous run ${resumeInfo.runKey}; skipped for resume import.`,
      },
      mappedPreferences: [],
      problems: [],
      actorRank: null,
    });
  }

  return {
    pendingBlocks,
    skippedItems,
  };
};

const combinePreparedItemsInSelectionOrder = (
  selectedBlocks: SelectedCrewBidBlock[],
  skippedItems: PreparedImportItem[],
  pendingItems: PreparedImportItem[],
) => {
  const skippedByCrew = new Map(skippedItems.map((item) => [
    selectedBlockKey(item.item.crewId, item.item.targetBidContext),
    item,
  ]));
  const pendingByCrew = new Map(pendingItems.map((item) => [
    selectedBlockKey(item.item.crewId, item.item.targetBidContext),
    item,
  ]));

  return selectedBlocks.flatMap((selected) => {
    const key = selectedBlockKey(selected.block.crewId, selected.targetBidContext);
    const item = skippedByCrew.get(key) ?? pendingByCrew.get(key);

    return item ? [item] : [];
  });
};

const loadPairingOccurrencesByNumber = async (
  client: CrewBidImportDbClient,
  schema: string,
  options: {
    base: string;
    rank: string | null;
    period: CrewBidImportPeriodContext;
    pairingNumbers: string[];
  },
) => {
  const pairingNumbers = Array.from(new Set(options.pairingNumbers.map((value) => value.trim().toUpperCase()).filter(Boolean)));

  if (pairingNumbers.length === 0) {
    return new Map<string, PairingOccurrenceRow[]>();
  }

  const { startDate, endDate, startTimestamp, endTimestamp } = options.period;
  const pairingDisplayLabelExpression = buildPairingDisplayLabelExpression("p");
  const pairingExternalLabelExpression = buildPairingExternalLabelExpression("p");
  const params: unknown[] = [options.base, pairingNumbers, startDate, endDate, startTimestamp, endTimestamp];
  const rankFilter = options.rank
    ? `
          and exists (
            select 1
            from ${schema}.pairing_composition pc
            where pc.pairing_id = p.id
              and pc.acting_rank = $${params.push(options.rank)}::varchar
              and pc.is_deleted = 0
          )
      `
    : "";
  const result = await client.query<PairingOccurrenceRow>(
    `
      with matched_pairings as (
        select
          p.id,
          p.id::text as pairing_id,
          upper(${pairingDisplayLabelExpression}) as pairing_label,
          coalesce(
            (
              select min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))
              from ${schema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ),
            p.sch_str_dt_utc
          ) as start_utc
        from ${schema}.pairing p
        where p.is_deleted = 0
          and p.base = $1::varchar
          and upper(${pairingExternalLabelExpression}) = any($2::text[])
          and p.sch_str_dt_utc >= ($5::timestamp at time zone 'UTC')
          and p.sch_str_dt_utc <= ($6::timestamp at time zone 'UTC')
          ${rankFilter}
      )
      select
        pairing_id,
        pairing_label,
        (start_utc at time zone 'UTC')::date::text as origin_date
      from matched_pairings
      where (start_utc at time zone 'UTC')::date between $3::date and $4::date
      order by pairing_label asc, origin_date asc, pairing_id asc
    `,
    params,
  );
  const occurrencesByNumber = new Map<string, PairingOccurrenceRow[]>(
    pairingNumbers.map((pairingNumber) => [pairingNumber, []]),
  );

  for (const row of result.rows) {
    occurrencesByNumber.get(row.pairing_label)?.push(row);
  }

  return occurrencesByNumber;
};

const loadPairingAirportOptions = async (
  client: CrewBidImportDbClient,
  schema: string,
  options: {
    base: string;
    rank: string | null;
    period: CrewBidImportPeriodContext;
  },
) => {
  const { startTimestamp, endTimestamp } = options.period;
  const params: unknown[] = [options.base, startTimestamp, endTimestamp];
  const rankFilter = options.rank
    ? `
          and exists (
            select 1
            from ${schema}.pairing_composition pc
            where pc.pairing_id = p.id
              and pc.acting_rank = $${params.push(options.rank)}::varchar
              and pc.is_deleted = 0
          )
      `
    : "";
  const result = await client.query<{ role: "landing" | "layover" | "work_start" | "flight_number"; airport: string }>(
    `
      select role, airport
      from (
        select 'landing'::text as role, upper(s.arv_arp) as airport
        from ${schema}.pairing_segment s
        join ${schema}.pairing p on p.id = s.pairing_id
        where p.is_deleted = 0
          and s.is_deleted = 0
          and p.base = $1::varchar
          and p.sch_str_dt_utc >= ($2::timestamp at time zone 'UTC')
          and p.sch_str_dt_utc <= ($3::timestamp at time zone 'UTC')
          and s.arv_arp is not null
          ${rankFilter}
        group by upper(s.arv_arp)

        union all

        select 'layover'::text, upper(s.duty_end_arp)
        from ${schema}.pairing_segment s
        join ${schema}.pairing p on p.id = s.pairing_id
        where p.is_deleted = 0
          and s.is_deleted = 0
          and s.duty_layover_nits > 0
          and p.base = $1::varchar
          and p.sch_str_dt_utc >= ($2::timestamp at time zone 'UTC')
          and p.sch_str_dt_utc <= ($3::timestamp at time zone 'UTC')
          and s.duty_end_arp is not null
          ${rankFilter}
        group by upper(s.duty_end_arp)

        union all

        select 'work_start'::text, upper(first_duty.duty_str_arp)
        from (
          select distinct on (s.pairing_id)
            s.pairing_id,
            s.duty_str_arp
          from ${schema}.pairing_segment s
          join ${schema}.pairing p on p.id = s.pairing_id
          where p.is_deleted = 0
            and s.is_deleted = 0
            and p.base = $1::varchar
            and p.sch_str_dt_utc >= ($2::timestamp at time zone 'UTC')
            and p.sch_str_dt_utc <= ($3::timestamp at time zone 'UTC')
            and s.duty_str_arp is not null
            ${rankFilter}
          order by s.pairing_id, s.duty_seq, s.seg_seq
        ) first_duty
        group by upper(first_duty.duty_str_arp)

        union all

        select 'flight_number'::text, upper(btrim(s.flt_num))
        from ${schema}.pairing_segment s
        join ${schema}.pairing p on p.id = s.pairing_id
        where p.is_deleted = 0
          and s.is_deleted = 0
          and p.base = $1::varchar
          and p.sch_str_dt_utc >= ($2::timestamp at time zone 'UTC')
          and p.sch_str_dt_utc <= ($3::timestamp at time zone 'UTC')
          and upper(btrim(coalesce(s.seg_assignment, ''))) in ('FLT', 'FLY')
          and nullif(btrim(s.flt_num), '') is not null
          ${rankFilter}
        group by upper(btrim(s.flt_num))
      ) airports
      order by role, airport
    `,
    params,
  );
  const airportOptions: PairingAirportOptions = {
    landingAirports: new Set<string>(),
    layoverAirports: new Set<string>(),
    workStartStations: new Set<string>(),
    flightNumbers: new Set<string>(),
  };

  for (const row of result.rows) {
    if (row.role === "landing") {
      airportOptions.landingAirports.add(row.airport);
    } else if (row.role === "layover") {
      airportOptions.layoverAirports.add(row.airport);
    } else if (row.role === "work_start") {
      airportOptions.workStartStations.add(row.airport);
    } else {
      airportOptions.flightNumbers.add(row.airport);
    }
  }

  return airportOptions;
};

const getCategoryParts = (category: string) => category.split("-").map((part) => part.trim().toUpperCase()).filter(Boolean);

const getCategoryBase = (category: string) => getCategoryParts(category)[0] ?? "";

const getCategoryRank = (category: string) => normalizeRank(getCategoryParts(category).at(-1));

const getItemBase = (item: PreparedImportItem) => getCategoryBase(item.item.category);

const getResolveScope = (item: PreparedImportItem): ResolveScope | null => {
  const base = getItemBase(item);

  if (!base) {
    return null;
  }

  const rank = item.actorRank;

  return {
    base,
    rank,
    key: `${base}:${rank ?? ""}`,
  };
};

const collectPairingNumbers = (item: PreparedImportItem) =>
  item.mappedPreferences.flatMap((preference) => preference.pairingReferences.map((reference) => reference.pairingNumber));

const parseAirportPreferencePayload = (preference: CrewBidImportMappedPreference) => {
  if (preference.propertyCode !== 168 || preference.operator !== "Json" || !preference.paramA) {
    return null;
  }

  try {
    const parsed = JSON.parse(preference.paramA) as {
      type?: unknown;
      event?: unknown;
      locations?: unknown;
      dateScope?: unknown;
      minimumLayoverDuration?: unknown;
    };
    if (parsed.type !== "airport-preference" || !Array.isArray(parsed.locations)) return null;
    const locations = parsed.locations.flatMap((location) => {
      if (!location || typeof location !== "object") return [];
      const code = String((location as { code?: unknown }).code ?? "").trim().toUpperCase();
      const kind = (location as { kind?: unknown }).kind === "city" ? "city" : "airport";
      return code ? [{ code, kind }] : [];
    });
    return {
      event: parsed.event === "layover" ? "layover" as const : "landing" as const,
      locations,
      dateScope: parsed.dateScope ?? null,
      minimumLayoverDuration: typeof parsed.minimumLayoverDuration === "string" ? parsed.minimumLayoverDuration : null,
    };
  } catch {
    return null;
  }
};

const getAirportRole = (preference: CrewBidImportMappedPreference): keyof PairingAirportOptions | null => {
  const currentPayload = parseAirportPreferencePayload(preference);
  if (currentPayload) return currentPayload.event === "layover" ? "layoverAirports" : "landingAirports";
  return AIRPORT_PROPERTY_ROLES.get(preference.propertyCode) ?? null;
};

const collectReferencePropertyCodes = (item: PreparedImportItem) =>
  item.mappedPreferences
    .filter((preference) => getAirportRole(preference) || preference.propertyCode === 116)
    .map((preference) => preference.propertyCode);

const splitParamList = (value: string | null) =>
  Array.from(new Set((value ?? "").split(",").map((part) => part.trim().toUpperCase()).filter(Boolean)));
const sourcePreferenceKey = (preference: Pick<CrewBidImportMappedPreference, "sourceLineNumber" | "sourceSeq">) =>
  `${preference.sourceLineNumber}:${preference.sourceSeq}`;

const getAirportPropertyLabel = (propertyCode: number) => (
  propertyCode === 168
    ? "Airport Preference"
    : propertyCode === 165
        ? "Work Start Station"
      : `Airport property ${propertyCode}`
);

const isTierCandidatePreference = (preference: { rawText: string; groupIndex: number | null }) => {
  return isFirstGroupCandidatePreference(preference);
};

const expandMappedPreference = (
  preference: CrewBidImportMappedPreference,
  sourcePreferenceRank: number,
): CrewBidImportMappedPreference[] => {
  const withTier = {
    ...preference,
    targetTier: sourcePreferenceRank,
    sourcePreferenceRank,
    conditions: [],
  } satisfies CrewBidImportMappedPreference;

  if (preference.conditions.length === 0) {
    return [withTier];
  }

  const conditionPreferences = preference.conditions.map((mappedCondition) => ({
    ...preference,
    targetTier: sourcePreferenceRank,
    sourcePreferenceRank,
    propertyCode: mappedCondition.propertyCode,
    operator: mappedCondition.operator,
    paramA: mappedCondition.paramA,
    paramB: mappedCondition.paramB,
    paramC: mappedCondition.paramC,
    preferenceJson: null,
    limitN: null,
    allOrNothing: null,
    minimumN: null,
    conditions: [],
    pairingReferences: mappedCondition.pairingReferences ?? [],
    warnings: [],
  } satisfies CrewBidImportMappedPreference));

  return [withTier, ...conditionPreferences];
};

const resolvePairingReferences = (
  periodCode: string,
  item: PreparedImportItem,
  occurrencesByNumber: Map<string, PairingOccurrenceRow[]>,
  failOnUnmatchedPairing: boolean,
) => {
  if (item.mappedPreferences.length === 0) {
    return item;
  }

  const nextMappedPreferences: CrewBidImportMappedPreference[] = [];
  const problems = [...item.problems];
  let matchedPairingCount = 0;
  let unmatchedPairingCount = 0;
  let failedPreferenceCount = item.item.failedPreferenceCount;

  for (const preference of item.mappedPreferences) {
    if (preference.pairingReferences.length === 0) {
      nextMappedPreferences.push(preference);
      continue;
    }

    const resolvedReferences: CrewBidImportPairingReference[] = [];
    const unmatchedReferences: CrewBidImportPairingReference[] = [];

    for (const reference of preference.pairingReferences) {
      const occurrenceRows = occurrencesByNumber.get(reference.pairingNumber) ?? [];
      const matchedRows = reference.targetOriginDate
        ? occurrenceRows.filter((row) => row.origin_date === reference.targetOriginDate)
        : occurrenceRows;

      if (matchedRows.length === 0) {
        unmatchedReferences.push(reference);
        unmatchedPairingCount += 1;
        continue;
      }

      for (const row of matchedRows) {
        matchedPairingCount += 1;
        resolvedReferences.push({
          pairingNumber: row.pairing_label,
          sourceOriginDate: reference.sourceOriginDate,
          targetOriginDate: row.origin_date,
          pairingId: row.pairing_id,
          occurrenceId: `${row.pairing_id}:${row.origin_date}`,
        });
      }
    }

    for (const unmatchedReference of unmatchedReferences) {
      problems.push({
        crewId: item.item.crewId,
        category: item.item.category,
        bidContext: item.item.bidContext,
        sourceLineNumber: preference.sourceLineNumber,
        sourceSeq: preference.sourceSeq,
        severity: failOnUnmatchedPairing ? "error" : "warning",
        code: "unmatched_pairing_number",
        message: unmatchedReference.targetOriginDate
          ? `Pairing ${unmatchedReference.pairingNumber} on ${unmatchedReference.targetOriginDate} was not available for ${getItemBase(item)}${item.actorRank ? ` ${item.actorRank}` : ""} in target period ${periodCode}.`
          : `Pairing ${unmatchedReference.pairingNumber} was not available for ${getItemBase(item)}${item.actorRank ? ` ${item.actorRank}` : ""} in target period ${periodCode}.`,
        rawText: preference.rawText,
      });
    }

    if (resolvedReferences.length === 0 || (unmatchedReferences.length > 0 && failOnUnmatchedPairing)) {
      failedPreferenceCount += 1;
      continue;
    }

    const {
      pairingIds,
      pairingLabels,
      conflictingPairingIds,
    } = buildPbsCrewBidImportPairingSelection(resolvedReferences);

    if (conflictingPairingIds.length > 0) {
      problems.push({
        crewId: item.item.crewId,
        category: item.item.category,
        bidContext: item.item.bidContext,
        sourceLineNumber: preference.sourceLineNumber,
        sourceSeq: preference.sourceSeq,
        severity: "error",
        code: "conflicting_pairing_label",
        message: `Stable Pairing IDs resolved to conflicting Pairing Numbers: ${conflictingPairingIds.join(", ")}.`,
        rawText: preference.rawText,
      });
      failedPreferenceCount += 1;
      continue;
    }

    nextMappedPreferences.push({
      ...preference,
      operator: "Json",
      paramA: JSON.stringify({
        type: "pairing-preference",
        pairingIds,
        pairingLabels,
      }),
      paramB: null,
      paramC: null,
      pairingReferences: resolvedReferences,
    });
  }

  const removedImportableCount = item.mappedPreferences.length - nextMappedPreferences.length;

  return {
    ...item,
    mappedPreferences: nextMappedPreferences,
    problems,
    item: {
      ...item.item,
      importablePreferenceCount: Math.max(0, item.item.importablePreferenceCount - removedImportableCount),
      failedPreferenceCount,
      matchedPairingCount,
      unmatchedPairingCount,
      status: nextMappedPreferences.length > 0 ? item.item.status : "failed",
      message: nextMappedPreferences.length > 0 ? item.item.message : "No importable preferences remain after target-period Pairing Number matching.",
    },
  } satisfies PreparedImportItem;
};

const resolveAirportCriteria = (
  periodCode: string,
  item: PreparedImportItem,
  airportOptions: PairingAirportOptions | undefined,
  failOnUnmatchedAirport: boolean,
) => {
  if (item.mappedPreferences.length === 0) {
    return item;
  }

  const nextMappedPreferences: CrewBidImportMappedPreference[] = [];
  const problems = [...item.problems];
  const blockedSourcePreferenceKeys = new Set<string>();
  const failedSourcePreferenceKeys = new Set<string>();
  let failedPreferenceCount = item.item.failedPreferenceCount;

  for (const preference of item.mappedPreferences) {
    if (preference.propertyCode === 116 && preference.operator === "Json" && preference.paramA) {
      let requestedFlightNumbers: string[] = [];

      try {
        const parsed = JSON.parse(preference.paramA) as { type?: unknown; flightNumbers?: unknown };
        if (parsed.type === "flight-number-preference" && Array.isArray(parsed.flightNumbers)) {
          requestedFlightNumbers = parsed.flightNumbers
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);
        }
      } catch {
        requestedFlightNumbers = [];
      }

      const availableFlightNumbers = airportOptions?.flightNumbers ?? new Set<string>();
      const missingFlightNumbers = requestedFlightNumbers.filter((value) => !availableFlightNumbers.has(value));

      if (missingFlightNumbers.length > 0) {
        problems.push({
          crewId: item.item.crewId,
          category: item.item.category,
          bidContext: item.item.bidContext,
          sourceLineNumber: preference.sourceLineNumber,
          sourceSeq: preference.sourceSeq,
          severity: "error",
          code: "flight_number_not_in_pairing_period",
          message: `Flight Number Preference flight number(s) ${missingFlightNumbers.join(", ")} are not available for ${getItemBase(item)}${item.actorRank ? ` ${item.actorRank}` : ""} in target period ${periodCode}; the complete preference was blocked.`,
          rawText: preference.rawText,
        });
        failedPreferenceCount += 1;
        continue;
      }

      nextMappedPreferences.push(preference);
      continue;
    }

    const airportRole = getAirportRole(preference);

    if (!airportRole) {
      nextMappedPreferences.push(preference);
      continue;
    }

    const airportPayload = parseAirportPreferencePayload(preference);
    const requestedAirports = airportPayload
      ? airportPayload.locations.map((location) => location.code)
      : splitParamList(preference.paramA);

    if (requestedAirports.length === 0) {
      nextMappedPreferences.push(preference);
      continue;
    }

    const availableAirports = airportOptions?.[airportRole] ?? new Set<string>();
    const matchedAirports = requestedAirports.filter((airport) => availableAirports.has(airport));
    const missingAirports = requestedAirports.filter((airport) => !availableAirports.has(airport));

    if (missingAirports.length > 0) {
      problems.push({
        crewId: item.item.crewId,
        category: item.item.category,
        bidContext: item.item.bidContext,
        sourceLineNumber: preference.sourceLineNumber,
        sourceSeq: preference.sourceSeq,
        severity: failOnUnmatchedAirport ? "error" : "warning",
        code: "airport_not_in_pairing_period",
        message: `${getAirportPropertyLabel(preference.propertyCode)} airport(s) ${missingAirports.join(", ")} are not present in ${getItemBase(item)}${item.actorRank ? ` ${item.actorRank}` : ""} pairings for ${periodCode}; ${failOnUnmatchedAirport ? "the complete preference was blocked" : `imported value(s): ${matchedAirports.join(", ") || "none"}`}.`,
        rawText: preference.rawText,
      });
    }

    if (matchedAirports.length === 0 || (missingAirports.length > 0 && failOnUnmatchedAirport)) {
      const key = sourcePreferenceKey(preference);
      blockedSourcePreferenceKeys.add(key);

      if (!failedSourcePreferenceKeys.has(key)) {
        failedPreferenceCount += 1;
        failedSourcePreferenceKeys.add(key);
      }
      continue;
    }

    nextMappedPreferences.push(airportPayload
      ? {
          ...preference,
          paramA: JSON.stringify({
            type: "airport-preference",
            event: airportPayload.event,
            locations: airportPayload.locations.filter((location) => matchedAirports.includes(location.code)),
            dateScope: airportPayload.dateScope,
            minimumLayoverDuration: airportPayload.minimumLayoverDuration,
          }),
        }
      : { ...preference, paramA: matchedAirports.join(",") });
  }

  const filteredMappedPreferences = blockedSourcePreferenceKeys.size === 0
    ? nextMappedPreferences
    : nextMappedPreferences.filter((preference) => !blockedSourcePreferenceKeys.has(sourcePreferenceKey(preference)));
  const removedImportableCount = item.mappedPreferences.length - filteredMappedPreferences.length;

  return {
    ...item,
    mappedPreferences: filteredMappedPreferences,
    problems,
    item: {
      ...item.item,
      importablePreferenceCount: Math.max(0, item.item.importablePreferenceCount - removedImportableCount),
      failedPreferenceCount,
      status: filteredMappedPreferences.length > 0 ? item.item.status : "failed",
      message: filteredMappedPreferences.length > 0 ? item.item.message : "No importable preferences remain after target-period airport matching.",
    },
  } satisfies PreparedImportItem;
};

const ABSOLUTE_DATE_PATTERN = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/gi;
const STANDING_WEEKDAY_PATTERN = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Weekends?)\b/gi;

const buildStandingImportProblem = (
  block: ParsedCrewBidBlock,
  preference: ParsedCrewBidBlock["preferences"][number],
  targetBidContext: PbsCrewBidImportTargetContext,
  code: string,
  message: string,
): PbsCrewBidImportProblem => ({
  crewId: block.crewId,
  category: block.category,
  bidContext: block.bidContext,
  targetBidContext,
  sourceLineNumber: preference.sourceLineNumber,
  sourceSeq: preference.sourceSeq,
  severity: "warning",
  code,
  message,
  rawText: preference.rawText,
});

const sanitizeDefaultPreferenceForStanding = (
  selected: SelectedCrewBidBlock,
  preference: ParsedCrewBidBlock["preferences"][number],
): {
  preference: ParsedCrewBidBlock["preferences"][number] | null;
  problems: PbsCrewBidImportProblem[];
} => {
  if (selected.targetBidContext === "Current") {
    return { preference, problems: [] };
  }

  if (/\bPairing Number\b/i.test(preference.rawText)) {
    return {
      preference: null,
      problems: [buildStandingImportProblem(
        selected.block,
        preference,
        selected.targetBidContext,
        "STANDING_FORBIDDEN_REMAINDER_SKIPPED",
        "This Default preference was skipped because Standing Bid does not allow a specific pairing.",
      )],
    };
  }

  ABSOLUTE_DATE_PATTERN.lastIndex = 0;
  if (!ABSOLUTE_DATE_PATTERN.test(preference.rawText)) {
    return { preference, problems: [] };
  }
  ABSOLUTE_DATE_PATTERN.lastIndex = 0;

  if (/^Prefer Off\b/i.test(preference.rawText)) {
    const recurringParts = Array.from(preference.rawText.matchAll(STANDING_WEEKDAY_PATTERN))
      .map((match) => match[0])
      .filter(Boolean);

    if (recurringParts.length === 0) {
      return {
        preference: null,
        problems: [buildStandingImportProblem(
          selected.block,
          preference,
          selected.targetBidContext,
          "STANDING_DATE_ONLY_SKIPPED",
          "This Default Prefer Off preference was skipped because it only contains specific dates.",
        )],
      };
    }

    return {
      preference: {
        ...preference,
        rawText: `Prefer Off ${Array.from(new Set(recurringParts)).join(", ")}`,
      },
      problems: [buildStandingImportProblem(
        selected.block,
        preference,
        selected.targetBidContext,
        "STANDING_ABSOLUTE_DATE_REMOVED",
        "Specific dates were removed and the recurring Prefer Off condition will be imported.",
      )],
    };
  }

  const actionMatch = preference.rawText.match(/^(Award|Avoid) Pairings If\s+(.+)$/i);

  if (actionMatch) {
    const retainedClauses = (actionMatch[2] ?? "")
      .split(/\s+If\s+/i)
      .map((part) => part.replace(ABSOLUTE_DATE_PATTERN, "").replace(/\s+/g, " ").replace(/[,\s]+$/g, "").trim())
      .filter((part) => {
        if (!part) {
          return false;
        }

        return !/^(?:Departing On|Any Duty On|Every Duty On|Any Layover On|Every Layover On)(?:\s+Between|\s+And)?$/i.test(part);
      });

    if (retainedClauses.length === 0) {
      return {
        preference: null,
        problems: [buildStandingImportProblem(
          selected.block,
          preference,
          selected.targetBidContext,
          "STANDING_DATE_ONLY_SKIPPED",
          "This Default pairing preference was skipped because it only contains specific-date clauses.",
        )],
      };
    }

    return {
      preference: {
        ...preference,
        rawText: `${actionMatch[1]} Pairings If ${retainedClauses.join(" If ")}`,
      },
      problems: [buildStandingImportProblem(
        selected.block,
        preference,
        selected.targetBidContext,
        "STANDING_ABSOLUTE_DATE_REMOVED",
        "Specific dates were removed and the remaining long-term pairing condition will be imported.",
      )],
    };
  }

  return {
    preference: null,
    problems: [buildStandingImportProblem(
      selected.block,
      preference,
      selected.targetBidContext,
      "STANDING_DATE_ONLY_SKIPPED",
      "This Default preference was skipped because its specific dates could not be removed without changing the remaining condition.",
    )],
  };
};

const prepareItemFromBlock = (
  selected: SelectedCrewBidBlock,
  period: CrewBidImportPeriodContext,
  crewImportContexts: Map<string, CrewImportContext>,
) => {
  const { block, targetBidContext } = selected;
  const mappedPreferences: CrewBidImportMappedPreference[] = [];
  const problems: PbsCrewBidImportProblem[] = [];
  let skippedPreferenceCount = 0;
  let failedPreferenceCount = 0;
  let sourcePreferenceRank = 0;
  const crewContext = crewImportContexts.get(normalizeCrewId(block.crewId));
  const actorRank = crewContext?.rank ?? getCategoryRank(block.category);

  if (!crewContext?.exists) {
    problems.push({
      crewId: block.crewId,
      category: block.category,
      bidContext: block.bidContext,
      severity: "warning",
      code: "crew_not_found_in_pbs_user",
      message: "Crew id was not found in pbs_user; bid can be imported but the crew may not see it until the user projection is synced.",
    });
  }

  for (const preference of block.preferences) {
    const isTierCandidate = isTierCandidatePreference(preference);

    if (isTierCandidate) {
      sourcePreferenceRank += 1;

      if (sourcePreferenceRank > MAX_IMPORT_TIERS) {
        skippedPreferenceCount += 1;
        problems.push({
          crewId: block.crewId,
          category: block.category,
          bidContext: block.bidContext,
          sourceLineNumber: preference.sourceLineNumber,
          sourceSeq: preference.sourceSeq,
          severity: "warning",
          code: "preference_ignored_tier_capacity",
          message: `Only the first ${MAX_IMPORT_TIERS} bid preferences are imported into T1-T${MAX_IMPORT_TIERS}; this preference was ignored.`,
          rawText: preference.rawText,
        });
        continue;
      }
    }

    const sanitized = sanitizeDefaultPreferenceForStanding(selected, preference);
    problems.push(...sanitized.problems);

    if (!sanitized.preference) {
      skippedPreferenceCount += 1;
      continue;
    }

    const result = mapCrewBidPreference(
      block,
      sanitized.preference,
      period.periodCode,
      period.startDate,
      period.endDate,
    );

    if (result.status === "importable") {
      const expanded = expandMappedPreference(result.preference, Math.max(sourcePreferenceRank, 1))
        .filter((mappedPreference) => {
          if (targetBidContext === "Current") {
            return true;
          }

          return targetBidContext === "StandingReserve"
            ? mappedPreference.bidType === "Reserve"
            : mappedPreference.bidType !== "Reserve";
        });
      mappedPreferences.push(...expanded);
      problems.push(...result.preference.warnings);
      continue;
    }

    if (result.status === "skipped") {
      skippedPreferenceCount += 1;
      problems.push(...result.issues);
      continue;
    }

    failedPreferenceCount += 1;
    problems.push(...result.issues);
  }

  const item: PbsCrewBidImportItem = {
    crewId: block.crewId,
    category: block.category,
    bidContext: block.bidContext,
    targetBidContext,
    status: mappedPreferences.length > 0 ? "ready" : failedPreferenceCount > 0 ? "failed" : "skipped",
    parsedPreferenceCount: block.preferences.length,
    importablePreferenceCount: mappedPreferences.length,
    importedPreferenceCount: 0,
    skippedPreferenceCount,
    failedPreferenceCount,
    matchedPairingCount: 0,
    unmatchedPairingCount: 0,
    message: mappedPreferences.length > 0
      ? undefined
      : failedPreferenceCount > 0
        ? "No importable first-group preferences were found."
        : "No importable bid preferences were found; crew skipped.",
  };

  return {
    item,
    mappedPreferences,
    problems,
    actorRank,
  } satisfies PreparedImportItem;
};

const prepareImportItems = async (
  client: CrewBidImportDbClient,
  pbsSchema: string,
  liveSchema: string,
  selectedBlocks: SelectedCrewBidBlock[],
  period: CrewBidImportPeriodContext,
  options: Required<PbsCrewBidImportOptions>,
  performanceTracker?: CrewBidImportPerformanceTracker,
) => {
  const crewIds = selectedBlocks.map((selected) => selected.block.crewId);
  const [crewImportContexts, visiblePropertyCodesByContext] = await Promise.all([
    performanceTracker
      ? performanceTracker.measure("loadCrewContext", () => loadCrewImportContexts(client, pbsSchema, crewIds), { crewCount: crewIds.length })
      : loadCrewImportContexts(client, pbsSchema, crewIds),
    loadVisiblePropertyCodesByContext(client, pbsSchema),
  ]);
  const rawPreparedItems = performanceTracker
    ? performanceTracker.measureSync("prepareItems", () => selectedBlocks.map((selected) => prepareItemFromBlock(selected, period, crewImportContexts)), { selectedBlocks: selectedBlocks.length })
    : selectedBlocks.map((selected) => prepareItemFromBlock(selected, period, crewImportContexts));
  const preparedItems = rawPreparedItems.map((preparedItem) =>
    applyTargetContextVisibility(
      preparedItem,
      visiblePropertyCodesByContext.get(preparedItem.item.targetBidContext) ?? new Set<number>(),
    ));
  const resolveScopes = new Map<string, ResolveScope>();
  const pairingNumbersByScope = new Map<string, Set<string>>();
  const airportNeededScopeKeys = new Set<string>();

  for (const preparedItem of preparedItems) {
    const resolveScope = getResolveScope(preparedItem);

    if (!resolveScope) {
      continue;
    }

    resolveScopes.set(resolveScope.key, resolveScope);

    const pairingNumbers = collectPairingNumbers(preparedItem);

    if (pairingNumbers.length > 0) {
      const scopePairingNumbers = pairingNumbersByScope.get(resolveScope.key) ?? new Set<string>();

      for (const pairingNumber of pairingNumbers) {
        scopePairingNumbers.add(pairingNumber);
      }

      pairingNumbersByScope.set(resolveScope.key, scopePairingNumbers);
    }

    if (collectReferencePropertyCodes(preparedItem).length > 0) {
      airportNeededScopeKeys.add(resolveScope.key);
    }
  }
  performanceTracker?.increment("resolverScopeCount", resolveScopes.size);

  const pairingOccurrencesByScope = new Map<string, Map<string, PairingOccurrenceRow[]>>();

  const resolvePairingOccurrences = async () => {
    for (const [scopeKey, pairingNumbers] of pairingNumbersByScope.entries()) {
      const scope = resolveScopes.get(scopeKey);

      if (!scope) {
        continue;
      }

      performanceTracker?.increment("pairingResolverQueryCount");
      pairingOccurrencesByScope.set(scopeKey, await loadPairingOccurrencesByNumber(client, liveSchema, {
        base: scope.base,
        rank: scope.rank,
        period,
        pairingNumbers: Array.from(pairingNumbers),
      }));
    }
  };

  if (performanceTracker) {
    await performanceTracker.measure("resolvePairings", resolvePairingOccurrences, { scopeCount: pairingNumbersByScope.size });
  } else {
    await resolvePairingOccurrences();
  }

  const airportOptionsByScope = new Map<string, PairingAirportOptions>();

  const resolveAirportOptions = async () => {
    for (const scopeKey of airportNeededScopeKeys) {
      const scope = resolveScopes.get(scopeKey);

      if (!scope) {
        continue;
      }

      performanceTracker?.increment("airportResolverQueryCount");
      airportOptionsByScope.set(scopeKey, await loadPairingAirportOptions(client, liveSchema, {
        base: scope.base,
        rank: scope.rank,
        period,
      }));
    }
  };

  if (performanceTracker) {
    await performanceTracker.measure("resolveAirports", resolveAirportOptions, { scopeCount: airportNeededScopeKeys.size });
  } else {
    await resolveAirportOptions();
  }

  return preparedItems.map((preparedItem) => {
    const scopeKey = getResolveScope(preparedItem)?.key ?? "";
    const pairingResolvedItem = resolvePairingReferences(
      period.periodCode,
      preparedItem,
      pairingOccurrencesByScope.get(scopeKey) ?? new Map<string, PairingOccurrenceRow[]>(),
      options.failOnUnmatchedPairing,
    );

    return resolveAirportCriteria(
      period.periodCode,
      pairingResolvedItem,
      airportOptionsByScope.get(scopeKey),
      options.failOnUnmatchedAirport,
    );
  });
};

const readBidSnapshot = async (
  client: CrewBidImportDbClient,
  schema: string,
  bidId: string | null,
): Promise<BidSnapshot> => {
  if (!bidId) {
    return {
      bid: null,
      tiers: [],
      groups: [],
      conditions: [],
      daysOff: [],
      pairingOccurrences: [],
      favorites: [],
    };
  }

  const result = await client.query<{
    bid: Record<string, unknown> | null;
    tiers: Record<string, unknown>[];
    groups: Record<string, unknown>[];
    conditions: Record<string, unknown>[];
    days_off: Record<string, unknown>[];
    pairing_occurrences: Record<string, unknown>[];
    favorites: Record<string, unknown>[];
  }>(
    `
      select
        (select to_jsonb(t.*) from ${schema}.pbs_bid t where t.id = $1::bigint) as bid,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.tier) from ${schema}.pbs_bid_tier t where t.bid_id = $1::bigint), '[]'::jsonb) as tiers,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.group_seq) from ${schema}.pbs_bid_group t where t.bid_id = $1::bigint), '[]'::jsonb) as groups,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.group_id, t.node_seq) from ${schema}.pbs_bid_condition t where t.bid_id = $1::bigint), '[]'::jsonb) as conditions,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.tier, t.bid_date) from ${schema}.pbs_bid_day_off t where t.bid_id = $1::bigint), '[]'::jsonb) as days_off,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.tier, t.property_group_key, t.origin_date) from ${schema}.pbs_bid_pairing_occurrence t where t.bid_id = $1::bigint), '[]'::jsonb) as pairing_occurrences,
        coalesce((
          select jsonb_agg(to_jsonb(f.*))
          from (
            select 'pbs_bid_pairing_favorite' as table_name, to_jsonb(t.*) as row_data from ${schema}.pbs_bid_pairing_favorite t where t.bid_id = $1::bigint
            union all
            select 'pbs_bid_property_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_property_favorite t where t.bid_id = $1::bigint
            union all
            select 'pbs_bid_days_off_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_days_off_favorite t where t.bid_id = $1::bigint
            union all
            select 'pbs_bid_line_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_line_favorite t where t.bid_id = $1::bigint
            union all
            select 'pbs_bid_pairing_configured_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_pairing_configured_favorite t where t.bid_id = $1::bigint
          ) f
        ), '[]'::jsonb) as favorites
    `,
    [bidId],
  );
  const row = result.rows[0];

  return {
    bid: row?.bid ?? null,
    tiers: row?.tiers ?? [],
    groups: row?.groups ?? [],
    conditions: row?.conditions ?? [],
    daysOff: row?.days_off ?? [],
    pairingOccurrences: row?.pairing_occurrences ?? [],
    favorites: row?.favorites ?? [],
  };
};

const readBidSnapshots = async (
  client: CrewBidImportDbClient,
  schema: string,
  bidIds: string[],
): Promise<Map<string, BidSnapshot>> => {
  if (bidIds.length === 0) {
    return new Map();
  }

  const result = await client.query<{
    bid_id: string;
    bid: Record<string, unknown> | null;
    tiers: Record<string, unknown>[];
    groups: Record<string, unknown>[];
    conditions: Record<string, unknown>[];
    days_off: Record<string, unknown>[];
    pairing_occurrences: Record<string, unknown>[];
    favorites: Record<string, unknown>[];
  }>(
    `
      select
        source.bid_id::varchar,
        (select to_jsonb(t.*) from ${schema}.pbs_bid t where t.id = source.bid_id) as bid,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.tier) from ${schema}.pbs_bid_tier t where t.bid_id = source.bid_id), '[]'::jsonb) as tiers,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.group_seq) from ${schema}.pbs_bid_group t where t.bid_id = source.bid_id), '[]'::jsonb) as groups,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.group_id, t.node_seq) from ${schema}.pbs_bid_condition t where t.bid_id = source.bid_id), '[]'::jsonb) as conditions,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.tier, t.bid_date) from ${schema}.pbs_bid_day_off t where t.bid_id = source.bid_id), '[]'::jsonb) as days_off,
        coalesce((select jsonb_agg(to_jsonb(t.*) order by t.tier, t.property_group_key, t.origin_date) from ${schema}.pbs_bid_pairing_occurrence t where t.bid_id = source.bid_id), '[]'::jsonb) as pairing_occurrences,
        coalesce((
          select jsonb_agg(to_jsonb(f.*))
          from (
            select 'pbs_bid_pairing_favorite' as table_name, to_jsonb(t.*) as row_data from ${schema}.pbs_bid_pairing_favorite t where t.bid_id = source.bid_id
            union all
            select 'pbs_bid_property_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_property_favorite t where t.bid_id = source.bid_id
            union all
            select 'pbs_bid_days_off_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_days_off_favorite t where t.bid_id = source.bid_id
            union all
            select 'pbs_bid_line_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_line_favorite t where t.bid_id = source.bid_id
            union all
            select 'pbs_bid_pairing_configured_favorite', to_jsonb(t.*) from ${schema}.pbs_bid_pairing_configured_favorite t where t.bid_id = source.bid_id
          ) f
        ), '[]'::jsonb) as favorites
      from unnest($1::bigint[]) as source(bid_id)
      order by source.bid_id
    `,
    [bidIds],
  );

  return new Map(result.rows.map((row) => [
    row.bid_id,
    {
      bid: row.bid,
      tiers: row.tiers,
      groups: row.groups,
      conditions: row.conditions,
      daysOff: row.days_off,
      pairingOccurrences: row.pairing_occurrences,
      favorites: row.favorites,
    },
  ]));
};

const snapshotAuditRows = (snapshot: BidSnapshot): Record<string, unknown>[] => {
  const favorites = snapshot.favorites.flatMap((favorite) => {
    const rowData = favorite.row_data;

    return rowData && typeof rowData === "object"
      ? [rowData as Record<string, unknown>]
      : [favorite];
  });

  return [
    ...(snapshot.bid ? [snapshot.bid] : []),
    ...snapshot.tiers,
    ...snapshot.groups,
    ...snapshot.conditions,
    ...snapshot.daysOff,
    ...snapshot.pairingOccurrences,
    ...favorites,
  ];
};

const assertLegacyImportedSnapshotUnchanged = (
  snapshot: BidSnapshot,
  runKey: string,
  completedAt: string | Date | null,
) => {
  if (!snapshot.bid) {
    throw new Error("Crew bid import rollback stopped because an imported bid is missing.");
  }

  if (snapshot.bid.remarks !== `crew-bid-import:${runKey}`) {
    throw new Error("Crew bid import rollback stopped because an imported bid marker changed.");
  }

  const completedAtMs = completedAt ? new Date(completedAt).getTime() : Number.NaN;

  if (!Number.isFinite(completedAtMs)) {
    throw new Error("Crew bid import rollback stopped because the legacy run has no valid completion time.");
  }

  for (const row of snapshotAuditRows(snapshot)) {
    const updatedAtMs = new Date(String(row.updated_at ?? "")).getTime();

    if (
      row.created_by !== IMPORT_CREATED_BY
      || row.updated_by !== IMPORT_CREATED_BY
      || !Number.isFinite(updatedAtMs)
      || updatedAtMs > completedAtMs
    ) {
      throw new Error("Crew bid import rollback stopped because imported bid data changed after the run.");
    }
  }
};

const assertImportedSnapshotUnchanged = (
  currentSnapshot: BidSnapshot,
  importedSnapshot: BidSnapshot | null,
  runKey: string,
  completedAt: string | Date | null,
) => {
  if (importedSnapshot) {
    if (!isDeepStrictEqual(currentSnapshot, importedSnapshot)) {
      throw new Error("Crew bid import rollback stopped because imported bid data no longer matches its backup.");
    }

    return;
  }

  assertLegacyImportedSnapshotUnchanged(currentSnapshot, runKey, completedAt);
};

const deleteBids = async (
  client: CrewBidImportDbClient,
  schema: string,
  bidIds: string[],
) => {
  if (bidIds.length === 0) {
    return;
  }

  await client.query(
    `
      with
      deleted_pairing_occurrence as (delete from ${schema}.pbs_bid_pairing_occurrence where bid_id = any($1::bigint[]) returning 1),
      deleted_condition as (delete from ${schema}.pbs_bid_condition where bid_id = any($1::bigint[]) returning 1),
      deleted_group as (delete from ${schema}.pbs_bid_group where bid_id = any($1::bigint[]) returning 1),
      deleted_day_off as (delete from ${schema}.pbs_bid_day_off where bid_id = any($1::bigint[]) returning 1),
      deleted_pairing_favorite as (delete from ${schema}.pbs_bid_pairing_favorite where bid_id = any($1::bigint[]) returning 1),
      deleted_property_favorite as (delete from ${schema}.pbs_bid_property_favorite where bid_id = any($1::bigint[]) returning 1),
      deleted_days_off_favorite as (delete from ${schema}.pbs_bid_days_off_favorite where bid_id = any($1::bigint[]) returning 1),
      deleted_line_favorite as (delete from ${schema}.pbs_bid_line_favorite where bid_id = any($1::bigint[]) returning 1),
      deleted_configured_pairing_favorite as (delete from ${schema}.pbs_bid_pairing_configured_favorite where bid_id = any($1::bigint[]) returning 1),
      deleted_tier as (delete from ${schema}.pbs_bid_tier where bid_id = any($1::bigint[]) returning 1)
      delete from ${schema}.pbs_bid where id = any($1::bigint[])
    `,
    [bidIds],
  );
};

const insertBidForItem = async (
  client: CrewBidImportDbClient,
  schema: string,
  item: PreparedImportItem,
  propertyIdentities: Map<number, PropertyIdentity>,
  period: CrewBidImportPeriodContext,
  runKey: string,
  performanceTracker?: CrewBidImportPerformanceTracker,
) => {
  const isCurrentBid = item.item.targetBidContext === "Current";
  const targetPeriodCode = isCurrentBid ? period.periodCode : "STANDING";
  const targetRosterPeriodId = isCurrentBid ? period.rosterPeriodId : null;
  const existingBidResult = await client.query<{ id: string }>(
    `
      select id::varchar
      from ${schema}.pbs_bid
      where crew_id = $1::varchar
        and bid_context = $2::varchar
        and (
          ($2::varchar = 'Current' and roster_period_id = $3::bigint)
          or ($2::varchar <> 'Current' and roster_period_id is null and period_code = 'STANDING')
        )
    `,
    [item.item.crewId, item.item.targetBidContext, targetRosterPeriodId],
  );
  const previousBidIds = existingBidResult.rows.map((row) => row.id);
  const previousBidId = previousBidIds[0] ?? null;
  const previousSnapshot = performanceTracker
    ? await performanceTracker.measure("writeSnapshots", () => readBidSnapshot(client, schema, previousBidId), { snapshotReads: 1 })
    : await readBidSnapshot(client, schema, previousBidId);

  await deleteBids(client, schema, previousBidIds);

  const preferencesByTier = new Map<number, CrewBidImportMappedPreference[]>();

  for (const preference of item.mappedPreferences) {
    const tier = preference.targetTier ?? 1;
    const tierPreferences = preferencesByTier.get(tier) ?? [];
    tierPreferences.push(preference);
    preferencesByTier.set(tier, tierPreferences);
  }

  const tierEntries = Array.from(preferencesByTier.entries()).sort(([leftTier], [rightTier]) => leftTier - rightTier);

  const bidResult = await client.query<{ id: string }>(
    `
      insert into ${schema}.pbs_bid (
        created_by,
        updated_by,
        crew_id,
        period_code,
        roster_period_id,
        bid_context,
        total_tiers,
        status,
        last_modified_at,
        remarks
      )
      values ($1, $1, $2, $3, $4::bigint, $5, $6, 'DRAFT', now(), $7)
      returning id::varchar
    `,
    [
      IMPORT_CREATED_BY,
      item.item.crewId,
      targetPeriodCode,
      targetRosterPeriodId,
      item.item.targetBidContext,
      tierEntries.length,
      `crew-bid-import:${runKey}`,
    ],
  );
  const bidId = bidResult.rows[0]?.id;

  if (!bidId) {
    throw new Error(`Failed to insert bid for crew ${item.item.crewId}.`);
  }

  const tierValues: unknown[] = [];
  const tierPlaceholders = tierEntries.map(([tier, tierPreferences]) => {
    const offset = tierValues.length;
    tierValues.push(IMPORT_CREATED_BY, bidId, tier, tierPreferences.length);

    return `($${offset + 1}, $${offset + 1}, $${offset + 2}::bigint, $${offset + 3}, $${offset + 4}, 1)`;
  });
  const tierResult = await client.query<{ id: string; tier: number }>(
    `
      insert into ${schema}.pbs_bid_tier (
        created_by,
        updated_by,
        bid_id,
        tier,
        total_groups,
        is_active
      )
      values ${tierPlaceholders.join(",")}
      returning id::varchar, tier
    `,
    tierValues,
  );
  const tierIdsByTier = new Map(tierResult.rows.map((row) => [row.tier, row.id]));

  if (tierIdsByTier.size !== tierEntries.length) {
    throw new Error(`Failed to insert all tiers for crew ${item.item.crewId}.`);
  }

  const groupInputs: Array<{
    tier: number;
    tierId: string;
    groupSeq: number;
    propertyGroupKey: string;
    preference: CrewBidImportMappedPreference;
  }> = [];

  for (const [tier, tierPreferences] of tierEntries) {
    const tierId = tierIdsByTier.get(tier);

    if (!tierId) {
      throw new Error(`Failed to insert T${tier} for crew ${item.item.crewId}.`);
    }

    for (const [index, preference] of tierPreferences.entries()) {
      if (!propertyIdentities.has(preference.propertyCode)) {
        throw new Error(`Missing pbs_bid_property for property code ${preference.propertyCode}.`);
      }

      groupInputs.push({
        tier,
        tierId,
        groupSeq: index + 1,
        propertyGroupKey: crypto.randomUUID(),
        preference,
      });
    }
  }

  if (groupInputs.length > 0) {
    const groupValues: unknown[] = [];
    const groupPlaceholders = groupInputs.map((groupInput) => {
      const propertyIdentity = propertyIdentities.get(groupInput.preference.propertyCode);

      if (!propertyIdentity) {
        throw new Error(`Missing pbs_bid_property for property code ${groupInput.preference.propertyCode}.`);
      }

      const offset = groupValues.length;
      groupValues.push(
        IMPORT_CREATED_BY,
        groupInput.tierId,
        bidId,
        groupInput.groupSeq,
        groupInput.propertyGroupKey,
        groupInput.preference.bidType,
        groupInput.preference.actionId,
        groupInput.preference.propertyCode,
        propertyIdentity.id,
        groupInput.preference.operator,
        groupInput.preference.paramA,
        groupInput.preference.paramB,
        groupInput.preference.paramC,
        groupInput.preference.preferenceJson ? JSON.stringify(groupInput.preference.preferenceJson) : null,
        groupInput.preference.limitN,
        groupInput.preference.allOrNothing,
        groupInput.preference.minimumN,
      );

      return `(
        $${offset + 1}, $${offset + 1}, $${offset + 2}::bigint, $${offset + 3}::bigint,
        $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8},
        $${offset + 9}::bigint, $${offset + 10}, $${offset + 11}, $${offset + 12},
        $${offset + 13}, $${offset + 14}::jsonb, $${offset + 15}, $${offset + 16}, $${offset + 17}, 0
      )`;
    });
    const groupResult = await client.query<{
      id: string;
      tier_id: string;
      group_seq: number;
      property_group_key: string;
    }>(
      `
        insert into ${schema}.pbs_bid_group (
          created_by,
          updated_by,
          tier_id,
          bid_id,
          group_seq,
          property_group_key,
          bid_type,
          action_id,
          property_id,
          property_definition_id,
          operator,
          param_a,
          param_b,
          param_c,
          preference_json,
          limit_n,
          all_or_nothing,
          minimum_n,
          total_conditions
        )
        values ${groupPlaceholders.join(",")}
        returning id::varchar, tier_id::varchar, group_seq, property_group_key
      `,
      groupValues,
    );
    const groupsByKey = new Map(groupResult.rows.map((row) => [
      `${row.tier_id}:${row.group_seq}:${row.property_group_key}`,
      row,
    ]));

    if (groupsByKey.size !== groupInputs.length) {
      throw new Error(`Failed to insert all bid groups for crew ${item.item.crewId}.`);
    }
  }

  performanceTracker?.increment("writtenBidCount");
  const importedSnapshot = performanceTracker
    ? await performanceTracker.measure("writeSnapshots", () => readBidSnapshot(client, schema, bidId), { snapshotReads: 1 })
    : await readBidSnapshot(client, schema, bidId);

  return {
    bidId,
    previousBidId,
    previousSnapshot,
    importedSnapshot,
  };
};

const insertRunRecord = async (
  client: CrewBidImportDbClient,
  schema: string,
  actor: CrewBidImportActor,
  request: PbsCrewBidImportServiceRequest,
  period: CrewBidImportPeriodContext,
  runKey: string,
  mode: "dry_run" | "import",
  status: PbsCrewBidImportResponse["status"],
  summary: PbsCrewBidImportSummary,
  sourceSha256: string,
  completed = true,
) => {
  const completedAt = completed ? new Date().toISOString() : null;
  const result = await client.query<{ id: string }>(
    `
      insert into ${schema}.pbs_crew_bid_import_run (
        created_by,
        updated_by,
        run_key,
        mode,
        status,
        period_code,
        source_period_code,
        scope_json,
        options_json,
        source_sha256,
        total_blocks,
        total_crew,
        selected_crew,
        ready_crew,
        imported_crew,
        skipped_crew,
        failed_crew,
        parsed_preference_count,
        importable_preference_count,
        imported_preference_count,
        skipped_preference_count,
        failed_preference_count,
        matched_pairing_count,
        unmatched_pairing_count,
        roster_period_id,
        completed_at
      )
      values (
        $1, $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
        $24::bigint, $25::timestamptz
      )
      returning id::varchar
    `,
    [
      actor.userCode,
      runKey,
      mode,
      status,
      period.periodCode,
      request.sourcePeriodCode?.trim() || null,
      JSON.stringify(request.scope ?? null),
      JSON.stringify(normalizeOptions(request.options)),
      sourceSha256,
      summary.totalBlocks,
      summary.totalCrew,
      summary.selectedCrew,
      summary.readyCrew,
      summary.importedCrew,
      summary.skippedCrew,
      summary.failedCrew,
      summary.parsedPreferenceCount,
      summary.importablePreferenceCount,
      summary.importedPreferenceCount,
      summary.skippedPreferenceCount,
      summary.failedPreferenceCount,
      summary.matchedPairingCount,
      summary.unmatchedPairingCount,
      period.rosterPeriodId,
      completedAt,
    ],
  );

  const runId = result.rows[0]?.id;

  if (!runId) {
    throw new Error("Failed to insert crew bid import run.");
  }

  return runId;
};

const updateRunRecordSummary = async (
  client: CrewBidImportDbClient,
  schema: string,
  runId: string,
  actor: CrewBidImportActor,
  status: PbsCrewBidImportResponse["status"],
  summary: PbsCrewBidImportSummary,
) => {
  await client.query(
    `
      update ${schema}.pbs_crew_bid_import_run
      set status = $3,
          total_blocks = $4,
          total_crew = $5,
          selected_crew = $6,
          ready_crew = $7,
          imported_crew = $8,
          skipped_crew = $9,
          failed_crew = $10,
          parsed_preference_count = $11,
          importable_preference_count = $12,
          imported_preference_count = $13,
          skipped_preference_count = $14,
          failed_preference_count = $15,
          matched_pairing_count = $16,
          unmatched_pairing_count = $17,
          completed_at = now(),
          updated_by = $2,
          updated_at = now()
      where id = $1::bigint
    `,
    [
      runId,
      actor.userCode,
      status,
      summary.totalBlocks,
      summary.totalCrew,
      summary.selectedCrew,
      summary.readyCrew,
      summary.importedCrew,
      summary.skippedCrew,
      summary.failedCrew,
      summary.parsedPreferenceCount,
      summary.importablePreferenceCount,
      summary.importedPreferenceCount,
      summary.skippedPreferenceCount,
      summary.failedPreferenceCount,
      summary.matchedPairingCount,
      summary.unmatchedPairingCount,
    ],
  );
};

const updateRunRecordPerformance = async (
  client: CrewBidImportDbClient,
  schema: string,
  runId: string,
  actor: CrewBidImportActor,
  performance: PbsCrewBidImportPerformance,
) => {
  try {
    await client.query(
      `
        update ${schema}.pbs_crew_bid_import_run
        set performance_json = $3::jsonb,
            updated_by = $2,
            updated_at = now()
        where id = $1::bigint
      `,
      [runId, actor.userCode, JSON.stringify(performance)],
    );
  } catch (error) {
    if (isMissingColumnError(error)) {
      return;
    }

    throw error;
  }
};

const updateRunRecordRunning = async (
  client: CrewBidImportDbClient,
  schema: string,
  runId: string,
  actor: CrewBidImportActor,
) => {
  await client.query(
    `
      update ${schema}.pbs_crew_bid_import_run
      set status = 'running',
          completed_at = null,
          updated_by = $2,
          updated_at = now()
      where id = $1::bigint
    `,
    [runId, actor.userCode],
  );
};

const touchRunningRunRecord = async (
  client: CrewBidImportDbClient,
  schema: string,
  runId: string,
  actor: CrewBidImportActor,
) => {
  await client.query(
    `
      update ${schema}.pbs_crew_bid_import_run
      set updated_by = $2,
          updated_at = now()
      where id = $1::bigint
        and status in ('queued', 'running')
        and completed_at is null
    `,
    [runId, actor.userCode],
  );
};

const updateRunRecordFailed = async (
  client: CrewBidImportDbClient,
  schema: string,
  runId: string,
  actor: CrewBidImportActor,
  summary: PbsCrewBidImportSummary,
  message: string,
  performance?: PbsCrewBidImportPerformance,
) => {
  const failedSummary = {
    ...summary,
    failedCrew: Math.max(summary.failedCrew, summary.selectedCrew - summary.importedCrew - summary.skippedCrew),
  };
  await updateRunRecordSummary(client, schema, runId, actor, "failed", failedSummary);
  await client.query(
    `
      insert into ${schema}.pbs_crew_bid_import_problem (
        created_by,
        updated_by,
        run_id,
        item_id,
        severity,
        problem_code,
        message
      )
      values ($1, $1, $2::bigint, null, 'error', 'import_run_failed', $3)
    `,
    [actor.userCode, runId, requireReportMessage(message, "Import run failed.")],
  );

  if (performance) {
    await updateRunRecordPerformance(client, schema, runId, actor, performance);
  }
};

const chunkImportDetails = <T>(values: T[]): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += IMPORT_DETAIL_BATCH_SIZE) {
    chunks.push(values.slice(index, index + IMPORT_DETAIL_BATCH_SIZE));
  }

  return chunks;
};

export const insertRunItemsAndProblems = async (
  client: CrewBidImportDbClient,
  schema: string,
  runId: string,
  actor: CrewBidImportActor,
  preparedItems: PreparedImportItem[],
) => {
  if (preparedItems.length === 0) {
    return;
  }

  type InsertedItemRow = {
    id: string;
    crew_id: string;
    category: string;
    bid_context: "Current" | "Default";
    target_bid_context: PbsCrewBidImportTargetContext;
  };
  const insertedItemRows: InsertedItemRow[] = [];

  for (const preparedItemBatch of chunkImportDetails(preparedItems)) {
    const itemValues: unknown[] = [];
    const itemPlaceholders = preparedItemBatch.map((preparedItem) => {
      const offset = itemValues.length;
      itemValues.push(
        actor.userCode,
        runId,
        preparedItem.item.crewId,
        preparedItem.item.category,
        preparedItem.item.bidContext,
        preparedItem.item.targetBidContext,
        preparedItem.item.status,
        preparedItem.item.parsedPreferenceCount,
        preparedItem.item.importablePreferenceCount,
        preparedItem.item.importedPreferenceCount,
        preparedItem.item.skippedPreferenceCount,
        preparedItem.item.failedPreferenceCount,
        preparedItem.item.matchedPairingCount,
        preparedItem.item.unmatchedPairingCount,
        preparedItem.item.importedBidId ?? null,
        normalizeReportMessage(preparedItem.item.message),
      );

      return `(
        $${offset + 1}, $${offset + 1}, $${offset + 2}::bigint, $${offset + 3}, $${offset + 4},
        $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9},
        $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14},
        $${offset + 15}::bigint, $${offset + 16}
      )`;
    });
    const itemResult = await client.query<InsertedItemRow>(
      `
        insert into ${schema}.pbs_crew_bid_import_item (
          created_by,
          updated_by,
          run_id,
          crew_id,
          category,
          bid_context,
          target_bid_context,
          status,
          parsed_preference_count,
          importable_preference_count,
          imported_preference_count,
          skipped_preference_count,
          failed_preference_count,
          matched_pairing_count,
          unmatched_pairing_count,
          imported_bid_id,
          message
        )
        values ${itemPlaceholders.join(",")}
        returning id::varchar, crew_id, category, bid_context, target_bid_context
      `,
      itemValues,
    );

    if (itemResult.rows.length !== preparedItemBatch.length) {
      throw new Error("Failed to insert all crew bid import items.");
    }

    insertedItemRows.push(...itemResult.rows);
  }

  const itemIdsByKey = new Map(insertedItemRows.map((row) => [
    `${row.crew_id}:${row.category}:${row.bid_context}:${row.target_bid_context}`,
    row.id,
  ]));
  const problemsToInsert: Array<{ itemId: string; problem: PbsCrewBidImportProblem }> = [];

  for (const preparedItem of preparedItems) {
    if (preparedItem.problems.length === 0) {
      continue;
    }

    const itemId = itemIdsByKey.get(
      `${preparedItem.item.crewId}:${preparedItem.item.category}:${preparedItem.item.bidContext}:${preparedItem.item.targetBidContext}`,
    );

    if (!itemId) {
      throw new Error(`Failed to resolve crew bid import item for ${preparedItem.item.crewId}.`);
    }

    for (const problem of preparedItem.problems) {
      problemsToInsert.push({ itemId, problem });
    }
  }

  for (const problemBatch of chunkImportDetails(problemsToInsert)) {
    const problemValues: unknown[] = [];
    const problemPlaceholders = problemBatch.map(({ itemId, problem }) => {
      const offset = problemValues.length;
      problemValues.push(
        actor.userCode,
        runId,
        itemId,
        problem.crewId ?? null,
        problem.category ?? null,
        problem.bidContext ?? null,
        problem.targetBidContext ?? null,
        problem.sourceLineNumber ?? null,
        problem.sourceSeq ?? null,
        problem.severity,
        problem.code,
        requireReportMessage(problem.message, "Import problem was recorded without a message."),
        problem.rawText ?? null,
      );

      return `(
        $${offset + 1}, $${offset + 1}, $${offset + 2}::bigint, $${offset + 3}::bigint,
        $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8},
        $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}
      )`;
    });

    await client.query(
      `
        insert into ${schema}.pbs_crew_bid_import_problem (
          created_by,
          updated_by,
          run_id,
          item_id,
          crew_id,
          category,
          bid_context,
          target_bid_context,
          source_line_number,
          source_seq,
          severity,
          problem_code,
          message,
          raw_text
        )
        values ${problemPlaceholders.join(",")}
      `,
      problemValues,
    );
  }
};

const mapItemRow = (row: ImportItemRow): PbsCrewBidImportItem => ({
  crewId: row.crew_id,
  category: row.category,
  bidContext: row.bid_context,
  targetBidContext: row.target_bid_context,
  status: row.status,
  parsedPreferenceCount: row.parsed_preference_count,
  importablePreferenceCount: row.importable_preference_count,
  importedPreferenceCount: row.imported_preference_count,
  skippedPreferenceCount: row.skipped_preference_count,
  failedPreferenceCount: row.failed_preference_count,
  matchedPairingCount: row.matched_pairing_count,
  unmatchedPairingCount: row.unmatched_pairing_count,
  ...(row.imported_bid_id ? { importedBidId: Number.parseInt(row.imported_bid_id, 10) } : {}),
  ...(row.message ? { message: row.message } : {}),
});

const mapProblemRow = (row: ImportProblemRow): PbsCrewBidImportProblem => ({
  ...(row.crew_id ? { crewId: row.crew_id } : {}),
  ...(row.category ? { category: row.category } : {}),
  ...(row.bid_context ? { bidContext: row.bid_context } : {}),
  ...(row.target_bid_context ? { targetBidContext: row.target_bid_context } : {}),
  ...(row.source_line_number ? { sourceLineNumber: row.source_line_number } : {}),
  ...(row.source_seq ? { sourceSeq: row.source_seq } : {}),
  severity: row.severity,
  code: row.problem_code,
  message: row.message,
  ...(row.raw_text ? { rawText: row.raw_text } : {}),
});

const mapRunListItem = (row: ImportRunRow): PbsCrewBidImportRunListItem => ({
  runId: row.run_key,
  rosterPeriodId: Number.parseInt(row.roster_period_id, 10),
  periodCode: row.period_code,
  ...(row.source_period_code ? { sourcePeriodCode: row.source_period_code } : {}),
  mode: row.mode,
  status: row.status,
  summary: summaryFromRows(row),
  createdAt: toIsoString(row.created_at),
  ...(row.completed_at ? { completedAt: toIsoString(row.completed_at) } : {}),
  createdBy: row.created_by,
});

export const createPbsCrewBidImportService = ({
  pgPool,
  pbsSchema,
  liveSchema,
}: CrewBidImportServiceDependencies): PbsCrewBidImportService => {
  const schema = quoteIdentifier(pbsSchema);
  const livePairingSchema = quoteIdentifier(liveSchema);

  const prepareResponse = async (
    request: PbsCrewBidImportServiceRequest,
    mode: "dry_run" | "import",
  ) => {
    const performanceTracker = createPerformanceTracker();
    const options = normalizeOptions(request.options);
    const document = performanceTracker.measureSync("parseSource", () => parseCrewBidTxt(request.sourceText));
    const selectedBlocks = performanceTracker.measureSync("selectBlocks", () => selectCrewBlocks(document.blocks, request, options));
    const sourceSha256 = computeSha256(request.sourceText);
    const client = await pgPool.connect();

    try {
      const period = await loadPeriodContext(client, livePairingSchema, request.rosterPeriodId);
      const resumeImportedCrew = await loadResumeImportedCrew(client, schema, period.rosterPeriodId, sourceSha256, selectedBlocks);
      const { pendingBlocks, skippedItems } = buildResumeSkippedItems(selectedBlocks, resumeImportedCrew);
      const pendingItems = await prepareImportItems(client, schema, livePairingSchema, pendingBlocks, period, options, performanceTracker);
      const preparedItems = combinePreparedItemsInSelectionOrder(selectedBlocks, skippedItems, pendingItems);
      const items = preparedItems.map((preparedItem) => preparedItem.item);
      const problems = preparedItems.flatMap((preparedItem) => preparedItem.problems);
      const summary = combineSummary(buildInitialSummary(document, selectedBlocks), items);
      const performance = performanceTracker.build({
        selectedCrew: selectedBlocks.length,
        selectedBlocks: selectedBlocks.length,
      });

      return {
        document,
        selectedBlocks,
        preparedItems,
        response: {
          mode,
          status: determineStatus(mode, summary, problems),
          rosterPeriodId: period.rosterPeriodId,
          periodCode: period.periodCode,
          sourcePeriodCode: request.sourcePeriodCode?.trim() || document.periodLabel || undefined,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          summary,
          items,
          problems,
          performance,
        } satisfies PbsCrewBidImportResponse,
      };
    } finally {
      client.release();
    }
  };

  const validateImportRequest = (request: PbsCrewBidImportServiceRequest) => {
    if (!request.confirm) {
      throw new Error("confirm=true is required for crew bid import.");
    }

    const options = normalizeOptions(request.options);

    if (!options.overwriteCurrentBid) {
      throw new Error("overwriteCurrentBid=true is required for this import endpoint.");
    }

    if (options.importDefaultAsStanding && !options.overwriteStandingBid) {
      throw new Error("overwriteStandingBid=true is required when importing Default Bid into Standing Bid.");
    }

    return options;
  };

  const createImportRun = async (
    actor: CrewBidImportActor,
    request: PbsCrewBidImportServiceRequest,
    status: "queued" | "running",
  ) => {
    const performanceTracker = createPerformanceTracker();
    const options = validateImportRequest(request);
    const document = performanceTracker.measureSync("parseSource", () => parseCrewBidTxt(request.sourceText));
    const selectedBlocks = performanceTracker.measureSync("selectBlocks", () => selectCrewBlocks(document.blocks, request, options));
    const summary = buildInitialSummary(document, selectedBlocks);
    const runKey = crypto.randomUUID();
    const sourceSha256 = computeSha256(request.sourceText);
    const client = await pgPool.connect();

    try {
      await client.query("begin");
      const period = await loadPeriodContext(client, livePairingSchema, request.rosterPeriodId);
      const resumeImportedCrew = await loadResumeImportedCrew(client, schema, period.rosterPeriodId, sourceSha256, selectedBlocks);
      const { pendingBlocks, skippedItems } = buildResumeSkippedItems(selectedBlocks, resumeImportedCrew);
      const runDbId = await insertRunRecord(
        client,
        schema,
        actor,
        request,
        period,
        runKey,
        "import",
        status,
        summary,
        sourceSha256,
        false,
      );
      await client.query("commit");

      return {
        runKey,
        runDbId,
        context: {
          period,
          options,
          document,
          selectedBlocks,
          pendingBlocks,
          resumeSkippedItems: skippedItems,
          initialSummary: summary,
          performanceTracker,
        } satisfies CrewBidImportExecutionContext,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };

  const markImportRunFailed = async (
    actor: CrewBidImportActor,
    runDbId: string,
    summary: PbsCrewBidImportSummary,
    error: unknown,
    performance?: PbsCrewBidImportPerformance,
  ) => {
    const message = error instanceof Error ? error.message : "Failed to import crew bids.";
    const client = await pgPool.connect();

    try {
      await client.query("begin");
      await updateRunRecordFailed(client, schema, runDbId, actor, summary, message, performance);
      await client.query("commit");
    } catch {
      await client.query("rollback").catch(() => undefined);
    } finally {
      client.release();
    }
  };

  const markImportRunRunning = async (
    actor: CrewBidImportActor,
    runDbId: string,
  ) => {
    const client = await pgPool.connect();

    try {
      await updateRunRecordRunning(client, schema, runDbId, actor);
    } finally {
      client.release();
    }
  };

  const startImportRunHeartbeat = (
    actor: CrewBidImportActor,
    runDbId: string,
  ) => {
    const interval = setInterval(() => {
      const heartbeat = async () => {
        const client = await pgPool.connect();

        try {
          await touchRunningRunRecord(client, schema, runDbId, actor);
        } finally {
          client.release();
        }
      };

      void heartbeat().catch(() => undefined);
    }, IMPORT_RUN_HEARTBEAT_MS);

    return () => clearInterval(interval);
  };

  const markStaleImportRuns = async (runKey?: string) => {
    const params: unknown[] = [IMPORT_CREATED_BY, IMPORT_RUN_STALE_SECONDS];
    const runFilter = runKey ? `and run_key = $${params.push(runKey)}::varchar` : "";
    const staleResult = await pgPool.query<{ id: string }>(
      `
        update ${schema}.pbs_crew_bid_import_run
        set status = 'failed',
            failed_crew = greatest(failed_crew, greatest(selected_crew - imported_crew - skipped_crew, 0)),
            completed_at = now(),
            updated_by = $1,
            updated_at = now()
        where status in ('queued', 'running')
          and completed_at is null
          and rolled_back_at is null
          and updated_at < now() - ($2::int * interval '1 second')
          ${runFilter}
        returning id::varchar
      `,
      params,
    );

    for (const row of staleResult.rows) {
      await pgPool.query(
        `
          insert into ${schema}.pbs_crew_bid_import_problem (
            created_by,
            updated_by,
            run_id,
            item_id,
            severity,
            problem_code,
            message
          )
          select $1, $1, $2::bigint, null, 'error', 'import_run_stale', $3
          where not exists (
            select 1
            from ${schema}.pbs_crew_bid_import_problem
            where run_id = $2::bigint
              and problem_code = 'import_run_stale'
          )
        `,
        [IMPORT_CREATED_BY, row.id, requireReportMessage(IMPORT_RUN_STALE_MESSAGE, "Import run became stale.")],
      );
    }
  };

  const writePreparedImportCrew = async (
    actor: CrewBidImportActor,
    runKey: string,
    runDbId: string,
    period: CrewBidImportPeriodContext,
    propertyIdentities: Map<number, PropertyIdentity>,
    preparedItems: PreparedImportItem[],
    performanceTracker: CrewBidImportPerformanceTracker,
  ) => {
    const writableItems = preparedItems.filter((preparedItem) => preparedItem.mappedPreferences.length > 0);

    for (const preparedItem of preparedItems) {
      if (preparedItem.mappedPreferences.length === 0 && preparedItem.item.status === "ready") {
        preparedItem.item.status = "failed";
      }
    }

    if (writableItems.length === 0) {
      return;
    }

    const client = await pgPool.connect();

    try {
      await client.query("begin");
      const importedResults: Array<{
        preparedItem: PreparedImportItem;
        bidId: string;
      }> = [];

      for (const preparedItem of writableItems) {
        const insertResult = await insertBidForItem(
          client,
          schema,
          preparedItem,
          propertyIdentities,
          period,
          runKey,
          performanceTracker,
        );

        await client.query(
          `
            insert into ${schema}.pbs_crew_bid_import_backup (
              created_by,
              updated_by,
              run_id,
              crew_id,
              period_code,
              target_bid_context,
              previous_bid_id,
              imported_bid_id,
              previous_snapshot_json,
              imported_snapshot_json
            )
            values ($1, $1, $2::bigint, $3, $4, $5, $6::bigint, $7::bigint, $8::jsonb, $9::jsonb)
          `,
          [
            actor.userCode,
            runDbId,
            preparedItem.item.crewId,
            preparedItem.item.targetBidContext === "Current" ? period.periodCode : "STANDING",
            preparedItem.item.targetBidContext,
            insertResult.previousBidId,
            insertResult.bidId,
            JSON.stringify(insertResult.previousSnapshot),
            insertResult.importedSnapshot ? JSON.stringify(insertResult.importedSnapshot) : null,
          ],
        );
        importedResults.push({
          preparedItem,
          bidId: insertResult.bidId,
        });
      }

      await client.query("commit");

      for (const { preparedItem, bidId } of importedResults) {
        preparedItem.item.status = "imported";
        preparedItem.item.importedBidId = Number.parseInt(bidId, 10);
        preparedItem.item.importedPreferenceCount = preparedItem.mappedPreferences.length;
        preparedItem.item.message = undefined;
      }
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const message = error instanceof Error ? error.message : "Failed to import crew bid.";

      for (const preparedItem of writableItems) {
        preparedItem.item.status = "failed";
        preparedItem.item.importedBidId = undefined;
        preparedItem.item.importedPreferenceCount = 0;
        preparedItem.item.message = message;
        preparedItem.problems.push({
          crewId: preparedItem.item.crewId,
          category: preparedItem.item.category,
          bidContext: preparedItem.item.bidContext,
          targetBidContext: preparedItem.item.targetBidContext,
          severity: "error",
          code: "bid_write_failed",
          message,
        });
      }
    } finally {
      client.release();
    }
  };

  const runImportForExistingRun = async (
    actor: CrewBidImportActor,
    request: PbsCrewBidImportServiceRequest,
    runKey: string,
    runDbId: string,
    context: CrewBidImportExecutionContext,
  ): Promise<PbsCrewBidImportResponse> => {
    validateImportRequest(request);
    const {
      period,
      options,
      document,
      selectedBlocks,
      pendingBlocks,
      resumeSkippedItems,
      initialSummary,
      performanceTracker,
    } = context;
    const periodCode = period.periodCode;
    const startedAt = new Date().toISOString();
    await markImportRunRunning(actor, runDbId);
    if (selectedBlocks.length === 0) {
      const message = "No crew matched the selected import scope. Check Base, Category, and Crew IDs.";
      const performance = performanceTracker.build({
        selectedCrew: 0,
        selectedBlocks: 0,
      });
      await markImportRunFailed(actor, runDbId, initialSummary, new Error(message), performance);

      return {
        runId: runKey,
        rosterPeriodId: period.rosterPeriodId,
        mode: "import",
        status: "failed",
        periodCode,
        sourcePeriodCode: request.sourcePeriodCode?.trim() || document.periodLabel || undefined,
        startedAt,
        completedAt: new Date().toISOString(),
        summary: initialSummary,
        items: [],
        problems: [{
          severity: "error",
          code: "import_run_failed",
          message,
        }],
        performance,
      };
    }
    const stopHeartbeat = startImportRunHeartbeat(actor, runDbId);

    try {
      const prepareClient = await pgPool.connect();
      let propertyIdentities: Map<number, PropertyIdentity>;
      let preparedItems: PreparedImportItem[];

      try {
        propertyIdentities = await performanceTracker.measure("loadPropertyIdentities", () => loadPropertyIdentities(prepareClient, schema));
        preparedItems = await prepareImportItems(prepareClient, schema, livePairingSchema, pendingBlocks, period, options, performanceTracker);
      } finally {
        prepareClient.release();
      }

      const preparedItemsByCrew = new Map<string, PreparedImportItem[]>();

      for (const preparedItem of preparedItems) {
        const crewKey = normalizeCrewId(preparedItem.item.crewId);
        const crewItems = preparedItemsByCrew.get(crewKey) ?? [];
        crewItems.push(preparedItem);
        preparedItemsByCrew.set(crewKey, crewItems);
      }
      const preparedCrewItems = Array.from(preparedItemsByCrew.values());

      await performanceTracker.measure("writeBids", async () => {
        await mapWithConcurrency(
          preparedCrewItems,
          IMPORT_WRITE_CONCURRENCY,
          async (crewItems) => writePreparedImportCrew(
            actor,
            runKey,
            runDbId,
            period,
            propertyIdentities,
            crewItems,
            performanceTracker,
          ),
        );
      }, {
        itemCount: preparedCrewItems.length,
        concurrency: Math.min(IMPORT_WRITE_CONCURRENCY, Math.max(preparedCrewItems.length, 1)),
      });

      const allPreparedItems = combinePreparedItemsInSelectionOrder(selectedBlocks, resumeSkippedItems, preparedItems);
      const items = allPreparedItems.map((preparedItem) => preparedItem.item);
      const problems = allPreparedItems.flatMap((preparedItem) => preparedItem.problems);
      const summary = combineSummary(initialSummary, items);
      const status = determineStatus("import", summary, problems);
      let performance = performanceTracker.build({
        selectedCrew: initialSummary.selectedCrew,
        selectedBlocks: selectedBlocks.length,
      });
      const detailClient = await pgPool.connect();

      try {
        await detailClient.query("begin");
        await performanceTracker.measure("writeRunDetail", async () => {
          await updateRunRecordSummary(
            detailClient,
            schema,
            runDbId,
            actor,
            status,
            summary,
          );
          await insertRunItemsAndProblems(detailClient, schema, runDbId, actor, allPreparedItems);
        }, { itemCount: allPreparedItems.length, problemCount: problems.length });
        performance = performanceTracker.build({
          selectedCrew: selectedBlocks.length,
          selectedBlocks: selectedBlocks.length,
        });
        await updateRunRecordPerformance(detailClient, schema, runDbId, actor, performance);
        await detailClient.query("commit");
      } catch (error) {
        await detailClient.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        detailClient.release();
      }

      return {
        runId: runKey,
        rosterPeriodId: period.rosterPeriodId,
        mode: "import",
        status,
        periodCode,
        sourcePeriodCode: request.sourcePeriodCode?.trim() || document.periodLabel || undefined,
        startedAt,
        completedAt: new Date().toISOString(),
        summary,
        items,
        problems,
        performance,
      };
    } catch (error) {
      await markImportRunFailed(
        actor,
        runDbId,
        initialSummary,
        error,
        performanceTracker.build({
          selectedCrew: selectedBlocks.length,
          selectedBlocks: selectedBlocks.length,
        }),
      );
      throw error;
    } finally {
      stopHeartbeat();
    }
  };

  const scheduleImportRun = (
    actor: CrewBidImportActor,
    request: PbsCrewBidImportServiceRequest,
    runKey: string,
    runDbId: string,
    context: CrewBidImportExecutionContext,
  ) => {
    setTimeout(() => {
      void runImportForExistingRun(actor, request, runKey, runDbId, context).catch(() => undefined);
    }, 0);
  };

  return {
    async dryRun(_actor, request) {
      const prepared = await prepareResponse(request, "dry_run");

      return prepared.response;
    },

    async startImport(actor, request) {
      const run = await createImportRun(actor, request, "queued");
      scheduleImportRun(actor, request, run.runKey, run.runDbId, run.context);

      return {
        runId: run.runKey,
        rosterPeriodId: run.context.period.rosterPeriodId,
        mode: "import",
        status: "queued",
        periodCode: run.context.period.periodCode,
        sourcePeriodCode: request.sourcePeriodCode?.trim() || run.context.document.periodLabel || undefined,
        startedAt: new Date().toISOString(),
        summary: run.context.initialSummary,
        items: [],
        problems: [],
      };
    },

    async importBids(actor, request) {
      const run = await createImportRun(actor, request, "running");

      return runImportForExistingRun(actor, request, run.runKey, run.runDbId, run.context);
    },

    async listRuns(query: PbsCrewBidImportRunQuery): Promise<PbsCrewBidImportRunListResponse> {
      await markStaleImportRuns();
      const params: unknown[] = [];
      const periodFilter = query.rosterPeriodId
        ? `where roster_period_id = $${params.push(query.rosterPeriodId)}::bigint`
        : "";
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
      const result = await pgPool.query<ImportRunRow>(
        `
          select *
          from ${schema}.pbs_crew_bid_import_run
          ${periodFilter}
          order by created_at desc
          limit $${params.push(limit)}
        `,
        params,
      );

      return {
        runs: result.rows.map(mapRunListItem),
      };
    },

    async getRun(runId: string): Promise<PbsCrewBidImportRunDetailResponse> {
      await markStaleImportRuns(runId);
      const runResult = await pgPool.query<ImportRunRow>(
        `
          select *
          from ${schema}.pbs_crew_bid_import_run
          where run_key = $1::varchar
        `,
        [runId],
      );
      const runRow = runResult.rows[0];

      if (!runRow) {
        throw new Error("Crew bid import run was not found.");
      }
      const performance = mapPerformance(runRow.performance_json);

      const [itemResult, problemResult] = await Promise.all([
        pgPool.query<ImportItemRow>(
          `
            select *
            from ${schema}.pbs_crew_bid_import_item
            where run_id = $1::bigint
            order by id asc
          `,
          [runRow.id],
        ),
        pgPool.query<ImportProblemRow>(
          `
            select *
            from ${schema}.pbs_crew_bid_import_problem
            where run_id = $1::bigint
            order by id asc
          `,
          [runRow.id],
        ),
      ]);

      return {
        runId: runRow.run_key,
        rosterPeriodId: Number.parseInt(runRow.roster_period_id, 10),
        mode: runRow.mode,
        status: runRow.status,
        periodCode: runRow.period_code,
        sourcePeriodCode: runRow.source_period_code ?? undefined,
        startedAt: toIsoString(runRow.started_at),
        ...(runRow.completed_at ? { completedAt: toIsoString(runRow.completed_at) } : {}),
        createdBy: runRow.created_by,
        rolledBackAt: runRow.rolled_back_at ? toIsoString(runRow.rolled_back_at) : undefined,
        rolledBackBy: runRow.rolled_back_by ?? undefined,
        summary: summaryFromRows(runRow),
        items: itemResult.rows.map(mapItemRow),
        problems: problemResult.rows.map(mapProblemRow),
        ...(performance ? { performance } : {}),
      };
    },

    async rollbackRun(actor, runId, input) {
      if (!input.confirm) {
        throw new Error("confirm=true is required for crew bid import rollback.");
      }

      const restorePrevious = input.restorePrevious ?? true;
      const client = await pgPool.connect();

      try {
        await client.query("begin isolation level serializable");
        const runResult = await client.query<ImportRunRow>(
          `
            select *
            from ${schema}.pbs_crew_bid_import_run
            where run_key = $1::varchar
            for update
          `,
          [runId],
        );
        const runRow = runResult.rows[0];

        if (!runRow) {
          throw new Error("Crew bid import run was not found.");
        }

        if (runRow.rolled_back_at) {
          throw new Error("Crew bid import run has already been rolled back.");
        }

        if (runRow.status === "queued" || runRow.status === "running") {
          throw new Error("Crew bid import run is still running and cannot be rolled back.");
        }

        const backupResult = await client.query<{
          imported_bid_id: string | null;
          previous_snapshot_json: BidSnapshot | null;
          imported_snapshot_json: BidSnapshot | null;
        }>(
          `
            select imported_bid_id::varchar, previous_snapshot_json, imported_snapshot_json
            from ${schema}.pbs_crew_bid_import_backup
            where run_id = $1::bigint
            order by id asc
            for update
          `,
          [runRow.id],
        );
        const importedBidIds = backupResult.rows.flatMap((row) => row.imported_bid_id ? [row.imported_bid_id] : []);

        if (importedBidIds.length > 0) {
          const lockedBidResult = await client.query<{ id: string }>(
            `
              select id::varchar
              from ${schema}.pbs_bid
              where id = any($1::bigint[])
              order by id asc
              for update
            `,
            [importedBidIds],
          );

          if (lockedBidResult.rows.length !== importedBidIds.length) {
            throw new Error("Crew bid import rollback stopped because imported bids are missing or duplicated.");
          }

          const currentSnapshots = await readBidSnapshots(client, schema, importedBidIds);

          if (currentSnapshots.size !== importedBidIds.length) {
            throw new Error("Crew bid import rollback stopped because imported bid snapshots are incomplete.");
          }

          for (const backup of backupResult.rows) {
            if (!backup.imported_bid_id) {
              continue;
            }

            const currentSnapshot = currentSnapshots.get(backup.imported_bid_id);

            if (!currentSnapshot || String(currentSnapshot.bid?.id ?? "") !== backup.imported_bid_id) {
              throw new Error("Crew bid import rollback stopped because an imported bid id changed.");
            }

            assertImportedSnapshotUnchanged(
              currentSnapshot,
              backup.imported_snapshot_json,
              runId,
              runRow.completed_at,
            );
          }
        }

        await deleteBids(client, schema, importedBidIds);

        let restoredBidCount = 0;

        if (restorePrevious) {
          for (const backup of backupResult.rows) {
            const snapshot = backup.previous_snapshot_json;

            if (!snapshot?.bid) {
              continue;
            }

            await restoreBidSnapshot(client, schema, snapshot);
            restoredBidCount += 1;
          }
        }

        await client.query(
          `
            update ${schema}.pbs_crew_bid_import_run
            set status = 'rolled_back',
                rolled_back_at = now(),
                rolled_back_by = $2,
                updated_by = $2,
                updated_at = now()
            where id = $1::bigint
          `,
          [runRow.id, actor.userCode],
        );
        await client.query("commit");

        return {
          runId,
          status: "rolled_back",
          restoredBidCount,
          deletedImportedBidCount: importedBidIds.length,
          completedAt: new Date().toISOString(),
        };
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
};

const restoreBidSnapshot = async (
  client: CrewBidImportDbClient,
  schema: string,
  snapshot: BidSnapshot,
) => {
  if (!snapshot.bid) {
    return;
  }

  const bidId = String(snapshot.bid.id ?? "");

  if (!bidId) {
    throw new Error("Cannot restore bid snapshot without bid id.");
  }

  await client.query(
    `
      insert into ${schema}.pbs_bid (
        id,
        created_by,
        created_at,
        updated_by,
        updated_at,
        crew_id,
        period_code,
        roster_period_id,
        bid_context,
        submitted_at,
        last_modified_at,
        is_locked,
        total_tiers,
        status,
        remarks,
        draft_version
      )
      overriding system value
      values (
        $1::bigint, $2, $3::timestamptz, $4, $5::timestamptz, $6, $7, $8::bigint, $9,
        $10::timestamptz, $11::timestamptz, $12, $13, $14, $15, $16
      )
      on conflict (id) do nothing
    `,
    [
      snapshot.bid.id,
      snapshot.bid.created_by,
      snapshot.bid.created_at,
      snapshot.bid.updated_by,
      snapshot.bid.updated_at,
      snapshot.bid.crew_id,
      snapshot.bid.period_code,
      snapshot.bid.roster_period_id,
      snapshot.bid.bid_context,
      snapshot.bid.submitted_at,
      snapshot.bid.last_modified_at,
      snapshot.bid.is_locked,
      snapshot.bid.total_tiers,
      snapshot.bid.status,
      snapshot.bid.remarks,
      snapshot.bid.draft_version,
    ],
  );
  await restoreRows(client, schema, "pbs_bid_tier", snapshot.tiers);
  await restoreRows(client, schema, "pbs_bid_group", snapshot.groups);
  await restoreRows(client, schema, "pbs_bid_condition", snapshot.conditions);
  await restoreRows(client, schema, "pbs_bid_day_off", snapshot.daysOff);
  await restoreRows(client, schema, "pbs_bid_pairing_occurrence", snapshot.pairingOccurrences);
  await restoreFavoriteRows(client, schema, snapshot.favorites);
};

const CONFIGURED_FAVORITE_TABLES = new Set([
  "pbs_bid_pairing_configured_favorite",
  "pbs_bid_days_off_favorite",
  "pbs_bid_line_favorite",
]);
const FAVORITE_TABLES = new Set([
  "pbs_bid_pairing_favorite",
  "pbs_bid_property_favorite",
  ...CONFIGURED_FAVORITE_TABLES,
]);

const restoreFavoriteRows = async (
  client: CrewBidImportDbClient,
  schema: string,
  favorites: Record<string, unknown>[],
) => {
  for (const favorite of favorites) {
    const tableName = String(favorite.table_name ?? "");
    const rowData = favorite.row_data;

    if (!FAVORITE_TABLES.has(tableName) || !rowData || typeof rowData !== "object") {
      continue;
    }

    const restoredRow = { ...(rowData as Record<string, unknown>) };

    if (CONFIGURED_FAVORITE_TABLES.has(tableName)) {
      delete restoredRow.tiers;
    }

    await restoreRows(client, schema, tableName, [restoredRow]);
  }
};

const restoreRows = async (
  client: CrewBidImportDbClient,
  schema: string,
  tableName: string,
  rows: Record<string, unknown>[],
) => {
  for (const row of rows) {
    const entries = Object.entries(row);

    if (entries.length === 0) {
      continue;
    }

    const columns = entries.map(([column]) => quoteIdentifier(column));
    const placeholders = entries.map((_, index) => `$${index + 1}`);

    await client.query(
      `
        insert into ${schema}.${quoteIdentifier(tableName)} (${columns.join(", ")})
        overriding system value
        values (${placeholders.join(", ")})
        on conflict do nothing
      `,
      entries.map(([, value]) => value),
    );
  }
};
