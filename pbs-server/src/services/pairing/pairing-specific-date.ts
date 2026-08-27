import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingOccurrence } from "../../../../packages/contracts/pbs-search-pairings.js";
import { parseTierKey } from "../lineholder/shared.js";
import { listIsoDatesInRange } from "../calendar/bidding-calendar-date-utils.js";
import { occurrenceConflictsWithDaysOff, type WeekendIntervalsByTier } from "../calendar/bidding-calendar-pairing-events.js";
import {
  buildNonWeekendPreferOffDatesByTier,
  buildPreferOffDatesByTier,
  buildWeekendIntervalsByTier,
  loadPreferOffCalendarRows,
} from "../calendar/prefer-off-calendar-events.js";
import { loadPreferOffConfig } from "../days-off/prefer-off-config.js";
import { loadPairingOccurrences } from "../pairing-search/pairing-occurrence-query.js";
import { PairingBidServiceError } from "./pairing-bid-errors.js";
import {
  isPairingOccurrenceListBid,
  getPairingOccurrenceListIds,
  normalizePairingOccurrenceListBid,
} from "./pairing-occurrence-list.js";

type Database = ReturnType<typeof drizzle>;
type DatabaseReader = Pick<Database, "select">;

export const PAIRING_NUMBER_PROPERTY_CODE = 102;

type AwardPairingNumberOccurrenceListProperty = PbsPairingDraftProperty & {
  action: "award";
  propertyCode: typeof PAIRING_NUMBER_PROPERTY_CODE;
  bid: Extract<PbsPairingDraftProperty["bid"], { type: "pairing-occurrence-list" }>;
};

const isAwardPairingNumberOccurrenceListProperty = (
  property: PbsPairingDraftProperty,
): property is AwardPairingNumberOccurrenceListProperty =>
  property.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
  && property.action === "award"
  && isPairingOccurrenceListBid(property.bid);

export type DayOffDatesByTier = Map<number, Set<string>>;

export type SpecificDatePairingDayOffConflict = {
  tier: number;
  date: string;
  pairingNumber: string;
  originDate: string;
  propertyGroupKey?: string;
};

export const findSpecificDatePairingDayOffConflicts = (
  properties: PbsPairingDraftProperty[],
  occurrencesByPairingNumber: Map<string, PbsPairingOccurrence[]>,
  dayOffDatesByTier: DayOffDatesByTier,
  weekendIntervalsByTier: WeekendIntervalsByTier = new Map(),
  nonWeekendDatesByTier: DayOffDatesByTier = new Map(),
) => {
  const conflictsByKey = new Map<string, SpecificDatePairingDayOffConflict>();

  for (const property of properties) {
    if (!isAwardPairingNumberOccurrenceListProperty(property)) {
      continue;
    }

    const normalizedBid = normalizePairingOccurrenceListBid(property.bid);

    for (const tier of property.tiers) {
      const tierNumber = parseTierKey(tier).number;
      const dayOffDates = dayOffDatesByTier.get(tierNumber);

      if (!dayOffDates || dayOffDates.size === 0) {
        continue;
      }

      for (const requestedOccurrence of normalizedBid.occurrences) {
        const matchingOccurrences = occurrencesByPairingNumber
          .get(requestedOccurrence.pairingId)
          ?.filter((occurrence) => occurrence.originDate === requestedOccurrence.originDate) ?? [];

        for (const occurrence of matchingOccurrences) {
          if (!occurrenceConflictsWithDaysOff(
            occurrence,
            dayOffDates,
            weekendIntervalsByTier.get(tierNumber),
            nonWeekendDatesByTier.get(tierNumber),
          )) {
            continue;
          }

          for (const date of listIsoDatesInRange(occurrence.startDate, occurrence.endDate)) {
            if (!dayOffDates.has(date)) {
              continue;
            }

            const conflictKey = `${tierNumber}:${date}:${property.propertyGroupKey ?? ""}:${occurrence.occurrenceId}`;
            conflictsByKey.set(conflictKey, {
              tier: tierNumber,
              date,
              pairingNumber: occurrence.pairingNumber,
              originDate: occurrence.originDate,
              propertyGroupKey: property.propertyGroupKey,
            });
          }
        }
      }
    }
  }

  return Array.from(conflictsByKey.values()).sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    if (left.tier !== right.tier) {
      return left.tier - right.tier;
    }

    return left.pairingNumber.localeCompare(right.pairingNumber);
  });
};

