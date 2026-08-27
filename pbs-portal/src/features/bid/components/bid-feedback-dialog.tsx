import { useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  pbsBidFeedbackEligibilityPairingLimit,
  type PbsBidFeedbackDayOff,
  type PbsBidFeedbackPairing,
  type PbsBidFeedbackResponse,
} from "../../../../../packages/contracts/pbs-bid-feedback.js";
import { BidFeedbackCalendar } from "@/features/bid/components/bid-feedback-calendar";
import {
  formatBidFeedbackTableDate,
  overlapsBidFeedbackPeriod,
} from "@/features/bid/components/bid-feedback-period";
import { useBidFeedbackEligibility } from "@/features/bid/hooks/use-bid-feedback";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { cn } from "@/shared/lib/cn";

type BidFeedbackDialogProps = {
  data?: PbsBidFeedbackResponse;
  isError: boolean;
  isLoading: boolean;
  onClose: () => void;
  onRetry: () => void;
};

type FeedbackTab = "award" | "avoid" | "days-off";
type FeedbackView = "bids" | "calendar";

const PAGE_SIZE = 25;
const PAIRING_TABLE_GRID = "grid-cols-[minmax(72px,1fr)_48px_76px_76px_40px_54px_28px]";
const DAYS_OFF_TABLE_GRID = "grid-cols-[minmax(120px,1fr)_64px]";
const BID_FEEDBACK_TABLE_HEADER_CLASS = "sticky top-0 z-10 grid min-h-9 items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-2xs font-medium uppercase text-muted-foreground";
const BID_FEEDBACK_TABLE_ROW_CLASS = "grid min-h-10 w-full cursor-pointer items-center gap-2 border-0 border-b border-border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors last:border-b-0 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const BID_FEEDBACK_HEADER_CELL_CLASS = "scale-90 justify-self-center text-center text-xs";
const BID_FEEDBACK_ROW_CELL_CLASS = "justify-self-center text-center";
const BID_FEEDBACK_SORT_COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const formatCreditHours = (value: string): string => (
  /^\d{1,3}:\d{2}$/.test(value) ? `${value}h` : value
);

const displayValue = (value: unknown): string => value === "" || value === null || value === undefined ? "—" : String(value);

type EligibilityStatus = NonNullable<PbsBidFeedbackPairing["eligibility"]>["status"];
type PairingEligibility = NonNullable<PbsBidFeedbackPairing["eligibility"]>;
type EligibilityReason = NonNullable<PbsBidFeedbackPairing["eligibility"]>["reasons"][number];
type EligibilityTone = "ok" | "bad" | "unknown";

const getEligibilityStatus = (pairing: PbsBidFeedbackPairing): EligibilityStatus => pairing.eligibility?.status ?? "unknown";

const getEligibilityTone = (status: EligibilityStatus): EligibilityTone => (
  status === "eligible" ? "ok" : status === "ineligible" ? "bad" : "unknown"
);

const eligibilityBadgeClassName = (tone: EligibilityTone): string => {
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "bad") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
};

const eligibilityMarkClassName = (tone: EligibilityTone): string => {
  if (tone === "ok") return "text-emerald-700";
  if (tone === "bad") return "text-destructive";
  return "text-muted-foreground";
};

const eligibilityHeaderLabel = (status: EligibilityStatus): string => {
  if (status === "eligible") return "Eligible";
  if (status === "ineligible") return "Not eligible";
  return "Eligibility unavailable";
};

const eligibilityResultLabel = (status: EligibilityStatus): string => {
  if (status === "eligible") return "PASS";
  if (status === "ineligible") return "FAIL";
  return "Unavailable";
};

const eligibilityReasonMeta = (reason: EligibilityReason): string | null => {
  const parts = Array.from(new Set(
    [reason.ruleName, reason.ruleId]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part)),
  ));
  return parts.length > 0 ? parts.join(" · ") : null;
};

const fallbackEligibilityText = "Rule Engine eligibility checks have not been run for Bid Feedback.";

