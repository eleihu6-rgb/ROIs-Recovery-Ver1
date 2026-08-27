import {
  pbsDaysOffPropertyRegistry,
  pbsDaysOffStandingPropertyCodes,
} from "./pbs-days-off-bids.js";
import {
  pbsLineAaPropertyCatalog,
  pbsLineF8PropertyCatalog,
  pbsLinePropertyCatalog,
} from "./pbs-line-bids.js";
import {
  pbsPairingPropertyCatalog,
} from "./pbs-pairing-bids.js";
import {
  pbsReservePropertyRegistry,
  pbsReserveStandingPropertyCodes,
} from "./pbs-reserve-bids.js";

export const pbsStandingBidRoutes = Object.freeze({
  current: "/standing-bids/current",
});

export const pbsStandingBidContexts = Object.freeze({
  lineholder: "StandingLineholder",
  reserve: "StandingReserve",
});

export const pbsStandingPeriodCode = "STANDING";

export const pbsStandingLineholderPropertyCodes = Object.freeze({
  dayOfWeekOff: pbsDaysOffStandingPropertyCodes.dayOfWeekOff,
});

export const pbsStandingReservePropertyCodes = Object.freeze({
  reserveDayOfWeekOff: pbsReserveStandingPropertyCodes.reserveDayOfWeekOff,
  reserveWorkBlockSize: pbsReserveStandingPropertyCodes.reserveWorkBlockSize,
  waiveCarryOverToDaysOff: pbsReserveStandingPropertyCodes.waiveCarryOverToDaysOff,
});

export const pbsStandingWeekdayOptions = Object.freeze([
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]);

const adaptStandingBid = (property) => {
  if (property.defaultBid?.type === "date-or-dow-list") {
    return {
      ...property,
      defaultBid: Object.freeze({
        ...property.defaultBid,
        dates: Object.freeze([]),
        daysOfWeek: property.defaultBid.daysOfWeek?.length
          ? Object.freeze([...property.defaultBid.daysOfWeek])
          : Object.freeze(["SAT"]),
      }),
    };
  }

  return property;
};

const standingLineholderDaysOffRegistry = pbsDaysOffPropertyRegistry
  .map((property) => Object.freeze({
    ...adaptStandingBid(property),
    bidType: "DaysOff",
  }));

const standingLineholderPairingRegistry = pbsPairingPropertyCatalog
  .map((property) => Object.freeze({
    ...adaptStandingBid(property),
    bidType: "Pairing",
    defaultAction: property.defaultAction ?? "award",
  }));

const standingLineholderLineRegistry = [
  ...pbsLineF8PropertyCatalog,
  ...pbsLinePropertyCatalog,
  ...pbsLineAaPropertyCatalog,
]
  .map((property) => Object.freeze({
    ...property,
    bidType: "Line",
  }));

const standingReserveRegistry = pbsReservePropertyRegistry
  .map((property) => Object.freeze({
    ...property,
    bidType: "Reserve",
  }));

export const pbsStandingLineholderPropertyRegistry = Object.freeze([
  ...standingLineholderDaysOffRegistry,
  ...standingLineholderPairingRegistry,
  ...standingLineholderLineRegistry,
]);

export const pbsStandingReservePropertyRegistry = Object.freeze([
  ...standingReserveRegistry,
]);
