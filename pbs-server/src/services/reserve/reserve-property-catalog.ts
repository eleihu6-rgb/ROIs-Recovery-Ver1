import type { PbsReservePropertyDefinition } from "../../../../packages/contracts/pbs-reserve-bids.js";
import type { LineholderPropertyCatalogContext } from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";

export type ReservePropertyCatalogContext = LineholderPropertyCatalogContext<PbsReservePropertyDefinition>;

export const cloneReservePropertyDefinition = (
  property: PbsReservePropertyDefinition,
): PbsReservePropertyDefinition => ({
  propertyCode: property.propertyCode,
  name: property.name,
  defaultBid: cloneRuleBidValue(property.defaultBid),
});

export const cloneReservePropertyCatalogContext = (
  context: ReservePropertyCatalogContext,
): ReservePropertyCatalogContext => {
  const catalog = context.catalog.map(cloneReservePropertyDefinition);
  const sourceCatalogByCode = context.catalogByCode.size > 0
    ? context.catalogByCode
    : new Map(context.catalog.map((property) => [property.propertyCode, property]));
  const catalogByCode = new Map(
    Array.from(sourceCatalogByCode.entries()).map(([propertyCode, property]) => [
      propertyCode,
      cloneReservePropertyDefinition(property),
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
