import type {
  PbsDaysOffDraftMutationResponse,
  PbsDaysOffDraftPropertyMutationResponse,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { CalendarDayOffAction, CalendarDraftResponse } from "@/features/dashboard/dashboard-calendar-state";
import {
  buildCalendarDraftFromDaysOffPageData,
  buildPreferOffCalendarTargetProperties,
  isCalendarManagedPreferOffProperty,
} from "@/features/days-off/days-off-calendar-prefer-off";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { daysOffService } from "@/shared/services/days-off-service";
import { runCurrentBidMutation } from "@/features/bid/current-bid-draft-meta";

type DaysOffDraftMeta = RuleBidRightPanelData["draftMeta"];
type DaysOffPropertyMutationResponse =
  | PbsDaysOffDraftMutationResponse
  | PbsDaysOffDraftPropertyMutationResponse;

type SaveDaysOffCalendarActionOptions = {
  currentDraft: CalendarDraftResponse;
  action: CalendarDayOffAction;
  blockedTiersByDate: Map<string, Set<string>>;
  pageData: RuleBidPageData;
};

type SaveDaysOffCalendarActionResult = {
  draftMeta: DaysOffDraftMeta;
  savedTargetProperties: RuleBidExistingProperty[];
  patchedPageData: RuleBidPageData;
  patchedDraft: CalendarDraftResponse;
};

const buildDaysOffCalendarAvailableProperty = (
  property: RuleBidExistingProperty,
): RuleBidAvailableProperty => ({
  id: `calendar-${property.id}`,
  propertyCode: property.propertyCode,
  name: property.name,
  favorited: false,
  bid: property.bid,
  tiers: property.tiers,
  allOrNothing: property.allOrNothing,
  minimumN: property.minimumN,
  maximumN: property.maximumN,
});

const areRuleBidTiersEqual = (
  left: RuleBidExistingProperty["tiers"],
  right: RuleBidExistingProperty["tiers"],
) => JSON.stringify(left) === JSON.stringify(right);

const areRuleBidValuesEqual = (
  left: RuleBidExistingProperty["bid"],
  right: RuleBidExistingProperty["bid"],
) => JSON.stringify(left) === JSON.stringify(right);

const shouldPatchCalendarPreferOffProperty = (
  currentProperty: RuleBidExistingProperty,
  targetProperty: RuleBidExistingProperty,
) => !areRuleBidValuesEqual(currentProperty.bid, targetProperty.bid)
  || !areRuleBidTiersEqual(currentProperty.tiers, targetProperty.tiers);

const mergeDraftMeta = (
  draftMeta: DaysOffDraftMeta,
  response: DaysOffPropertyMutationResponse,
): DaysOffDraftMeta => ({
  ...draftMeta,
  draftKey: response.draftKey ?? draftMeta.draftKey,
  bidId: response.bidId ?? draftMeta.bidId,
  periodId: response.periodId !== undefined ? response.periodId : draftMeta.periodId,
  periodCode: response.periodCode ?? draftMeta.periodCode,
  draftVersion: response.draftVersion ?? draftMeta.draftVersion,
});

export const patchDaysOffPageDataWithCalendarProperties = (
  pageData: RuleBidPageData,
  draftMeta: DaysOffDraftMeta,
  savedTargetProperties: RuleBidExistingProperty[],
): RuleBidPageData => ({
  ...pageData,
  rightPanel: {
    ...pageData.rightPanel,
    draftMeta,
    existingProperties: [
      ...pageData.rightPanel.existingProperties.filter((property) =>
        !isCalendarManagedPreferOffProperty(property)),
      ...savedTargetProperties,
    ],
  },
});

const buildPatchedCalendarDraft = (
  currentDraft: CalendarDraftResponse,
  patchedPageData: RuleBidPageData,
  draftMeta: DaysOffDraftMeta,
): CalendarDraftResponse => ({
  draft: {
    ...currentDraft.draft,
    draftKey: draftMeta.draftKey,
    bidId: draftMeta.bidId,
    periodId: draftMeta.periodId,
    periodCode: draftMeta.periodCode,
    draftVersion: draftMeta.draftVersion,
    tiers: buildCalendarDraftFromDaysOffPageData(patchedPageData).draft.tiers,
  },
});

export const saveDaysOffCalendarAction = async ({
  currentDraft,
  action,
  blockedTiersByDate,
  pageData,
}: SaveDaysOffCalendarActionOptions): Promise<SaveDaysOffCalendarActionResult> =>
  runCurrentBidMutation(pageData.rightPanel.draftMeta, async (latestDraftMeta) => {
  const existingProperties = pageData.rightPanel.existingProperties;
  const existingCalendarProperties = existingProperties.filter(isCalendarManagedPreferOffProperty);
  const targetProperties = buildPreferOffCalendarTargetProperties(
    currentDraft,
    action,
    blockedTiersByDate,
    existingProperties,
  );
  const savedTargetProperties = [...targetProperties];
  let draftMeta: DaysOffDraftMeta = latestDraftMeta;

  for (let index = 0; index < targetProperties.length; index += 1) {
    const targetProperty = targetProperties[index]!;
    const existingProperty = existingCalendarProperties[index];

    if (existingProperty) {
      savedTargetProperties[index] = {
        ...targetProperty,
        id: existingProperty.id,
      };

      if (!shouldPatchCalendarPreferOffProperty(existingProperty, targetProperty)) {
        continue;
      }

      const response = await daysOffService.patchCurrentDraftProperty(
        existingProperty.id,
        {
          ...targetProperty,
          id: existingProperty.id,
        },
        draftMeta,
      );
      draftMeta = mergeDraftMeta(draftMeta, response);
      savedTargetProperties[index] = {
        ...targetProperty,
        id: response.propertyGroupKey ?? existingProperty.id,
      };
      continue;
    }

    const response = await daysOffService.addCurrentDraftProperty(
      buildDaysOffCalendarAvailableProperty(targetProperty),
      draftMeta,
    );
    draftMeta = mergeDraftMeta(draftMeta, response);
    savedTargetProperties[index] = {
      ...targetProperty,
      id: response.propertyGroupKey ?? targetProperty.id,
    };
  }

  for (const extraProperty of existingCalendarProperties.slice(targetProperties.length)) {
    const response = await daysOffService.removeCurrentDraftProperty(extraProperty.id, draftMeta);
    draftMeta = mergeDraftMeta(draftMeta, response);
  }

  const patchedPageData = patchDaysOffPageDataWithCalendarProperties(
    pageData,
    draftMeta,
    savedTargetProperties,
  );

  return {
    draftMeta,
    savedTargetProperties,
    patchedPageData,
    patchedDraft: buildPatchedCalendarDraft(currentDraft, patchedPageData, draftMeta),
  };
  });
