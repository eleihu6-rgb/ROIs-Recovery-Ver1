import { pbsLineAaPropertyCodes } from "../../../../packages/contracts/pbs-line-bids.js";
import { pbsReserveLegacyPropertyCodes } from "../../../../packages/contracts/pbs-reserve-bids.js";

type LineBidNameCarrier = {
  propertyCode: number;
  name: string;
};

export const MIXED_LINE_BID_DISPLAY_NAME = "Mixed Line Bid";
export const MIXED_LINE_BID_PERSISTENCE_NAME = "Reserve";
export const MIXED_LINE_SHORT_CALL_PERSISTENCE_NAME = "Reserve Preference";
export const MIXED_LINE_SHORT_CALL_PROPERTY_CODE = pbsReserveLegacyPropertyCodes.shortCallType;
export const MIXED_LINE_SHORT_CALL_PROPERTY_GROUP_KEY_PREFIX = "ml-sc-";

export const isMixedLineReserveModeProperty = (
  property: Pick<LineBidNameCarrier, "propertyCode">,
): boolean => property.propertyCode === pbsLineAaPropertyCodes.reserve;

export const isMixedLineShortCallProperty = (
  property: Pick<LineBidNameCarrier, "propertyCode">,
): boolean => property.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE;

export const isMixedLineShortCallPropertyGroupKey = (propertyGroupKey: string | null | undefined): boolean =>
  Boolean(propertyGroupKey?.startsWith(MIXED_LINE_SHORT_CALL_PROPERTY_GROUP_KEY_PREFIX));

export const buildMixedLineShortCallPropertyGroupKey = (sourceKey: string | null | undefined): string => {
  if (typeof sourceKey === "string" && isMixedLineShortCallPropertyGroupKey(sourceKey)) {
    return sourceKey;
  }

  const stableSuffix = sourceKey?.replace(/[^a-zA-Z0-9-]/g, "").slice(-24);

  if (stableSuffix) {
    return `${MIXED_LINE_SHORT_CALL_PROPERTY_GROUP_KEY_PREFIX}${stableSuffix}`;
  }

  return `${MIXED_LINE_SHORT_CALL_PROPERTY_GROUP_KEY_PREFIX}${Date.now().toString(36)}`;
};

export const isMixedLineBidProperty = (
  property: Pick<LineBidNameCarrier, "propertyCode">,
): boolean => isMixedLineReserveModeProperty(property) || isMixedLineShortCallProperty(property);

export const getLineBidDisplayName = (property: LineBidNameCarrier): string =>
  isMixedLineBidProperty(property) ? MIXED_LINE_BID_DISPLAY_NAME : property.name;

export const getLineBidPersistenceName = (property: LineBidNameCarrier): string =>
  isMixedLineReserveModeProperty(property)
    ? MIXED_LINE_BID_PERSISTENCE_NAME
    : isMixedLineShortCallProperty(property)
      ? MIXED_LINE_SHORT_CALL_PERSISTENCE_NAME
      : property.name;

export const withMixedLineBidDisplayName = <TProperty extends LineBidNameCarrier>(
  property: TProperty,
): TProperty => {
  const name = getLineBidDisplayName(property);
  return name === property.name ? property : { ...property, name };
};

type MixedLineAdditionalPropertiesCarrier<TProperty> = {
  mixedLineAdditionalProperties?: TProperty[];
};

export const getMixedLineAdditionalProperties = <TProperty>(
  property: TProperty,
): TProperty[] => {
  const carrier = property as MixedLineAdditionalPropertiesCarrier<TProperty>;

  return Array.isArray(carrier.mixedLineAdditionalProperties)
    ? carrier.mixedLineAdditionalProperties
    : [];
};

export const withMixedLineAdditionalProperties = <TProperty>(
  property: TProperty,
  additionalProperties: TProperty[],
): TProperty => {
  if (additionalProperties.length === 0) {
    return property;
  }

  return {
    ...property,
    mixedLineAdditionalProperties: additionalProperties,
  };
};
