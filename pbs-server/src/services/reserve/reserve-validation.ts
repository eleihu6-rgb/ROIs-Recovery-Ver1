import {
  pbsReserveLegacyPropertyCodes,
  pbsReserveShortCallTypes,
  type PbsReserveDraftProperty,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import { isValidIsoDate } from "../lineholder/date-utils.js";
import { LineholderBidServiceError, parseTierKey } from "../lineholder/shared.js";

const MAX_RESERVE_TIER = 7;
const shortCallTypeSet = new Set<string>(pbsReserveShortCallTypes);
type ReserveDateScopeBid = Extract<PbsReserveDraftProperty["bid"], { type: "reserve-call-type-date-scope" }>;
type ReserveDraftValidationOptions = {
  allowedCallTypes?: readonly string[];
};

const getPropertyLabel = (property: PbsReserveDraftProperty) =>
  property.name.trim() || `Property ${property.propertyCode}`;

const validateTier = (tier: string) => {
  const parsed = parseTierKey(tier);

  if (parsed.number > MAX_RESERVE_TIER) {
    throw new LineholderBidServiceError(400, `Unsupported reserve tier: ${tier}`);
  }
};

const validateReserveDateScope = (
  dateScope: ReserveDateScopeBid["dateScope"],
  propertyName: string,
) => {
  if (dateScope.mode === "whole_month" || dateScope.mode === "first_half" || dateScope.mode === "second_half") {
    return;
  }

  if (dateScope.mode === "date_range") {
    if (!isValidIsoDate(dateScope.from) || !isValidIsoDate(dateScope.to)) {
      throw new LineholderBidServiceError(400, `${propertyName} date range must use valid YYYY-MM-DD dates.`);
    }

    if (dateScope.to < dateScope.from) {
      throw new LineholderBidServiceError(400, `${propertyName} date range end date must be on or after start date.`);
    }

    return;
  }

  const dates = dateScope.dates.map((value) => value.trim()).filter((value) => value.length > 0);

  if (dates.length === 0) {
    throw new LineholderBidServiceError(400, `${propertyName} requires at least one date.`);
  }

  const uniqueDates = new Set(dates);

  if (uniqueDates.size !== dates.length) {
    throw new LineholderBidServiceError(400, `${propertyName} dates must be unique.`);
  }

  if (!dates.every(isValidIsoDate)) {
    throw new LineholderBidServiceError(400, `${propertyName} must use valid YYYY-MM-DD dates.`);
  }
};

const buildAllowedCallTypeSet = (allowedCallTypes: readonly string[] | undefined) => {
  if (!allowedCallTypes) {
    return shortCallTypeSet;
  }

  return new Set(allowedCallTypes.map((callType) => callType.trim().toUpperCase()).filter(Boolean));
};

export const validateReserveDraftProperties = (
  properties: PbsReserveDraftProperty[],
  options: ReserveDraftValidationOptions = {},
) => {
  const allowedCallTypeSet = buildAllowedCallTypeSet(options.allowedCallTypes);

  for (const property of properties) {
    const label = getPropertyLabel(property);

    if (property.propertyCode === pbsReserveLegacyPropertyCodes.shortCallType) {
      if (property.bid.type !== "reserve-call-type-date-scope") {
        throw new LineholderBidServiceError(400, "Reserve Preference must use a valid reserve call type and date scope.");
      }

      if (!allowedCallTypeSet.has(property.bid.callType.trim().toUpperCase())) {
        throw new LineholderBidServiceError(400, "Reserve Preference must use a valid reserve call type.");
      }

      validateReserveDateScope(property.bid.dateScope, "Reserve Preference");
    } else {
      throw new LineholderBidServiceError(400, `${label} is not supported in Reserve mode.`);
    }

    if (property.tiers.length === 0) {
      throw new LineholderBidServiceError(400, `${label} requires at least one tier.`);
    }

    for (const tier of property.tiers) {
      validateTier(tier);
    }
  }
};
