import type { PbsLinePropertyDefinition } from "../../../../packages/contracts/pbs-line-bids.js";
import type { LineholderPropertyCatalogContext } from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";

export type LinePropertyCatalogContext = LineholderPropertyCatalogContext<PbsLinePropertyDefinition>;

export const cloneLinePropertyDefinition = (
  property: PbsLinePropertyDefinition,
): PbsLinePropertyDefinition => ({
  propertyCode: property.propertyCode,
  name: property.name,
  defaultBid: cloneRuleBidValue(property.defaultBid),
});

export const cloneLinePropertyCatalogContext = (
  context: LinePropertyCatalogContext,
): LinePropertyCatalogContext => {
  const catalog = context.catalog.map(cloneLinePropertyDefinition);
  const sourceCatalogByCode = context.catalogByCode.size > 0
    ? context.catalogByCode
    : new Map(context.catalog.map((property) => [property.propertyCode, property]));
  const catalogByCode = new Map(
    Array.from(sourceCatalogByCode.entries()).map(([propertyCode, property]) => [
      propertyCode,
      cloneLinePropertyDefinition(property),
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
