import { type PbsDaysOffPropertyDefinition } from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { LineholderPropertyCatalogContext } from "../lineholder/shared.js";
import { cloneRuleBidValue } from "../lineholder/rule-bid-value.js";

export type DaysOffPropertyCatalogContext = LineholderPropertyCatalogContext<PbsDaysOffPropertyDefinition>;

export const cloneDaysOffPropertyDefinition = (
  property: PbsDaysOffPropertyDefinition,
): PbsDaysOffPropertyDefinition => ({
  propertyCode: property.propertyCode,
  name: property.name,
  defaultBid: cloneRuleBidValue(property.defaultBid),
});

export const cloneDaysOffPropertyCatalogContext = (
  context: DaysOffPropertyCatalogContext,
): DaysOffPropertyCatalogContext => {
  const catalog = context.catalog.map(cloneDaysOffPropertyDefinition);
  const sourceCatalogByCode = context.catalogByCode.size > 0
    ? context.catalogByCode
    : new Map(context.catalog.map((property) => [property.propertyCode, property]));
  const catalogByCode = new Map(
    Array.from(sourceCatalogByCode.entries()).map(([propertyCode, property]) => [
      propertyCode,
      cloneDaysOffPropertyDefinition(property),
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

export const filterVisibleDaysOffPropertyCatalog = (
  catalog: PbsDaysOffPropertyDefinition[],
) => catalog;
