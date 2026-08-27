import {
  type PbsPairingPropertyDefinition,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { LineholderPropertyCatalogContext } from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";

export type PairingPropertyCatalogContext = LineholderPropertyCatalogContext<PbsPairingPropertyDefinition>;

export const clonePairingPropertyDefinition = (
  property: PbsPairingPropertyDefinition,
): PbsPairingPropertyDefinition => ({
  propertyCode: property.propertyCode,
  name: property.name,
  defaultBid: cloneRuleBidValue(property.defaultBid),
  defaultAction: property.defaultAction,
  supportedActions: property.supportedActions ? [...property.supportedActions] : undefined,
  supportedOperators: property.supportedOperators ? [...property.supportedOperators] : undefined,
  supportedQuantifiers: property.supportedQuantifiers ? [...property.supportedQuantifiers] : undefined,
  defaultQuantifier: property.defaultQuantifier,
  ...(property.numericBounds ? { numericBounds: { ...property.numericBounds } } : {}),
});

export const clonePairingPropertyCatalogContext = (
  context: PairingPropertyCatalogContext,
): PairingPropertyCatalogContext => {
  const catalog = context.catalog.map(clonePairingPropertyDefinition);
  const sourceCatalogByCode = context.catalogByCode.size > 0
    ? context.catalogByCode
    : new Map(context.catalog.map((property) => [property.propertyCode, property]));
  const catalogByCode = new Map(
    Array.from(sourceCatalogByCode.entries()).map(([propertyCode, property]) => [
      propertyCode,
      clonePairingPropertyDefinition(property),
    ]),
  );

  for (const property of catalog) {
    catalogByCode.set(property.propertyCode, property);
  }

  return {
    catalog,
    catalogByCode,
    propertyIdentityByCode: new Map(context.propertyIdentityByCode),
    recommendedPropertyCodes: [...context.recommendedPropertyCodes],
    recommendedOrderByCode: new Map(context.recommendedOrderByCode),
  };
};
