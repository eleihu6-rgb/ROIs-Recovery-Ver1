import type {
  LineholderPeriodContext,
  LineholderPropertyCatalogContext,
  LineholderPropertyDefinition,
  LineholderPropertyIdentity,
} from "./shared.js";

type SerializedLineholderPeriodContext = Omit<LineholderPeriodContext, "bidOpenAt" | "bidCloseAt"> & {
  bidOpenAt: string | null;
  bidCloseAt: string | null;
};

type SerializedLineholderPropertyCatalogContext<TDefinition extends LineholderPropertyDefinition> = {
  catalog: TDefinition[];
  catalogByCode: Array<[number, TDefinition]>;
  propertyIdentityByCode: Array<[number, LineholderPropertyIdentity]>;
  recommendedPropertyCodes: number[];
  recommendedOrderByCode: Array<[number, number]>;
};

export const cloneLineholderPeriodContext = (
  period: LineholderPeriodContext,
): LineholderPeriodContext => ({
  ...period,
  bidOpenAt: period.bidOpenAt ? new Date(period.bidOpenAt) : null,
  bidCloseAt: period.bidCloseAt ? new Date(period.bidCloseAt) : null,
});

export const serializeLineholderPeriodContext = (
  period: LineholderPeriodContext,
): SerializedLineholderPeriodContext => ({
  ...period,
  bidOpenAt: period.bidOpenAt?.toISOString() ?? null,
  bidCloseAt: period.bidCloseAt?.toISOString() ?? null,
});

export const deserializeLineholderPeriodContext = (
  value: unknown,
): LineholderPeriodContext => {
  const period = value as SerializedLineholderPeriodContext;

  return {
    ...period,
    bidOpenAt: period.bidOpenAt ? new Date(period.bidOpenAt) : null,
    bidCloseAt: period.bidCloseAt ? new Date(period.bidCloseAt) : null,
  };
};

export const serializeLineholderPropertyCatalogContext = <TDefinition extends LineholderPropertyDefinition>(
  context: LineholderPropertyCatalogContext<TDefinition>,
): SerializedLineholderPropertyCatalogContext<TDefinition> => ({
  catalog: context.catalog,
  catalogByCode: Array.from(context.catalogByCode.entries()),
  propertyIdentityByCode: Array.from(context.propertyIdentityByCode.entries()),
  recommendedPropertyCodes: context.recommendedPropertyCodes,
  recommendedOrderByCode: Array.from(context.recommendedOrderByCode.entries()),
});

export const deserializeLineholderPropertyCatalogContext = <TDefinition extends LineholderPropertyDefinition>(
  value: unknown,
): LineholderPropertyCatalogContext<TDefinition> => {
  const context = value as SerializedLineholderPropertyCatalogContext<TDefinition>;

  return {
    catalog: context.catalog,
    catalogByCode: new Map(context.catalogByCode),
    propertyIdentityByCode: new Map(context.propertyIdentityByCode),
    recommendedPropertyCodes: context.recommendedPropertyCodes,
    recommendedOrderByCode: new Map(context.recommendedOrderByCode),
  };
};
