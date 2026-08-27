import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pbsBidProperty, pbsBidPropertyContext } from "../../models/index.js";
import {
  LineholderBidServiceError,
  type LineholderPropertyCatalogContext,
  type LineholderPropertyDefinition,
  type LineholderPropertyIdentity,
} from "./shared-types.js";

type Database = ReturnType<typeof drizzle>;
type PropertyCatalogRow = {
  propertyCode: number;
  isVisibleInPortal: number;
  recommendedOrder: number | null;
};
export type PropertyCatalogBidContext = "Current" | "StandingLineholder" | "StandingReserve";

export const resolveRecommendedPropertyCodes = (
  propertyRows: PropertyCatalogRow[],
  supportedPropertyCodes: ReadonlySet<number>,
) =>
  propertyRows
    .filter((row) =>
      row.isVisibleInPortal === 1
      && row.recommendedOrder !== null
      && supportedPropertyCodes.has(row.propertyCode))
    .sort((left, right) =>
      (left.recommendedOrder ?? 0) - (right.recommendedOrder ?? 0)
      || left.propertyCode - right.propertyCode)
    .map((row) => row.propertyCode);

export const resolveLineholderPropertyCatalog = async <TDefinition extends LineholderPropertyDefinition>(
  db: Database,
  options: {
    bidType: string;
    bidContext: PropertyCatalogBidContext;
    propertyRegistry: readonly TDefinition[];
    clonePropertyDefinition: (property: TDefinition) => TDefinition;
  },
): Promise<LineholderPropertyCatalogContext<TDefinition>> =>
  resolvePropertyCatalogByContext(db, {
    bidTypes: [options.bidType],
    bidContext: options.bidContext,
    propertyRegistry: options.propertyRegistry,
    clonePropertyDefinition: options.clonePropertyDefinition,
  });

export const resolvePropertyCatalogByContext = async <TDefinition extends LineholderPropertyDefinition>(
  db: Database,
  options: {
    bidTypes: readonly string[];
    bidContext: PropertyCatalogBidContext;
    propertyRegistry: readonly TDefinition[];
    clonePropertyDefinition: (property: TDefinition) => TDefinition;
    resolveDefinitionBidType?: (property: TDefinition) => string;
  },
): Promise<LineholderPropertyCatalogContext<TDefinition>> => {
  const propertyRegistry = new Map(
    options.propertyRegistry.map((property) => [
      property.propertyCode,
      options.clonePropertyDefinition(property),
    ]),
  );

  const propertyRows = await db
    .select({
      propertyDefinitionId: pbsBidProperty.id,
      propertyCode: pbsBidProperty.propertyCode,
      bidType: pbsBidProperty.bidType,
      propertyName: pbsBidProperty.propertyName,
      isActive: pbsBidProperty.isActive,
      recommendedOrder: pbsBidProperty.recommendedOrder,
      contextId: pbsBidPropertyContext.id,
      isVisibleInPortal: pbsBidPropertyContext.isVisibleInPortal,
      contextDisplayOrder: pbsBidPropertyContext.displayOrder,
    })
    .from(pbsBidProperty)
    .leftJoin(
      pbsBidPropertyContext,
      and(
        eq(pbsBidPropertyContext.propertyId, pbsBidProperty.id),
        eq(pbsBidPropertyContext.bidContext, options.bidContext),
      ),
    )
    .where(inArray(pbsBidProperty.bidType, [...options.bidTypes]))
    .orderBy(asc(pbsBidPropertyContext.displayOrder), asc(pbsBidProperty.propertyCode));

  const missingContextRow = propertyRows.find((row) => row.contextId === null);

  if (missingContextRow) {
    throw new LineholderBidServiceError(
      500,
      `PBS property ${missingContextRow.propertyCode} is missing ${options.bidContext} visibility configuration.`,
    );
  }

  const visibleInactiveRow = propertyRows.find((row) =>
    row.isVisibleInPortal === 1 && row.isActive === 0);

  if (visibleInactiveRow) {
    throw new LineholderBidServiceError(
      500,
      `PBS property ${visibleInactiveRow.propertyCode} is visible in ${options.bidContext} but inactive.`,
    );
  }

  const propertyIdentityByCode = new Map(
    propertyRows.map((row) => [
      row.propertyCode,
      {
        propertyDefinitionId: row.propertyDefinitionId,
        propertyCode: row.propertyCode,
      },
    ]),
  );

  const allRegisteredCatalog = propertyRows
    .map((row) => {
      const registeredProperty = propertyRegistry.get(row.propertyCode);

      if (!registeredProperty) {
        if (row.isVisibleInPortal === 1) {
          throw new LineholderBidServiceError(
            500,
            `PBS property ${row.propertyCode} is visible in ${options.bidContext} but has no registered editor.`,
          );
        }

        return null;
      }

      const registeredBidType = options.resolveDefinitionBidType?.(registeredProperty);

      if (registeredBidType && registeredBidType !== row.bidType) {
        throw new LineholderBidServiceError(
          500,
          `PBS property ${row.propertyCode} has mismatched database and editor bid types.`,
        );
      }

      return {
        ...registeredProperty,
        name: row.propertyName ?? registeredProperty.name,
      };
    })
    .filter((property): property is TDefinition => property !== null);
  const visibleCodes = new Set(
    propertyRows
      .filter((row) => row.isVisibleInPortal === 1 && row.isActive !== 0)
      .map((row) => row.propertyCode),
  );
  const catalog = allRegisteredCatalog.filter((property) => visibleCodes.has(property.propertyCode));
  const recommendedPropertyCodes = resolveRecommendedPropertyCodes(
    propertyRows.map((row) => ({
      propertyCode: row.propertyCode,
      isVisibleInPortal: row.isActive === 0 ? 0 : row.isVisibleInPortal ?? 0,
      recommendedOrder: row.recommendedOrder,
    })),
    new Set(propertyRegistry.keys()),
  );
  const recommendedOrderByCode = new Map(
    recommendedPropertyCodes.map((propertyCode, index) => [propertyCode, index + 1]),
  );

  return {
    catalog,
    catalogByCode: new Map(allRegisteredCatalog.map((property) => [property.propertyCode, property])),
    propertyIdentityByCode,
    recommendedPropertyCodes,
    recommendedOrderByCode,
  };
};

export const requireLineholderPropertyIdentity = (
  propertyCode: number,
  propertyIdentityByCode: Map<number, LineholderPropertyIdentity>,
  bidType: string,
) => {
  const propertyIdentity = propertyIdentityByCode.get(propertyCode);

  if (!propertyIdentity) {
    throw new LineholderBidServiceError(
      500,
      `Missing stable PBS property definition id for ${bidType} property code ${propertyCode}.`,
    );
  }

  return propertyIdentity;
};