const formatSpecificDatePairingDayOffConflictMessage = (
  conflicts: SpecificDatePairingDayOffConflict[],
) => {
  const uniqueTierDates = new Map(
    conflicts.map((conflict) => [`${conflict.tier}:${conflict.date}`, conflict] as const),
  );
  const firstConflict = Array.from(uniqueTierDates.values())[0];

  if (uniqueTierDates.size === 1 && firstConflict) {
    return `Cannot add pairing because T${firstConflict.tier} has day off on ${firstConflict.date}.`;
  }

  return `Cannot add pairing because ${uniqueTierDates.size} selected tier/date entries have days off.`;
};

export const validateSpecificDatePairingDayOffConflicts = async ({
  db,
  pgPool,
  schema,
  bidId,
  rpStartLocal,
  rpEndLocal,
  properties,
  actor,
}: {
  db: DatabaseReader;
  pgPool: Pool | undefined;
  schema: string | null;
  bidId: number;
  rpStartLocal: string;
  rpEndLocal: string;
  properties: PbsPairingDraftProperty[];
  actor: { crewId: string };
}) => {
  const specificDateProperties = properties.filter((property) =>
    isAwardPairingNumberOccurrenceListProperty(property));

  if (!pgPool || !schema || specificDateProperties.length === 0) {
    return;
  }

  const [preferOffConfig, preferOffRows, actorBaseRows] = await Promise.all([
    loadPreferOffConfig(db),
    loadPreferOffCalendarRows(db, bidId),
    pgPool.query<{ base: string }>(
      `select cb.base from ${schema}.crew_base cb
        where cb.crew_id = $1 and cb.is_prime_base = 1
          and cb.eff_dt <= now() and (cb.exp_dt is null or cb.exp_dt > now())
        limit 1`,
      [actor.crewId],
    ),
  ]);
  const dayOffDatesByTier = buildPreferOffDatesByTier(
    preferOffRows,
    rpStartLocal,
    rpEndLocal,
    preferOffConfig,
  );
  const weekendIntervalsByTier = buildWeekendIntervalsByTier(
    preferOffRows,
    rpStartLocal,
    rpEndLocal,
    preferOffConfig,
  );
  const nonWeekendDatesByTier = buildNonWeekendPreferOffDatesByTier(
    preferOffRows,
    rpStartLocal,
    rpEndLocal,
    preferOffConfig,
  );
  const actorBase = actorBaseRows.rows[0]?.base?.trim() || undefined;
  const requestedPairingNumbers = specificDateProperties.flatMap((property) =>
    getPairingOccurrenceListIds(normalizePairingOccurrenceListBid(property.bid)));
  const occurrencesByPairingNumber = await loadPairingOccurrences({
    pgPool,
    schema,
    pairingIds: requestedPairingNumbers,
    periodStartDate: rpStartLocal,
    periodEndDate: rpEndLocal,
    actorBase,
  });
  const conflicts = findSpecificDatePairingDayOffConflicts(
    specificDateProperties,
    occurrencesByPairingNumber,
    dayOffDatesByTier,
    weekendIntervalsByTier,
    nonWeekendDatesByTier,
  );

  if (conflicts.length > 0) {
    throw new PairingBidServiceError(409, formatSpecificDatePairingDayOffConflictMessage(conflicts));
  }
};
