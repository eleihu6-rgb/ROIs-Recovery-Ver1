import {
  isPbsPairingCreditPriorityProperty,
  type PbsPairingBidAction,
  pbsPairingPropertyCatalog,
  type PbsPairingBidOperator,
  type PbsPairingBidQuantifier,
  type PbsPairingBidValue,
  type PbsPairingPropertyDefinition,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PairingBidValue } from "@/features/pairing/types";

export type PairingPropertyDefinition = PbsPairingPropertyDefinition;

const propertyDefinitionByCode = new Map(
  pbsPairingPropertyCatalog.map((property) => [property.propertyCode, property]),
);

const propertyDefinitionByName = new Map(
  pbsPairingPropertyCatalog.map((property) => [property.name, property]),
);

export const clonePairingBidValue = (bid: PbsPairingBidValue): PairingBidValue => {
  if (
    bid.type === "time-range"
    || bid.type === "time-range-date"
    || bid.type === "date-range"
    || bid.type === "stepper-date"
    || bid.type === "stepper-range"
    || bid.type === "stepper-range-date"
    || bid.type === "time-date"
    || bid.type === "percent-range"
    || bid.type === "duration-range"
  ) {
    return { ...bid };
  }

  if (bid.type === "percent-or-duration") {
    return { ...bid };
  }

  if (bid.type === "date-or-dow-list") {
    return {
      ...bid,
      dates: [...bid.dates],
      daysOfWeek: [...bid.daysOfWeek],
    };
  }

  if (bid.type === "work-day-preference") {
    return {
      ...bid,
      days: bid.days.map((day) => ({ ...day })),
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "airport-preference") {
    return {
      ...bid,
      locations: bid.locations.map((location) => ({ ...location })),
      dateScope: bid.dateScope
        ? bid.dateScope.mode === "specific_dates"
          ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
          : { ...bid.dateScope }
        : bid.dateScope,
    };
  }

  if (bid.type === "pairing-check-time") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "flight-legs-per-duty") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "pairing-length-preference") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "flight-number-preference") {
    return {
      ...bid,
      flightNumbers: [...bid.flightNumbers],
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "redeye-preference") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "deadhead-flying") {
    return {
      ...bid,
      dateScope: bid.dateScope?.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : bid.dateScope ? { ...bid.dateScope } : bid.dateScope,
    };
  }

  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
    };
  }

  if (bid.type === "tag-list" || bid.type === "tag-list-date") {
    return {
      ...bid,
      values: [...bid.values],
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    };
  }

  if (bid.type === "pairing-id-list") {
    return {
      ...bid,
      pairingIds: [...bid.pairingIds],
      pairingLabels: bid.pairingLabels ? [...bid.pairingLabels] : undefined,
    };
  }

  if (bid.type === "pairing-occurrence-list") {
    return {
      ...bid,
      occurrences: bid.occurrences.map((occurrence) => ({ ...occurrence })),
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    };
  }

  if (bid.type === "time-condition-list") {
    return {
      ...bid,
      conditions: bid.conditions.map((condition) => ({ ...condition })),
    };
  }

  return { ...bid };
};

export const pairingPropertyPriorityOptions = pbsPairingPropertyCatalog.map((property) => property.name);

export const getPairingPropertyDefinitionByCode = (propertyCode: number): PairingPropertyDefinition | null => {
  return propertyDefinitionByCode.get(propertyCode) ?? null;
};

export const getPairingPropertyDefinitionByName = (name: string): PairingPropertyDefinition | null => {
  return propertyDefinitionByName.get(name) ?? null;
};

export const clonePairingPropertyDefinition = (
  property: PairingPropertyDefinition,
): PairingPropertyDefinition => ({
  propertyCode: property.propertyCode,
  name: property.name,
  defaultBid: clonePairingBidValue(property.defaultBid),
  defaultAction: property.defaultAction,
  supportedActions: property.supportedActions ? [...property.supportedActions] : undefined,
  supportedOperators: property.supportedOperators ? [...property.supportedOperators] : undefined,
  supportedQuantifiers: property.supportedQuantifiers ? [...property.supportedQuantifiers] : undefined,
  defaultQuantifier: property.defaultQuantifier,
  numericBounds: property.numericBounds ? { ...property.numericBounds } : undefined,
});

export const getPairingPropertyOperatorsByCode = (propertyCode: number): PbsPairingBidOperator[] => {
  const definition = getPairingPropertyDefinitionByCode(propertyCode);

  return definition?.supportedOperators ? [...definition.supportedOperators] : [];
};

export const getPairingPropertyActionsByCode = (propertyCode: number): PbsPairingBidAction[] => {
  const definition = getPairingPropertyDefinitionByCode(propertyCode);

  return definition?.supportedActions ? [...definition.supportedActions] : [];
};

export const getPairingPropertyQuantifiersByCode = (propertyCode: number): PbsPairingBidQuantifier[] => {
  const definition = getPairingPropertyDefinitionByCode(propertyCode);

  return definition?.supportedQuantifiers ? [...definition.supportedQuantifiers] : [];
};

export const getPairingPropertyDefaultQuantifierByCode = (
  propertyCode: number,
): PbsPairingBidQuantifier | null => {
  const definition = getPairingPropertyDefinitionByCode(propertyCode);

  return definition?.defaultQuantifier ?? null;
};

export const isPairingCreditPriorityProperty = isPbsPairingCreditPriorityProperty;
