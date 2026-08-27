import { useCallback, useState, type ReactNode } from "react";
import type { PbsStandingBidMode } from "../../../../../packages/contracts/pbs-standing-bids.js";
import { BidPropertySummaryView } from "@/features/bid/components/bid-property-summary-view";
import {
  EFFICIENT_FLYING_PROPERTY_CODE,
  useEfficientFlyingConfig,
} from "@/features/pairing/efficient-flying-config";
import { RuleBidRightPanel } from "@/features/rule-bids/components/rule-bid-right-panel";
import { RuleBidRightPanelLoading } from "@/features/rule-bids/components/rule-bid-right-panel-loading";
import { buildRuleBidExistingPropertyFromAvailable } from "@/features/rule-bids/utils";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { StandingBidPropertyDialog } from "@/features/standing-bid/components/standing-bid-property-dialog";
import {
  standingBidPageDataQueryKey,
  useStandingBidPageData,
} from "@/features/standing-bid/hooks/use-standing-bid-page-data";
import {
  buildMixedLineShortCallPropertyGroupKey,
  getMixedLineAdditionalProperties,
  isMixedLineBidProperty,
  MIXED_LINE_SHORT_CALL_PROPERTY_CODE,
  withMixedLineAdditionalProperties,
} from "@/features/line/mixed-line-bid";
import {
  mapStandingBidResponseToPageData,
  type StandingBidPageData,
} from "@/features/standing-bid/standing-bid-draft-mappers";
import { buildStandingBidPropertySummary } from "@/features/standing-bid/standing-bid-property-summary";
import { PanelMessageState } from "@/shared/components/panel";
import { ScaledPageCanvas } from "@/shared/components/layout/scaled-page-canvas";
import { queryClient } from "@/shared/query/query-client";
import { standingBidService } from "@/shared/services/standing-bid-service";

