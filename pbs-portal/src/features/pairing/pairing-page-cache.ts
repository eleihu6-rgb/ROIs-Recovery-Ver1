import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingPageData,
  PairingRightPanelData,
} from "@/features/pairing/types";
import {
  cloneAvailablePropertyFromConfiguredFavorite,
  removePairingAvailablePropertyByFavoriteKey,
} from "@/features/pairing/pairing-property-transform";

export type PairingFavoriteStatusDetails = {
  favoriteKey?: string;
  propertyId?: number;
};

export type PairingDraftMetaPatch = Partial<
  Pick<PairingRightPanelData["draftMeta"], "draftKey" | "bidId" | "periodId" | "draftVersion">
>;

export const hasPairingDraftMetaPatch = (details: PairingDraftMetaPatch) =>
  details.draftKey !== undefined
  || details.bidId !== undefined
  || details.periodId !== undefined
  || details.draftVersion !== undefined;

export const patchPairingDraftMeta = (
  draftMeta: PairingRightPanelData["draftMeta"],
  details: PairingDraftMetaPatch,
): PairingRightPanelData["draftMeta"] => ({
  ...draftMeta,
  draftKey: details.draftKey ?? draftMeta.draftKey,
  bidId: details.bidId ?? draftMeta.bidId,
  periodId: details.periodId !== undefined ? details.periodId : draftMeta.periodId,
  draftVersion: details.draftVersion ?? draftMeta.draftVersion,
});

type PairingFavoriteStatusTarget = {
  favoriteKey?: string;
  propertyId?: number;
  propertyCode: number;
  favorited: boolean;
};

export const applyPairingFavoriteStatus = <TProperty extends PairingFavoriteStatusTarget>(
  properties: TProperty[],
  propertyCode: number,
  favorited: boolean,
  details: PairingFavoriteStatusDetails = {},
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

export const applyPairingAvailablePropertyFavoriteStatus = (
  properties: PairingAvailableProperty[],
  propertyCode: number,
  favorited: boolean,
  details: PairingFavoriteStatusDetails = {},
) => applyPairingFavoriteStatus(properties, propertyCode, favorited, details);

export const patchPairingPageFavoriteStatus = (
  data: PairingPageData,
  propertyCode: number,
  favorited: boolean,
  details: PairingFavoriteStatusDetails = {},
): PairingPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    availableProperties: applyPairingFavoriteStatus(
      data.rightPanel.availableProperties,
      propertyCode,
      favorited,
      details,
    ),
  },
});

export const patchPairingPageDraftMeta = (
  data: PairingPageData,
  details: PairingDraftMetaPatch,
): PairingPageData => {
  if (!hasPairingDraftMetaPatch(details)) {
    return data;
  }

  return {
    ...data,
    rightPanel: {
      ...data.rightPanel,
      draftMeta: patchPairingDraftMeta(data.rightPanel.draftMeta, details),
    },
  };
};

export const patchPairingPageExistingProperties = (
  data: PairingPageData,
  existingProperties: PairingExistingProperty[],
): PairingPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    existingProperties,
  },
});

export const patchPairingPageAvailableProperties = (
  data: PairingPageData,
  availableProperties: PairingAvailableProperty[],
): PairingPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    availableProperties,
  },
});

export const patchPairingPageConfiguredFavorite = (
  data: PairingPageData,
  favorite: PairingAvailableProperty,
): PairingPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    availableProperties: [
      ...removePairingAvailablePropertyByFavoriteKey(
        data.rightPanel.availableProperties,
        favorite.favoriteKey ?? "",
      ),
      cloneAvailablePropertyFromConfiguredFavorite(favorite),
    ],
  },
});

export const patchPairingPageConfiguredFavoriteByKey = (
  data: PairingPageData,
  favorite: PairingAvailableProperty,
): PairingPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    availableProperties: data.rightPanel.availableProperties.map((property) =>
      property.favoriteKey === favorite.favoriteKey
        ? cloneAvailablePropertyFromConfiguredFavorite(favorite)
        : property,
    ),
  },
});

export const patchPairingPageUnfavoriteByKey = (
  data: PairingPageData,
  favoriteKey: string,
): PairingPageData => ({
  ...data,
  rightPanel: {
    ...data.rightPanel,
    availableProperties: removePairingAvailablePropertyByFavoriteKey(
      data.rightPanel.availableProperties,
      favoriteKey,
    ),
  },
});