const normalizeEligibilitySummary = (label?: string): string => {
  if (!label) return fallbackEligibilityText;
  const unavailablePrefix = "Eligibility unavailable. ";
  return label.startsWith(unavailablePrefix) ? label.slice(unavailablePrefix.length) : label;
};

const EligibilityMark = ({ status }: { status: EligibilityStatus }) => {
  const tone = getEligibilityTone(status);
  const label = status === "eligible"
    ? "Eligible"
    : status === "ineligible"
      ? "Not eligible"
      : "Eligibility unavailable";
  const mark = status === "eligible" ? "✓" : status === "ineligible" ? "✗" : "";

  return (
    <span
      aria-label={label}
      className={cn("inline-flex h-4 min-w-4 shrink-0 items-center justify-center text-xs font-bold", eligibilityMarkClassName(tone))}
    >
      {mark}
    </span>
  );
};

const BidFeedbackSkeleton = () => (
  <div
    aria-label="Loading Bid Feedback"
    className="flex h-[min(500px,calc(100vh-150px))] min-h-96 flex-col gap-3 animate-pulse"
    role="status"
  >
    <div className="flex h-8 shrink-0 items-center gap-2" aria-hidden="true">
      <div className="h-8 w-24 rounded-md bg-muted" />
      <div className="h-8 w-20 rounded-md bg-muted" />
      <div className="h-8 w-24 rounded-md bg-muted" />
      <div className="ml-auto h-8 w-32 rounded-md bg-muted" />
    </div>

    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[42fr_58fr]">
      <section
        aria-label="Loading Pairing list"
        className="min-h-0 overflow-hidden rounded-lg border border-border bg-background"
        data-testid="bid-feedback-skeleton-list"
      >
        <div className={cn("grid h-9 items-center gap-2 border-b border-border bg-muted/60 px-3", PAIRING_TABLE_GRID)} aria-hidden="true">
          {["w-16", "w-8", "w-14", "w-14", "w-6", "w-10", "w-4"].map((width, index) => (
            <span key={`${width}:${index}`} className={cn("h-2 rounded-full bg-muted-foreground/20", width)} />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, rowIndex) => (
          <div key={rowIndex} className={cn("grid min-h-12 items-center gap-2 border-b border-border px-3 last:border-b-0", PAIRING_TABLE_GRID)} aria-hidden="true">
            {["w-14", "w-8", "w-16", "w-16", "w-5", "w-10", "h-4 w-4"].map((size, columnIndex) => (
              <span
                key={`${rowIndex}:${columnIndex}`}
                className={cn(
                  "rounded-full bg-muted",
                  columnIndex === 6 ? size : cn("h-2", size),
                )}
              />
            ))}
          </div>
        ))}
      </section>

      <section
        aria-label="Loading Pairing detail"
        className="min-h-0 overflow-hidden rounded-lg border border-border bg-background p-4"
        data-testid="bid-feedback-skeleton-detail"
      >
        <div className="flex items-center gap-2" aria-hidden="true">
          <div className="h-7 w-16 rounded-md bg-muted" />
          <div className="h-3 w-28 rounded-full bg-muted" />
          <div className="ml-auto h-7 w-20 rounded-md bg-muted" />
        </div>
        <div className="mt-3 h-2 w-72 max-w-full rounded-full bg-muted" aria-hidden="true" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-16 rounded-md border border-border bg-muted/40 p-3">
              <div className="h-2 w-10 rounded-full bg-muted" />
              <div className="mt-3 h-3 w-14 rounded-full bg-muted" />
            </div>
          ))}
        </div>
        {["h-16", "h-24"].map((height, index) => (
          <div key={`${height}:${index}`} className={cn("mt-3 rounded-md border border-border p-3", height)} aria-hidden="true">
            <div className="h-2 w-20 rounded-full bg-muted" />
            <div className="mt-3 h-3 w-3/4 rounded-full bg-muted" />
            {index === 2 ? <div className="mt-2 h-2 w-1/2 rounded-full bg-muted" /> : null}
          </div>
        ))}
      </section>
    </div>
  </div>
);