const STANDING_EXISTING_TIER_FILTERS = ["ALL", "T1", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
type StandingExistingTierFilter = typeof STANDING_EXISTING_TIER_FILTERS[number];

const StandingBidTierFilter = ({
  value,
  onChange,
}: {
  value: StandingExistingTierFilter;
  onChange: (value: StandingExistingTierFilter) => void;
}) => (
  <fieldset
    aria-label="Filter existing Standing Bid by tier"
    className="flex min-w-0 flex-nowrap items-center gap-2"
  >
    {STANDING_EXISTING_TIER_FILTERS.map((tier) => (
      <label key={tier} className="cursor-pointer">
        <input
          checked={value === tier}
          className="peer sr-only"
          name="standing-existing-tier-filter"
          type="radio"
          value={tier}
          onChange={() => onChange(tier)}
        />
        <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-bold leading-4 text-[#6f7485] transition hover:border-[#8b8ce4] hover:text-[#5f5ccc] peer-checked:border-[#706cd5] peer-checked:bg-[#706cd5] peer-checked:text-white peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[#8f93ff] peer-focus-visible:ring-offset-1">
          {tier}
        </span>
      </label>
    ))}
  </fieldset>
);

const buildStandingAvailablePropertyFromExisting = (
  property: RuleBidExistingProperty,
): RuleBidAvailableProperty => ({
  ...property,
  favorited: false,
});

const buildStandingExistingPropertyFromDialogDraft = (
  sourceProperty: RuleBidExistingProperty,
  draft: RuleBidAvailableProperty,
): RuleBidExistingProperty => {
  const buildExistingProperty = (
    draftProperty: RuleBidAvailableProperty,
    fallbackId: string,
  ): RuleBidExistingProperty => {
    const isMixedLineShortCall = draftProperty.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
      && draftProperty.sourceContext === "reserve";

    return {
      ...sourceProperty,
      id: isMixedLineShortCall
        ? buildMixedLineShortCallPropertyGroupKey(draftProperty.id || fallbackId)
        : fallbackId,
      propertyCode: draftProperty.propertyCode,
      name: draftProperty.name,
      action: draftProperty.action ?? null,
      bid: draftProperty.bid,
      tiers: draftProperty.tiers,
      categoryLabel: draftProperty.categoryLabel ?? sourceProperty.categoryLabel,
      categorySortOrder: draftProperty.categorySortOrder ?? sourceProperty.categorySortOrder,
      sourceContext: draftProperty.sourceContext ?? sourceProperty.sourceContext,
    };
  };

  return withMixedLineAdditionalProperties(
    buildExistingProperty(draft, sourceProperty.id),
    getMixedLineAdditionalProperties(draft).map((additionalProperty) =>
      buildExistingProperty(additionalProperty, additionalProperty.id)),
  );
};

const getActiveTierLabels = (property: RuleBidExistingProperty) =>
  property.tiers.filter((tier) => tier.active).map((tier) => tier.label);

const validateStandingProperties = (properties: RuleBidExistingProperty[]) => properties.flatMap((property) => {
  const errors: string[] = [];
  const activeTiers = getActiveTierLabels(property);

  if (activeTiers.length === 0) {
    errors.push(`${property.name} requires at least one tier.`);
  }

  if (property.bid.type === "tag-list" && property.bid.values.length === 0) {
    errors.push(`${property.name} requires at least one value.`);
  }

  if (property.bid.type === "date-or-dow-list" && property.bid.daysOfWeek.length === 0) {
    errors.push(`${property.name} requires at least one day of week.`);
  }

  if (property.bid.type === "time-condition-list" && property.bid.conditions.length === 0) {
    errors.push(`${property.name} requires at least one time condition.`);
  }

  return errors;
});

const StandingBidCanvas = ({ children }: { children: ReactNode }) => (
  <ScaledPageCanvas
    canvasTestId="standing-bid-page-canvas"
    designHeight={968}
    designWidth={1888}
    viewportTestId="standing-bid-page-viewport"
  >
    {children}
  </ScaledPageCanvas>
);

const StandingBidLayout = ({ children }: { children: ReactNode }) => (
  <div
    className="h-[var(--portal-page-shell-height)] min-h-0 overflow-hidden"
    data-testid="standing-bid-page-layout"
  >
    {children}
  </div>
);

const getContextProperties = (
  properties: RuleBidExistingProperty[],
  mode: PbsStandingBidMode,
) => properties.filter((property) => property.sourceContext === mode);

const buildStandingExistingPropertyFromAvailable = (
  property: RuleBidAvailableProperty,
): RuleBidExistingProperty => ({
  ...buildRuleBidExistingPropertyFromAvailable(property, property.id),
  categoryLabel: property.categoryLabel,
  categorySortOrder: property.categorySortOrder,
  sourceContext: property.sourceContext,
});

export const StandingBidPage = () => {
  const [existingTierFilter, setExistingTierFilter] =
    useState<StandingExistingTierFilter>("ALL");
  const { data, isLoading } = useStandingBidPageData();
  const hasEfficientFlyingProperty = data?.rightPanel.existingProperties.some(
    (property) => property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE,
  ) ?? false;
  const efficientFlyingConfigQuery = useEfficientFlyingConfig(hasEfficientFlyingProperty);
  const filterExistingProperties = useCallback(
    (properties: RuleBidExistingProperty[]) => existingTierFilter === "ALL"
      ? properties
      : properties.filter((property) => getActiveTierLabels(property).includes(existingTierFilter)),
    [existingTierFilter],
  );
  const renderExistingToolbar = useCallback(
    () => (
      <StandingBidTierFilter
        value={existingTierFilter}
        onChange={setExistingTierFilter}
      />
    ),
    [existingTierFilter],
  );

  const saveContextDraft = useCallback(async (
    mode: PbsStandingBidMode,
    properties: RuleBidExistingProperty[],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await standingBidService.saveDraft(mode, properties, draftMeta);
    const savedPageData = mapStandingBidResponseToPageData(response);
    const savedDraft = mode === "lineholder" ? response.lineholderDraft : response.reserveDraft;

    return {
      savedDraft,
      savedPageData,
    };
  }, []);

  const handleAddProperty = useCallback(async (
    property: RuleBidAvailableProperty,
    _draftMeta: RuleBidRightPanelData["draftMeta"],
    nextProperty: RuleBidExistingProperty,
  ) => {
    if (!data || !nextProperty.sourceContext) {
      throw new Error("Standing Bid source context is unavailable.");
    }

    const additionalProperties = getMixedLineAdditionalProperties(property)
      .map(buildStandingExistingPropertyFromAvailable)
      .filter((additionalProperty) => Boolean(additionalProperty.sourceContext));
    const propertiesToAdd = [nextProperty, ...additionalProperties];
    let workingPageData = data;
    let primarySavedPropertyGroupKey = nextProperty.id;
    let primarySavedRowSeq = 1;
    let latestDraftVersion = data.contexts[nextProperty.sourceContext].draftMeta.draftVersion;

    for (const mode of ["lineholder", "reserve"] as const) {
      const modePropertiesToAdd = propertiesToAdd.filter((propertyToAdd) =>
        propertyToAdd.sourceContext === mode);

      if (modePropertiesToAdd.length === 0) {
        continue;
      }

      const existingContextProperties = getContextProperties(workingPageData.rightPanel.existingProperties, mode);
      const contextProperties = [
        ...existingContextProperties,
        ...modePropertiesToAdd,
      ];
      const { savedDraft, savedPageData } = await saveContextDraft(
        mode,
        contextProperties,
        workingPageData.contexts[mode].draftMeta,
      );
      const primaryIndexInMode = modePropertiesToAdd.findIndex((propertyToAdd) =>
        propertyToAdd.id === nextProperty.id);

      if (primaryIndexInMode >= 0) {
        const primaryRowSeq = existingContextProperties.length + primaryIndexInMode + 1;
        const savedProperty = savedDraft.properties.find((property) =>
          property.rowSeq === primaryRowSeq);
        primarySavedPropertyGroupKey = savedProperty?.propertyGroupKey ?? nextProperty.id;
        primarySavedRowSeq = savedProperty?.rowSeq ?? primaryRowSeq;
      }

      latestDraftVersion = savedDraft.draftVersion;
      workingPageData = savedPageData;
    }

    return {
      draftVersion: latestDraftVersion,
      propertyGroupKey: primarySavedPropertyGroupKey,
      rowSeq: primarySavedRowSeq,
      onCommitted: () => {
        queryClient.setQueryData<StandingBidPageData>(
          standingBidPageDataQueryKey,
          workingPageData,
        );
      },
    };
  }, [data, saveContextDraft]);

  const handleUpdateProperty = useCallback(async (
    propertyGroupKey: string,
    nextProperty: RuleBidExistingProperty,
  ) => {
    if (!data || !nextProperty.sourceContext) {
      throw new Error("Standing Bid source context is unavailable.");
    }

    const sourceProperty = data.rightPanel.existingProperties.find(
      (property) => property.id === propertyGroupKey,
    );

    if (!sourceProperty?.sourceContext) {
      throw new Error("Standing Bid source context is unavailable.");
    }

    const mode = nextProperty.sourceContext;
    const additionalProperties = getMixedLineAdditionalProperties(nextProperty)
      .filter((property) => Boolean(property.sourceContext));
    const saveAdditionalProperties = async (
      initialPageData: StandingBidPageData,
      propertiesToAdd: RuleBidExistingProperty[],
    ) => {
      let workingPageData = initialPageData;
      let latestDraftVersion = initialPageData.contexts[mode].draftMeta.draftVersion;

      for (const contextMode of ["lineholder", "reserve"] as const) {
        const contextPropertiesToAdd = propertiesToAdd.filter((propertyToAdd) =>
          propertyToAdd.sourceContext === contextMode);

        if (contextPropertiesToAdd.length === 0) {
          continue;
        }

        const contextProperties = [
          ...getContextProperties(workingPageData.rightPanel.existingProperties, contextMode),
          ...contextPropertiesToAdd,
        ];
        const save = await saveContextDraft(
          contextMode,
          contextProperties,
          workingPageData.contexts[contextMode].draftMeta,
        );

        latestDraftVersion = save.savedDraft.draftVersion;
        workingPageData = save.savedPageData;
      }

      return {
        latestDraftVersion,
        workingPageData,
      };
    };

    if (sourceProperty.sourceContext !== mode) {
      const sourceContextProperties = getContextProperties(data.rightPanel.existingProperties, sourceProperty.sourceContext)
        .filter((property) => property.id !== propertyGroupKey);
      const sourceSave = await saveContextDraft(
        sourceProperty.sourceContext,
        sourceContextProperties,
        data.contexts[sourceProperty.sourceContext].draftMeta,
      );
      const targetContextProperties = [
        ...getContextProperties(sourceSave.savedPageData.rightPanel.existingProperties, mode),
        nextProperty,
        ...additionalProperties.filter((property) => property.sourceContext === mode),
      ];
      const targetSave = await saveContextDraft(
        mode,
        targetContextProperties,
        sourceSave.savedPageData.contexts[mode].draftMeta,
      );
      const additionalSave = await saveAdditionalProperties(
        targetSave.savedPageData,
        additionalProperties.filter((property) => property.sourceContext !== mode),
      );

      return {
        draftVersion: additionalSave.latestDraftVersion || targetSave.savedDraft.draftVersion,
        onCommitted: () => {
          queryClient.setQueryData<StandingBidPageData>(
            standingBidPageDataQueryKey,
            additionalSave.workingPageData,
          );
        },
      };
    }

    const contextProperties = getContextProperties(data.rightPanel.existingProperties, mode)
      .map((property) => property.id === propertyGroupKey ? nextProperty : property)
      .concat(additionalProperties.filter((property) => property.sourceContext === mode));
    const contextSave = await saveContextDraft(
      mode,
      contextProperties,
      data.contexts[mode].draftMeta,
    );
    const additionalSave = await saveAdditionalProperties(
      contextSave.savedPageData,
      additionalProperties.filter((property) => property.sourceContext !== mode),
    );

    return {
      draftVersion: additionalSave.latestDraftVersion || contextSave.savedDraft.draftVersion,
      onCommitted: () => {
        queryClient.setQueryData<StandingBidPageData>(
          standingBidPageDataQueryKey,
          additionalSave.workingPageData,
        );
      },
    };
  }, [data, saveContextDraft]);

  const handleDeleteProperty = useCallback(async (
    propertyGroupKey: string,
  ) => {
    if (!data) {
      throw new Error("Standing Bid data is unavailable.");
    }

    const sourceProperty = data.rightPanel.existingProperties.find(
      (property) => property.id === propertyGroupKey,
    );

    if (!sourceProperty?.sourceContext) {
      throw new Error("Standing Bid source context is unavailable.");
    }

    const mode = sourceProperty.sourceContext;
    const contextProperties = getContextProperties(data.rightPanel.existingProperties, mode)
      .filter((property) => property.id !== propertyGroupKey);
    const { savedDraft, savedPageData } = await saveContextDraft(
      mode,
      contextProperties,
      data.contexts[mode].draftMeta,
    );

    return {
      draftVersion: savedDraft.draftVersion,
      onCommitted: () => {
        queryClient.setQueryData<StandingBidPageData>(
          standingBidPageDataQueryKey,
          savedPageData,
        );
      },
    };
  }, [data, saveContextDraft]);

  const reloadStandingBid = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: standingBidPageDataQueryKey });
  }, []);

  if (isLoading) {
    return (
      <StandingBidCanvas>
        <StandingBidLayout>
          <div className="h-full min-h-0">
            <RuleBidRightPanelLoading
              addButtonLabel="ADD STANDING BID"
              statusLabel="Loading Standing Bid..."
              testId="standing-bid-page-loading"
              title="EXISTING STANDING BID"
            />
          </div>
        </StandingBidLayout>
      </StandingBidCanvas>
    );
  }

  if (!data) {
    return (
      <StandingBidCanvas>
        <StandingBidLayout>
          <div className="h-full min-h-0">
            <PanelMessageState
              message="Unable to load Standing Bid."
              testId="standing-bid-page-error"
              title="STANDING BID"
            />
          </div>
        </StandingBidLayout>
      </StandingBidCanvas>
    );
  }

  return (
    <StandingBidCanvas>
      <StandingBidLayout>
        <RuleBidRightPanel
          availableCategoryFilterVariant="bid-tabs"
          data={data.rightPanel}
          existingEmptyMessage={existingTierFilter === "ALL"
            ? undefined
            : `No saved Standing Bid properties in ${existingTierFilter}.`}
          existingBidEditMode="dialog"
          existingListVariant="bid-list"
          filterExistingProperties={filterExistingProperties}
          mergeSamePropertyTiersOnAdd
          showAddShortcut={false}
          showFavoritePropertiesTab={false}
          renderAvailablePropertyAddDialog={(props) => (
            <StandingBidPropertyDialog
              {...props}
              currentPeriod={data.rightPanel.draftMeta.currentPeriod}
              preferOffConfig={data.preferOffConfig}
              requireExplicitSelections
            />
          )}
          renderExistingToolbar={renderExistingToolbar}
          renderExistingBidSummary={(property) => (
            <BidPropertySummaryView
              ariaLabel={`${property.name} bid summary`}
              summary={buildStandingBidPropertySummary(
                property,
                data.preferOffConfig,
                efficientFlyingConfigQuery.data,
              )}
              variant="tier"
            />
          )}
          renderExistingPropertyEditDialog={({ property, onCancel, onConfirm, onRemove, ...dialogProps }) => (
            <StandingBidPropertyDialog
              {...dialogProps}
              confirmLabel="UPDATE BID"
              confirmPendingLabel="UPDATING..."
              currentPeriod={data.rightPanel.draftMeta.currentPeriod}
              preferOffConfig={data.preferOffConfig}
              property={buildStandingAvailablePropertyFromExisting(property)}
              onCancel={onCancel}
              onConfirm={(draft) => onConfirm(buildStandingExistingPropertyFromDialogDraft(property, draft))}
              onRemove={isMixedLineBidProperty(property) ? onRemove : undefined}
            />
          )}
          shouldConfigureAvailableProperty={() => true}
          shouldReplaceExistingPropertyNameWithSummary={() => true}
          shouldShowExistingEditAction={() => true}
          validateExistingProperties={validateStandingProperties}
          viewportBound
          onAddProperty={handleAddProperty}
          onDeleteProperty={handleDeleteProperty}
          onReloadDraft={reloadStandingBid}
          onUpdateProperty={handleUpdateProperty}
        />
      </StandingBidLayout>
    </StandingBidCanvas>
  );
};
