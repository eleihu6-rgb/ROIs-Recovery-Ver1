import type {
  RuleBidAvailableProperty,
  RuleBidConfiguredFavoriteProperty,
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import {
  buildRuleBidAvailablePropertyFromConfiguredFavorite,
  cloneRuleBidAvailableProperties,
  cloneRuleBidExistingProperties,
} from "@/features/rule-bids/utils";

export type RuleBidFavoriteStatusDetails = {
  favoriteKey?: string;
  propertyId?: number;
};

export type RuleBidDraftMetaPatch = Partial<
  Pick<RuleBidRightPanelData["draftMeta"], "draftKey" | "bidId" | "periodId" | "periodCode" | "draftVersion">
>;

export const hasRuleBidDraftMetaPatch = (details: RuleBidDraftMetaPatch): boolean =>
  details.draftKey !== undefined
  || details.bidId !== undefined
  || details.periodId !== undefined
  || details.periodCode !== undefined
  || details.draftVersion !== undefined;

export const patchRuleBidDraftMeta = (
  draftMeta: RuleBidRightPanelData["draftMeta"],
  details: RuleBidDraftMetaPatch,
): RuleBidRightPanelData["draftMeta"] => ({
  ...draftMeta,
  draftKey: details.draftKey ?? draftMeta.draftKey,
  bidId: details.bidId ?? draftMeta.bidId,
  periodId: details.periodId !== undefined ? details.periodId : draftMeta.periodId,
  periodCode: details.periodCode ?? draftMeta.periodCode,
  draftVersion: details.draftVersion ?? draftMeta.draftVersion,
});

type RuleBidFavoriteStatusTarget = {
  favoriteKey?: string;
  propertyId?: number;
  propertyCode: number;
  favorited: boolean;
};

export const applyRuleBidFavoriteStatus = <TProperty extends RuleBidFavoriteStatusTarget>(
  properties: TProperty[],
  propertyCode: number,
  favorited: boolean,
  details: RuleBidFavoriteStatusDetails = {},
): TProperty[] =>
  properties.map((property) =>
    property.propertyCode === propertyCode
      ? {
          ...property,
          favorited,
          favoriteKey: favorited ? details.favoriteKey ?? property.favoriteKey : undefined,
          propertyId: favorited ? details.propertyId ?? property.propertyId : undefined,
        }
      : property,
  );

export const applyRuleBidAvailablePropertyFavoriteStatus = (
  properties: RuleBidAvailableProperty[],
  propertyCode: number,
  favorited: boolean,
  details: RuleBidFavoriteStatusDetails = {},
): RuleBidAvailableProperty[] => applyRuleBidFavoriteStatus(properties, propertyCode, favorited, details);

export const applyRuleBidAvailablePropertyUnfavoriteByKey = (
  properties: RuleBidAvailableProperty[],
  favoriteKey: string,
): RuleBidAvailableProperty[] =>
  properties.flatMap((property) => {
    if (property.favoriteKey !== favoriteKey) {
      return [property];
    }

    if (property.source === "favorite") {
      return [];
    }

    return [{
      ...property,
      favorited: false,
      favoriteKey: undefined,
      propertyId: undefined,
    }];
  });

export const applyRuleBidConfiguredFavorite = (
  properties: RuleBidAvailableProperty[],
  favorite: RuleBidConfiguredFavoriteProperty,
): RuleBidAvailableProperty[] => {
  const existingFavorite = properties.find((property) => property.favoriteKey === favorite.favoriteKey);
  const nextFavorite = buildRuleBidAvailablePropertyFromConfiguredFavorite(favorite);

  return [
    ...properties.filter((property) => property.favoriteKey !== favorite.favoriteKey),
    existingFavorite
      ? {
          ...nextFavorite,
          tiers: existingFavorite.tiers.map((tier) => ({ ...tier })),
        }
      : nextFavorite,
  ];
};

export const patchRuleBidPageConfiguredFavorite = (
  data: RuleBidPageData,
  favorite: RuleBidConfiguredFavoriteProperty,
): RuleBidPageData =>
  patchRuleBidPageAvailableProperties(
    data,
    applyRuleBidConfiguredFavorite(data.rightPanel.availableProperties, favorite),
  );

export const patchRuleBidPageDraftMeta = (
  data: RuleBidPageData,
  details: RuleBidDraftMetaPatch,
): RuleBidPageData => {
  if (!hasRuleBidDraftMetaPatch(details)) {
    return data;
  }

  return {
    ...data,
    rightPanel: {
      ...data.rightPanel,
      draftMeta: patchRuleBidDraftMeta(data.rightPanel.draftMeta, details),
    },
  };
};

export const patchRuleBidPageExistingProperties = (
  data: RuleBidPageData,
  existingProperties: RuleBidExistingProperty[],
): RuleBidPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    existingProperties: cloneRuleBidExistingProperties(existingProperties),
  },
});

export const patchRuleBidPageAvailableProperties = (
  data: RuleBidPageData,
  availableProperties: RuleBidAvailableProperty[],
): RuleBidPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    availableProperties: cloneRuleBidAvailableProperties(availableProperties),
  },
});

export const patchRuleBidPageFavoriteStatus = (
  data: RuleBidPageData,
  propertyCode: number,
  favorited: boolean,
  details: RuleBidFavoriteStatusDetails = {},
): RuleBidPageData =>
  patchRuleBidPageAvailableProperties(
    data,
    applyRuleBidAvailablePropertyFavoriteStatus(
      data.rightPanel.availableProperties,
      propertyCode,
      favorited,
      details,
    ),
  );

export const patchRuleBidPageUnfavoriteByKey = (
  data: RuleBidPageData,
  favoriteKey: string,
): RuleBidPageData =>
  patchRuleBidPageAvailableProperties(
    data,
    applyRuleBidAvailablePropertyUnfavoriteByKey(data.rightPanel.availableProperties, favoriteKey),
  );
