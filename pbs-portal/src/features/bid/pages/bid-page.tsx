import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BidReviewPanel } from "@/features/bid/components/bid-review-panel";
import {
  buildBidPropertySummary,
  type BidSummaryProperty,
} from "@/features/bid/bid-property-summary";
import { BidFeedbackToolbarActions } from "@/features/bid/components/bid-feedback-toolbar-actions";
import { BidPropertySummaryView } from "@/features/bid/components/bid-property-summary-view";
import { resolveBidExistingPropertySummary } from "@/features/bid/bid-existing-property-summary";
import { DaysOffPage } from "@/features/days-off/pages/days-off-page";
import { useDaysOffPageData } from "@/features/days-off/hooks/use-days-off-page-data";
import { LinePage } from "@/features/line/pages/line-page";
import { useLinePageData } from "@/features/line/hooks/use-line-page-data";
import { PairingPage } from "@/features/pairing/pages/pairing-page";
import { usePairingPageData } from "@/features/pairing/hooks/use-pairing-page-data";
import { useReservePageData } from "@/features/reserve/hooks/use-reserve-page-data";
import { getReservePreferenceProperties } from "@/features/reserve/reserve-preference-property";
import {
  buildPairingAvailablePropertyFromExisting,
  buildPairingSearchPreviewProperty,
} from "@/features/pairing/pairing-property-transform";
import type { PairingSearchLocationState } from "@/features/pairing/types";
import {
  EFFICIENT_FLYING_PROPERTY_CODE,
  useEfficientFlyingConfig,
} from "@/features/pairing/efficient-flying-config";
import { PanelMessageState, PanelStripHeader } from "@/shared/components/panel";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";
import { TierDetailDialog, type TierDetailMutationState } from "@/features/tier/components/tier-detail-dialog";
import { SummaryItemRow } from "@/features/tier/components/tier-summary-sections";
import { useTierPageData } from "@/features/tier/hooks/use-tier-page-data";
import {
  deleteTierSummaryItem,
  getTierEditingErrorMessage,
  patchTierSummaryItemTiers,
} from "@/features/tier/tier-editing-actions";
import {
  resolveTierDetailViewModel,
  type TierDetailTarget,
} from "@/features/tier/tier-detail-selectors";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";
import type { TierSummaryItem } from "@/features/tier/types";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";

type BidAvailableTab = "favorited" | "days-off" | "pairing" | "line";
type ExistingEditRequest = {
  propertyId: string;
  tab: Exclude<BidAvailableTab, "favorited">;
};

const AVAILABLE_TABS: Array<{ key: BidAvailableTab; label: string }> = [
  { key: "favorited", label: "FAVORITED PROPERTIES" },
  { key: "days-off", label: "DAYS OFF" },
  { key: "pairing", label: "PAIRING" },
  { key: "line", label: "ROSTER" },
];

const uniqueSummaryItems = (items: TierSummaryItem[]) => {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.groupKey)) {
      return false;
    }

    seen.add(item.groupKey);
    return item.bidType === "DaysOff" || item.bidType === "Pairing" || item.bidType === "Line";
  });
};

const countFavorites = (properties: Array<{ source?: string }>) =>
  properties.filter((property) => property.source === "favorite").length;

const getActiveRuleBidTierLabels = (tiers: RuleBidExistingProperty["tiers"]) =>
  tiers
    .filter((tier) => tier.active)
    .map((tier) => tier.label);

const buildReserveSummaryItems = (
  properties: RuleBidExistingProperty[],
): TierSummaryItem[] => properties.flatMap((property) => {
  const tiers = getActiveRuleBidTierLabels(property.tiers);

  if (tiers.length === 0) {
    return [];
  }

  const summary = buildBidPropertySummary("line", property as BidSummaryProperty);

  return [{
    id: `reserve-${property.id}`,
    groupKey: property.id,
    bidType: "Line",
    action: property.action === "award"
      ? "Award"
      : property.action === "avoid"
        ? "Avoid"
        : undefined,
    label: property.name,
    readableText: summary.title,
    tiers,
    conditions: [],
    editableSource: {
      module: "Reserve",
      propertyGroupKey: property.id,
    },
    isEditable: true,
  }];
});