const PairingList = ({
  activeTab,
  pairings,
  selectedPairingId,
  onSelect,
  eligibilityChecking,
}: {
  activeTab: "award" | "avoid";
  pairings: PbsBidFeedbackPairing[];
  selectedPairingId: string | null;
  onSelect: (pairingId: string) => void;
  eligibilityChecking?: boolean;
}) => {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label={`${activeTab} pairings`}>
      <div
        className={cn(BID_FEEDBACK_TABLE_HEADER_CLASS, PAIRING_TABLE_GRID)}
        data-testid="bid-feedback-pairing-header"
        role="row"
      >
        <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="pairing" data-column-role="header">Pairing</span>
        <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="base" data-column-role="header">Base</span>
        <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="start" data-column-role="header">Start</span>
        <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="end" data-column-role="header">End</span>
        <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="days" data-column-role="header">Days</span>
        <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="credit" data-column-role="header">Credit</span>
        <span
          aria-hidden={activeTab === "avoid"}
          className="justify-self-center"
          data-column="eligibility"
          data-column-role="header"
        >
          {activeTab === "award" ? <span className="sr-only">Eligibility</span> : null}
        </span>
      </div>
      {pairings.map((pairing) => {
        const isSelected = pairing.pairingId === selectedPairingId;
        const eligibilityStatus = getEligibilityStatus(pairing);

        return (
          <button
            key={pairing.pairingId}
            aria-selected={isSelected}
            data-eligibility={activeTab === "award" ? eligibilityStatus : undefined}
            className={cn(
              BID_FEEDBACK_TABLE_ROW_CLASS,
              PAIRING_TABLE_GRID,
              activeTab === "award" && eligibilityStatus === "ineligible" && "bg-destructive/5 hover:bg-destructive/10",
              isSelected && "bg-primary/10 hover:bg-primary/10",
            )}
            role="option"
            type="button"
            onClick={() => onSelect(pairing.pairingId)}
          >
            <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "font-semibold text-primary")} data-column="pairing">{pairing.pairingNumber}</span>
            <span className={BID_FEEDBACK_ROW_CELL_CLASS} data-column="base">{displayValue(pairing.base)}</span>
            <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "tabular-nums")} data-column="start">{formatBidFeedbackTableDate(pairing.originDate)}</span>
            <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "tabular-nums")} data-column="end">{formatBidFeedbackTableDate(pairing.endDate)}</span>
            <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "tabular-nums")} data-column="days">{pairing.durationDays}</span>
            <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "tabular-nums")} data-column="credit">{formatCreditHours(pairing.totalCredit)}</span>
            <span aria-hidden={activeTab === "avoid"} className="justify-self-center" data-column="eligibility">
              {activeTab === "award" ? (
                eligibilityChecking && eligibilityStatus === "unknown" ? (
                  <span
                    aria-label="Checking eligibility"
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                    role="status"
                  />
                ) : (
                  <EligibilityMark status={eligibilityStatus} />
                )
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const PairingDetail = ({
  activeTab,
  pairing,
  eligibilitySummaryLabel,
}: {
  activeTab: "award" | "avoid";
  pairing: PbsBidFeedbackPairing;
  eligibilitySummaryLabel?: string;
}) => {
  const eligibilityStatus = getEligibilityStatus(pairing);
  const eligibilityTone = getEligibilityTone(eligibilityStatus);
  const eligibilityReasons = pairing.eligibility?.reasons ?? [];
  const eligibilitySummary = normalizeEligibilitySummary(eligibilitySummaryLabel);
  const route = pairing.routeLabel.split("-").map((airport) => airport.trim()).filter(Boolean);

  return (
    <div className="space-y-3" data-testid="bid-feedback-pairing-detail">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">{pairing.pairingNumber}</span>
        <span className="text-sm font-semibold text-foreground">{activeTab === "award" ? "Award Pairing" : "Avoid Pairing"}</span>
        {activeTab === "award" ? (
          <span className={cn(
            "ml-auto inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold",
            eligibilityBadgeClassName(eligibilityTone),
          )}>
            {eligibilityHeaderLabel(eligibilityStatus)}
          </span>
        ) : null}
      </div>

      <p className="m-0 text-xs text-muted-foreground">
        {pairing.originDate} {pairing.reportTime} – {pairing.endDate} {pairing.releaseTime} · local
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Rank", displayValue(pairing.rank)],
          ["Base", displayValue(pairing.base)],
          ["Days", displayValue(pairing.durationDays)],
          ["Credit", pairing.totalCredit ? formatCreditHours(pairing.totalCredit) : "—"],
          ["TAFB", displayValue(pairing.tafbDays)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="m-0 text-2xs font-semibold uppercase text-muted-foreground">{label}</p>
            <p className="m-0 mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {route.length > 1 ? (
        <div className="rounded-md border border-border px-3 py-2">
          <p className="m-0 text-2xs font-semibold uppercase text-muted-foreground">Route</p>
          <p className="m-0 mt-1 break-words text-sm font-semibold text-foreground">{route.join(" → ")}</p>
        </div>
      ) : null}

      {activeTab === "avoid" ? (
        <p className="m-0 rounded-md border border-border px-3 py-3 text-xs text-muted-foreground">
          Avoid bids are not eligibility-checked. Being unable to fly a pairing you asked to avoid is not a problem worth reporting.
        </p>
      ) : (
        <div className={cn(
          "rounded-md border px-3 py-3",
          eligibilityTone === "bad" ? "border-destructive/30 bg-destructive/5" : "border-border",
        )}>
          <p className="m-0 flex items-center gap-2 text-xs font-semibold text-foreground">
            Eligibility
            <span className={cn("rounded border px-1.5 py-0.5 text-2xs font-bold", eligibilityBadgeClassName(eligibilityTone))}>
              {eligibilityResultLabel(eligibilityStatus)}
            </span>
          </p>
          {eligibilityStatus === "eligible" ? (
            <p className="m-0 mt-2 text-xs text-emerald-800">
              Eligible for this crew. No blocking rule was returned by the rule engine.
            </p>
          ) : eligibilityStatus === "ineligible" ? (
            eligibilityReasons.length > 0 ? (
              <ul className="m-0 mt-2 space-y-2 pl-4 text-xs text-foreground">
                {eligibilityReasons.map((reason, index) => {
                  const meta = eligibilityReasonMeta(reason);
                  return (
                    <li key={`${reason.code}:${reason.ruleId ?? ""}:${index}`}>
                      <span>{reason.message || "Rule engine reported this pairing as not eligible."}</span>
                      {meta ? <span className="mt-0.5 block text-2xs text-muted-foreground">{meta}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="m-0 mt-2 text-xs text-destructive">
                Rule engine reported this pairing as not eligible, but no detailed reason was returned.
              </p>
            )
          ) : (
            eligibilityReasons.length > 0 ? (
              <ul className="m-0 mt-2 space-y-2 pl-4 text-xs text-muted-foreground">
                {eligibilityReasons.map((reason, index) => {
                  const meta = eligibilityReasonMeta(reason);
                  return (
                    <li key={`${reason.code}:${reason.ruleId ?? ""}:${index}`}>
                      <span>{reason.message || eligibilitySummary}</span>
                      {meta ? <span className="mt-0.5 block text-2xs text-muted-foreground">{meta}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="m-0 mt-2 text-xs text-muted-foreground">
                {eligibilitySummary}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
};

type DayOffRow = { item: PbsBidFeedbackDayOff; key: string };

const DaysOffList = ({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: DayOffRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) => (
  <div className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Days Off bids">
    <div className={cn(BID_FEEDBACK_TABLE_HEADER_CLASS, DAYS_OFF_TABLE_GRID)} data-testid="bid-feedback-days-off-header" role="row">
      <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="date" data-column-role="header">Date</span>
      <span className={BID_FEEDBACK_HEADER_CELL_CLASS} data-column="tier" data-column-role="header">Tier</span>
    </div>
    {rows.map((row) => {
      const isSelected = row.key === selectedKey;

      return (
        <button
          key={row.key}
          aria-selected={isSelected}
          className={cn(
            BID_FEEDBACK_TABLE_ROW_CLASS,
            DAYS_OFF_TABLE_GRID,
            isSelected && "bg-primary/10 hover:bg-primary/10",
          )}
          role="option"
          type="button"
          onClick={() => onSelect(row.key)}
        >
          <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "font-medium tabular-nums")} data-column="date">{displayValue(row.item.date)}</span>
          <span className={cn(BID_FEEDBACK_ROW_CELL_CLASS, "font-semibold text-primary")} data-column="tier">{row.item.tier}</span>
        </button>
      );
    })}
  </div>
);

const DaysOffDetail = ({ row }: { row: DayOffRow }) => (
  <div className="space-y-3" data-testid="bid-feedback-days-off-detail">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">{row.item.tier}</span>
      <span className="text-sm font-semibold text-foreground">Days Off Bid</span>
    </div>
    <p className="m-0 text-xs text-muted-foreground">
      {row.item.propertyName} · local
    </p>
    <div className="grid grid-cols-2 gap-2">
      {[
        ["Date", displayValue(row.item.date)],
        ["Tier", displayValue(row.item.tier)],
      ].map(([label, value]) => (
        <div key={label} className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="m-0 text-2xs font-semibold uppercase text-muted-foreground">{label}</p>
          <p className="m-0 mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      ))}
    </div>
    <div className="rounded-md border border-border px-3 py-2">
      <p className="m-0 text-2xs font-semibold uppercase text-muted-foreground">Description</p>
      <p className="m-0 mt-1 text-sm text-foreground">{row.item.description}</p>
    </div>
  </div>
);

export const BidFeedbackDialog = ({ data, isError, isLoading, onClose, onRetry }: BidFeedbackDialogProps) => {
  const [activeTab, setActiveTab] = useState<FeedbackTab>("award");
  const [activeView, setActiveView] = useState<FeedbackView>("bids");
  const [page, setPage] = useState(1);
  const [selectedPairingId, setSelectedPairingId] = useState<string | null>(null);
  const [selectedDayOffKey, setSelectedDayOffKey] = useState<string | null>(null);
  const [eligibilitySnapshot, setEligibilitySnapshot] = useState<{
    byPairingId: Map<string, PairingEligibility>;
    draftVersion: string;
  }>({ byPairingId: new Map(), draftVersion: "" });
  const allPairings = data?.pairings ?? [];
  const periodStart = data?.currentPeriod.rpStartLocal?.slice(0, 10) ?? "";
  const periodEnd = data?.currentPeriod.rpEndLocal?.slice(0, 10) ?? "";
  const periodPairings = allPairings.filter((pairing) => overlapsBidFeedbackPeriod(
    pairing.originDate,
    pairing.endDate,
    periodStart,
    periodEnd,
  ));
  const awardPairings = periodPairings.filter((pairing) => pairing.rawDirection === "award");
  const avoidPairings = periodPairings.filter((pairing) => pairing.rawDirection === "avoid");
  const visibleDaysOff = (data?.daysOff ?? []).filter((item) =>
    overlapsBidFeedbackPeriod(item.date, item.date, periodStart, periodEnd));
  const dayOffRows = visibleDaysOff.map((item) => ({
    item,
    key: item.date,
  })).sort((left, right) => (
    left.item.date.localeCompare(right.item.date)
    || BID_FEEDBACK_SORT_COLLATOR.compare(left.item.tier, right.item.tier)
    || BID_FEEDBACK_SORT_COLLATOR.compare(left.item.propertyName, right.item.propertyName)
    || BID_FEEDBACK_SORT_COLLATOR.compare(left.key, right.key)
  ));
  const pairings = activeTab === "award" ? awardPairings : activeTab === "avoid" ? avoidPairings : [];
  const pageCount = Math.max(1, Math.ceil(pairings.length / PAGE_SIZE));
  const visiblePairings = pairings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const eligibilityPairingIds = useMemo(() => {
    if (!data || activeTab !== "award") return [];

    return visiblePairings
      .map((pairing) => pairing.pairingId)
      .slice(0, pbsBidFeedbackEligibilityPairingLimit);
  }, [activeTab, data, visiblePairings]);
  const eligibilityQuery = useBidFeedbackEligibility(
    Boolean(data && !isLoading && !isError),
    data?.draftVersion ?? "",
    eligibilityPairingIds,
  );
  useEffect(() => {
    const draftVersion = data?.draftVersion ?? "";
    setEligibilitySnapshot((current) => {
      if (current.draftVersion === draftVersion) return current;
      return { byPairingId: new Map(), draftVersion };
    });
  }, [data?.draftVersion]);
  useEffect(() => {
    const draftVersion = data?.draftVersion ?? "";
    const rows = eligibilityQuery.data?.pairings ?? [];
    if (!draftVersion || rows.length === 0) return;

    setEligibilitySnapshot((current) => {
      const byPairingId = new Map(current.draftVersion === draftVersion ? current.byPairingId : undefined);
      let changed = current.draftVersion !== draftVersion;

      for (const pairing of rows) {
        if (byPairingId.get(pairing.pairingId) !== pairing.eligibility) {
          byPairingId.set(pairing.pairingId, pairing.eligibility);
          changed = true;
        }
      }

      return changed ? { byPairingId, draftVersion } : current;
    });
  }, [data?.draftVersion, eligibilityQuery.data]);
  const eligibilityByPairingId = useMemo(() => {
    const draftVersion = data?.draftVersion ?? "";
    const byPairingId = new Map(
      eligibilitySnapshot.draftVersion === draftVersion ? eligibilitySnapshot.byPairingId : undefined,
    );

    for (const pairing of eligibilityQuery.data?.pairings ?? []) {
      byPairingId.set(pairing.pairingId, pairing.eligibility);
    }

    return byPairingId;
  }, [data?.draftVersion, eligibilityQuery.data, eligibilitySnapshot]);
  const withEligibility = (pairing: PbsBidFeedbackPairing): PbsBidFeedbackPairing => {
    const eligibility = eligibilityByPairingId.get(pairing.pairingId);
    return eligibility ? { ...pairing, eligibility } : pairing;
  };
  const awardPairingsWithEligibility = awardPairings.map(withEligibility);
  const visiblePairingsWithEligibility = visiblePairings.map(withEligibility);
  const eligibilitySummaryLabel = eligibilityQuery.data?.eligibilityLabel ?? data?.eligibilityLabel;
  const selectedPairing = visiblePairingsWithEligibility.find((pairing) => pairing.pairingId === selectedPairingId) ?? null;
  const selectedDayOff = dayOffRows.find((row) => row.key === selectedDayOffKey) ?? null;

  const selectTab = (tab: FeedbackTab) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedPairingId(null);
    setSelectedDayOffKey(null);
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    setSelectedPairingId(null);
  };

  return (
    <PbsDialogFrame
      ariaLabel="Bid Feedback"
      bodyClassName="mt-4 flex min-h-0 flex-col overflow-hidden pr-0"
      panelClassName={cn(
        "w-[min(1180px,calc(100vw-32px))]",
        isLoading ? "h-auto" : "h-[min(760px,calc(100vh-32px))]",
      )}
      portalToBody
      testId="bid-feedback-dialog"
      header={(
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div>
            <h2 className="m-0 text-lg font-bold text-foreground">Bid Feedback</h2>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              {data ? `Crew ${data.crewId} · ${data.currentPeriod.periodCode} · ${data.timezoneLabel}` : "Current Bid Period"}
            </p>
          </div>
          <button
            aria-label="Close Bid Feedback"
            className="ml-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={onClose}
          >
            <XMarkIcon className="h-5 w-5 shrink-0" />
          </button>
        </div>
      )}
      onClose={onClose}
    >
      {isLoading ? <BidFeedbackSkeleton /> : null}
      {!isLoading && isError ? (
        <div aria-live="polite" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p className="m-0 text-sm font-semibold text-destructive">Bid Feedback could not be loaded.</p>
          <button className="mt-3 cursor-pointer rounded-md border border-destructive/40 bg-background px-3 py-2 text-xs font-semibold text-destructive" type="button" onClick={onRetry}>
            TRY AGAIN
          </button>
        </div>
      ) : null}
      {!isLoading && data ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {([
              ["award", `Award ${awardPairings.length}`],
              ["avoid", `Avoid ${avoidPairings.length}`],
              ["days-off", `Days Off ${dayOffRows.length}`],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                aria-selected={activeTab === tab}
                className={cn(
                  "h-8 cursor-pointer rounded-md border px-4 text-xs font-bold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeTab === tab
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
                role="tab"
                type="button"
                onClick={() => selectTab(tab)}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex rounded-md bg-muted p-1">
              {(["bids", "calendar"] as const).map((view) => (
                <button
                  key={view}
                  aria-pressed={activeView === view}
                  className={cn(
                    "cursor-pointer rounded-sm border-0 px-3 py-1.5 text-xs font-semibold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activeView === view ? "bg-background text-primary shadow-sm" : "bg-transparent text-muted-foreground",
                  )}
                  type="button"
                  onClick={() => {
                    setActiveView(view);
                    setPage(1);
                    setSelectedPairingId(null);
                  }}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          {activeView === "calendar" ? (
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border p-3">
              {data.currentPeriod.rpStartLocal && data.currentPeriod.rpEndLocal ? (
                <BidFeedbackCalendar pairings={awardPairingsWithEligibility} daysOff={visibleDaysOff} periodStart={periodStart} periodEnd={periodEnd} />
              ) : <p className="p-6 text-center text-sm text-muted-foreground">The Bid Period calendar range is unavailable.</p>}
            </div>
          ) : activeTab === "days-off" ? (
            dayOffRows.length > 0 ? (
              <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-[42fr_58fr] xl:overflow-hidden" data-testid="bid-feedback-master-detail">
                <section className="flex min-h-60 flex-col overflow-hidden rounded-lg border border-border" aria-label="Days Off list">
                  <DaysOffList rows={dayOffRows} selectedKey={selectedDayOff?.key ?? null} onSelect={setSelectedDayOffKey} />
                </section>
                <section className="min-h-60 overflow-y-auto rounded-lg border border-border bg-background p-4" aria-label="Selected Days Off detail">
                  {selectedDayOff
                    ? <DaysOffDetail row={selectedDayOff} />
                    : <p className="m-0 text-xs text-muted-foreground">Select a day off to view its bid.</p>}
                </section>
              </div>
            ) : <p className="mt-3 rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">No Days Off bids are active.</p>
          ) : pairings.length > 0 ? (
            <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-[42fr_58fr] xl:overflow-hidden" data-testid="bid-feedback-master-detail">
              <section className="flex min-h-60 flex-col overflow-hidden rounded-lg border border-border" aria-label={`${activeTab} Pairing list`}>
                <PairingList activeTab={activeTab} pairings={visiblePairingsWithEligibility} selectedPairingId={selectedPairing?.pairingId ?? null} onSelect={setSelectedPairingId} eligibilityChecking={eligibilityQuery.checking} />
                {pageCount > 1 ? (
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    <button className="cursor-pointer rounded-md border border-border px-3 py-1.5 disabled:cursor-default disabled:opacity-40" disabled={page === 1} type="button" onClick={() => changePage(page - 1)}>Previous</button>
                    <span>Page {page} of {pageCount}</span>
                    <button className="cursor-pointer rounded-md border border-border px-3 py-1.5 disabled:cursor-default disabled:opacity-40" disabled={page === pageCount} type="button" onClick={() => changePage(page + 1)}>Next</button>
                  </div>
                ) : null}
              </section>
              <section className="min-h-60 overflow-y-auto rounded-lg border border-border bg-background p-4" aria-label="Selected Pairing detail">
                {selectedPairing
                  ? <PairingDetail activeTab={activeTab} pairing={selectedPairing} eligibilitySummaryLabel={eligibilitySummaryLabel} />
                  : <p className="m-0 text-xs text-muted-foreground">Select a pairing to see whether this crew can be awarded it.</p>}
              </section>
            </div>
          ) : <p className="mt-3 rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">No pairings match this feedback view.</p>}
        </div>
      ) : null}
    </PbsDialogFrame>
  );
};