const toSummaryTierLabel = (calendarTierLabel: string) => {
  const match = calendarTierLabel.match(/^TIER-(\d+)$/i);

  if (!match) {
    return "T1";
  }

  return `T${Number.parseInt(match[1]!, 10)}`;
};

const FavoriteCategory = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="mb-5 last:mb-0">
    <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#8d93a5]">
      {title}
    </h3>
    {children}
  </section>
);

export const BidPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const daysOffQuery = useDaysOffPageData();
  const pairingQuery = usePairingPageData();
  const lineQuery = useLinePageData();
  const reserveQuery = useReservePageData();
  const tierQuery = useTierPageData();
  const activeCalendarTierLabel = useBiddingCalendarStore((state) => state.activeTierLabel);
  const [activeTab, setActiveTab] = useState<BidAvailableTab>(() => (
    (location.state as { availableTab?: string } | null)?.availableTab === "pairing"
      ? "pairing"
      : "favorited"
  ));
  const [searchKeyword, setSearchKeyword] = useState("");
  const [detailTarget, setDetailTarget] = useState<TierDetailTarget | null>(null);
  const [existingEditRequest, setExistingEditRequest] = useState<ExistingEditRequest | null>(null);
  const [detailMutationState, setDetailMutationState] = useState<TierDetailMutationState>({ status: "idle" });
  const availableListRef = useRef<HTMLDivElement | null>(null);
  const hasEfficientFlyingProperty = pairingQuery.data?.rightPanel.existingProperties.some(
    (property) => property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE,
  ) ?? false;
  const efficientFlyingConfigQuery = useEfficientFlyingConfig(hasEfficientFlyingProperty);
  const isLoading = daysOffQuery.isLoading
    || pairingQuery.isLoading
    || lineQuery.isLoading
    || reserveQuery.isLoading
    || tierQuery.isLoading;
  const hasError = !isLoading && (
    !daysOffQuery.data
    || !pairingQuery.data
    || !lineQuery.data
    || !reserveQuery.data
    || !tierQuery.data
  );
  const activeSummaryTier = toSummaryTierLabel(activeCalendarTierLabel);
  const reserveExistingProperties = useMemo(
    () => getReservePreferenceProperties(reserveQuery.data?.rightPanel.existingProperties ?? []),
    [reserveQuery.data?.rightPanel.existingProperties],
  );
  const reserveSummaryItems = useMemo(
    () => buildReserveSummaryItems(reserveExistingProperties),
    [reserveExistingProperties],
  );
  const allExistingItems = useMemo(
    () => uniqueSummaryItems([
      ...(tierQuery.data?.summaryGroups.flatMap((group) => group.items) ?? []),
      ...reserveSummaryItems,
    ]),
    [reserveSummaryItems, tierQuery.data?.summaryGroups],
  );
  const existingItems = useMemo(
    () => activeSummaryTier
      ? allExistingItems.filter((item) => item.tiers.includes(activeSummaryTier))
      : allExistingItems,
    [activeSummaryTier, allExistingItems],
  );
  const existingSummaryByGroupKey = useMemo(() => {
    const sources = {
      daysOff: daysOffQuery.data?.rightPanel.existingProperties ?? [],
      pairing: pairingQuery.data?.rightPanel.existingProperties ?? [],
      line: lineQuery.data?.rightPanel.existingProperties ?? [],
      reserve: reserveExistingProperties,
    };

    return new Map(existingItems.flatMap((item) => {
      const summary = resolveBidExistingPropertySummary(
        item,
        sources,
        daysOffQuery.data?.preferOffConfig,
        efficientFlyingConfigQuery.data,
      );
      return summary ? [[item.groupKey, summary] as const] : [];
    }));
  }, [
    daysOffQuery.data?.preferOffConfig,
    daysOffQuery.data?.rightPanel.existingProperties,
    efficientFlyingConfigQuery.data,
    existingItems,
    lineQuery.data?.rightPanel.existingProperties,
    pairingQuery.data?.rightPanel.existingProperties,
    reserveExistingProperties,
  ]);
  const detail = detailTarget && tierQuery.data
    ? resolveTierDetailViewModel(tierQuery.data, detailTarget)
    : null;
  const favoriteCounts = {
    daysOff: countFavorites(daysOffQuery.data?.rightPanel.availableProperties ?? []),
    pairing: countFavorites(pairingQuery.data?.rightPanel.availableProperties ?? []),
    line: countFavorites(lineQuery.data?.rightPanel.availableProperties ?? []),
    reserve: countFavorites(reserveQuery.data?.rightPanel.availableProperties ?? []),
  };
  const canEditBidByModule = {
    DaysOff: daysOffQuery.data?.rightPanel.draftMeta.currentPeriod?.canEditBid === true,
    Pairing: pairingQuery.data?.rightPanel.draftMeta.currentPeriod?.canEditBid === true,
    Line: lineQuery.data?.rightPanel.draftMeta.currentPeriod?.canEditBid === true,
    Reserve: reserveQuery.data?.rightPanel.draftMeta.currentPeriod?.canEditBid === true,
  } satisfies Record<NonNullable<TierSummaryItem["editableSource"]>["module"], boolean>;
  const totalFavorites = favoriteCounts.daysOff + favoriteCounts.pairing + favoriteCounts.line + favoriteCounts.reserve;
  const feedbackDraftVersionKey = [
    daysOffQuery.data?.rightPanel.draftMeta.draftVersion ?? "missing",
    pairingQuery.data?.rightPanel.draftMeta.draftVersion ?? "missing",
    lineQuery.data?.rightPanel.draftMeta.draftVersion ?? "missing",
    reserveQuery.data?.rightPanel.draftMeta.draftVersion ?? "missing",
  ].join(":");

  const changeTab = (tab: BidAvailableTab) => {
    setActiveTab(tab);
    setSearchKeyword("");
    if (availableListRef.current) {
      availableListRef.current.scrollTop = 0;
    }
  };

  const openDetail = (item: TierSummaryItem) => {
    if (item.isEditable && item.editableSource) {
      const tabByModule = {
        DaysOff: "days-off",
        Pairing: "pairing",
        Line: "line",
        Reserve: "line",
      } as const;
      const tab = tabByModule[item.editableSource.module];

      setActiveTab(tab);
      setSearchKeyword("");
      setExistingEditRequest({
        propertyId: item.editableSource.propertyGroupKey,
        tab,
      });
      return;
    }

    setDetailMutationState({ status: "idle" });
    setDetailTarget({
      kind: "summaryItem",
      itemId: item.id,
      groupKey: item.groupKey,
    });
  };

  const saveDetailTiers = async (item: TierSummaryItem, tiers: string[]) => {
    setDetailMutationState({ status: "saving" });

    try {
      await patchTierSummaryItemTiers(item, tiers);
      await Promise.all([
        tierQuery.refetch(),
        daysOffQuery.refetch(),
        pairingQuery.refetch(),
        lineQuery.refetch(),
        reserveQuery.refetch(),
      ]);
      setDetailMutationState({ status: "idle" });
      setDetailTarget(null);
    } catch (error) {
      const message = getTierEditingErrorMessage(error);
      setDetailMutationState({ status: "error", message });
      throw error;
    }
  };

  const deleteDetailBid = async (item: TierSummaryItem) => {
    setDetailMutationState({ status: "deleting" });

    try {
      await deleteTierSummaryItem(item);
      await Promise.all([
        tierQuery.refetch(),
        daysOffQuery.refetch(),
        pairingQuery.refetch(),
        lineQuery.refetch(),
        reserveQuery.refetch(),
      ]);
      setDetailMutationState({ status: "idle" });
      setDetailTarget(null);
    } catch (error) {
      const message = getTierEditingErrorMessage(error);
      setDetailMutationState({ status: "error", message });
      throw error;
    }
  };

  const openAllPairings = () => {
    const draftMeta = pairingQuery.data?.rightPanel.draftMeta;

    if (!draftMeta) {
      return;
    }

    const searchState: PairingSearchLocationState = {
      previewMode: "all-pairings",
      draftMeta: { ...draftMeta },
    };

    navigate("/bid/pairing/search", { state: searchState });
  };

  const previewPairingProperty = (item: TierSummaryItem) => {
    const propertyGroupKey = item.editableSource?.propertyGroupKey;
    const property = pairingQuery.data?.rightPanel.existingProperties.find(
      (candidate) => candidate.id === propertyGroupKey,
    );
    const draftMeta = pairingQuery.data?.rightPanel.draftMeta;

    if (!property || !draftMeta) {
      return;
    }

    const searchState: PairingSearchLocationState = {
      previewProperty: buildPairingSearchPreviewProperty(
        buildPairingAvailablePropertyFromExisting(property),
      ),
      previewSource: {
        type: "existing",
        propertyGroupKey: property.id,
      },
      draftMeta: { ...draftMeta },
    };

    navigate("/bid/pairing/search", { state: searchState });
  };

  if (isLoading) {
    return (
      <section
        aria-busy="true"
        className="min-h-full rounded-3xl bg-white px-6 py-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
        data-testid="bid-page-loading"
      >
        <PanelStripHeader title="BID" />
        <p className="mt-5 text-sm text-[#6f7485]">Loading current bid...</p>
      </section>
    );
  }

  if (hasError || !tierQuery.data) {
    return (
      <PanelMessageState
        message="Unable to load the current bid."
        testId="bid-page-error"
        title="BID"
      />
    );
  }

  return (
    <section
      className="flex h-[var(--portal-page-shell-height)] max-h-[var(--portal-page-shell-height)] min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl bg-white px-6 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
      data-testid="bid-page"
      data-uiid="bid-page"
    >
      <PanelStripHeader title="EXISTING BID PROPERTIES" />
      <PairingPage presentation={{
        toolbarOnly: true,
        toolbarActions: <BidFeedbackToolbarActions draftVersionKey={feedbackDraftVersionKey} />,
      }} />
      <BidReviewPanel activeTier={activeSummaryTier} data={tierQuery.data} />
      <p
        className="mt-3 text-xs font-semibold uppercase tracking-[0.04em] text-[#6f7485]"
        data-testid="bid-existing-tier-filter-label"
      >
        {`${activeSummaryTier} only`}
        <span className="ml-2 font-medium normal-case tracking-normal text-[#8a90a0]">
          {existingItems.length} {existingItems.length === 1 ? "bid" : "bids"}
        </span>
      </p>

      <div
        className="mt-3 max-h-[330px] min-h-0 shrink-0 overscroll-contain overflow-y-auto rounded-xl border border-[#e4e8f1]"
        data-testid="bid-existing-properties-scroll"
      >
        {existingItems.length > 0 ? (
          existingItems.map((item) => (
            <SummaryItemRow
              key={item.groupKey}
              item={item}
              onDelete={
                item.isEditable
                && item.editableSource
                && canEditBidByModule[item.editableSource.module]
                  ? deleteDetailBid
                  : undefined
              }
              onOpenDetail={openDetail}
              onPreview={item.isEditable && item.bidType === "Pairing"
                ? previewPairingProperty
                : undefined}
              reserveActionsSpace
              summary={existingSummaryByGroupKey.has(item.groupKey) ? (
                <BidPropertySummaryView
                  ariaLabel={`${item.label} bid summary`}
                  summary={existingSummaryByGroupKey.get(item.groupKey)!}
                  variant="tier"
                />
              ) : undefined}
            />
          ))
        ) : (
          <p className="px-4 py-5 text-sm text-[#6f7485]">
            {`No bid properties are attached to ${activeSummaryTier}.`}
          </p>
        )}
      </div>

      <div
        className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="bid-available-properties"
      >
        <PanelStripHeader title="ADD BID PROPERTIES" />

        <div aria-label="Bid property categories" className="mt-3 flex items-center gap-8 border-b border-[#dfe3eb]" role="tablist">
          {AVAILABLE_TABS.map((tab) => (
            <button
              key={tab.key}
              aria-selected={activeTab === tab.key}
              className={cn(
                "relative cursor-pointer border-0 bg-transparent pb-3 text-sm font-medium leading-[18px] text-[#6f7485]",
                activeTab === tab.key
                  ? "font-bold text-[#6467d1] after:absolute after:bottom-0 after:left-[-10px] after:right-[-10px] after:h-[3px] after:rounded-full after:bg-[#6467d1] after:content-['']"
                  : "",
              )}
              role="tab"
              type="button"
              onClick={() => changeTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-3">
          {activeTab === "pairing" ? (
            <Button
              className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-[14px] text-xs font-semibold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
              type="button"
              variant="ghost"
              onClick={openAllPairings}
            >
              ALL PAIRINGS
            </Button>
          ) : null}
          <div className="relative w-[270px]">
            <Input
              className="h-[30px] rounded-lg border-[#cfd6e4] bg-white pr-9 text-sm text-[#6f7485] shadow-none placeholder:text-[#c5c9d3] focus-visible:ring-0"
              placeholder="Search Bid Properties"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <MagnifyingGlassIcon className="pointer-events-none absolute right-[10px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7f8392]" />
          </div>
        </div>

        <div
          ref={availableListRef}
          className="mt-4 min-h-0 flex-1 overscroll-contain overflow-y-auto pb-4 pr-1"
          data-testid="bid-available-properties-scroll"
          role="tabpanel"
        >
          {activeTab === "favorited" ? (
            totalFavorites === 0 ? (
              <p className="rounded-xl border border-dashed border-[#d8dde6] px-4 py-5 text-sm text-[#6f7485]">
                No favorite properties match the current search.
              </p>
            ) : (
              <>
                {favoriteCounts.daysOff > 0 ? (
                  <FavoriteCategory title="Days Off">
                    <DaysOffPage presentation={{ availableOnly: true, availableTab: "favorited", searchKeyword }} />
                  </FavoriteCategory>
                ) : null}
                {favoriteCounts.pairing > 0 ? (
                  <FavoriteCategory title="Pairing">
                    <PairingPage presentation={{ availableOnly: true, availableTab: "favorited", searchKeyword }} />
                  </FavoriteCategory>
                ) : null}
                {favoriteCounts.line + favoriteCounts.reserve > 0 ? (
                  <FavoriteCategory title="Roster">
                    <LinePage
                      presentation={{ availableOnly: true, availableTab: "favorited", searchKeyword }}
                      reserveData={reserveQuery.data}
                    />
                  </FavoriteCategory>
                ) : null}
              </>
            )
          ) : null}
          {activeTab === "days-off" ? (
            <DaysOffPage
              presentation={{
                availableOnly: true,
                availableTab: "all",
                requestedExistingPropertyId: existingEditRequest?.tab === "days-off"
                  ? existingEditRequest.propertyId
                  : null,
                searchKeyword,
                onRequestedExistingPropertyHandled: () => setExistingEditRequest(null),
              }}
            />
          ) : null}
          {activeTab === "pairing" ? (
            <PairingPage
              presentation={{
                availableOnly: true,
                availableTab: "all",
                requestedExistingPropertyId: existingEditRequest?.tab === "pairing"
                  ? existingEditRequest.propertyId
                  : null,
                searchKeyword,
                onRequestedExistingPropertyHandled: () => setExistingEditRequest(null),
              }}
            />
          ) : null}
          {activeTab === "line" ? (
            <LinePage
              reserveData={reserveQuery.data}
              presentation={{
                availableOnly: true,
                availableTab: "all",
                requestedExistingPropertyId: existingEditRequest?.tab === "line"
                  ? existingEditRequest.propertyId
                  : null,
                searchKeyword,
                onRequestedExistingPropertyHandled: () => setExistingEditRequest(null),
              }}
            />
          ) : null}
        </div>
      </div>

      {detail ? (
        <TierDetailDialog
          detail={detail}
          mutationState={detailMutationState}
          onClose={() => {
            setDetailTarget(null);
            setDetailMutationState({ status: "idle" });
          }}
          onDeleteBid={deleteDetailBid}
          onSaveTiers={saveDetailTiers}
          onSelectItem={openDetail}
        />
      ) : null}
    </section>
  );
};
