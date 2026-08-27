import {
  clonePairingBidValue,
  getPairingPropertyDefaultQuantifierByCode,
  getPairingPropertyDefinitionByCode,
  pairingPropertyPriorityOptions,
} from "@/features/pairing/pairing-property-catalog";
import { PAIRING_NUMBER_PROPERTY_CODE } from "@/features/pairing/pairing-number-occurrences";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingTierOption,
  PairingPageData,
  PairingSearchCriteriaItem,
  PairingSearchPageData,
  PairingSearchResult,
  PairingRightPanelData,
  PairingSearchForm,
} from "@/features/pairing/types";

const priorityOptions = pairingPropertyPriorityOptions;

const createTierOptions = (activeLabels: string[]): PairingTierOption[] =>
  Array.from({ length: 7 }, (_, index) => {
    const label = `T${index + 1}`;

    return {
      key: label.toLowerCase(),
      label,
      active: activeLabels.includes(label),
    };
  });

const cloneTiers = (tiers: PairingTierOption[]) => tiers.map((tier) => ({ ...tier }));

type AvailablePropertySeed = {
  propertyCode: number;
  favorited: boolean;
  pairingNumber: string;
  pairingType: string;
  effectiveDateRange: {
    from: string;
    to: string;
  };
  tiers: string[];
};

const availablePropertySeeds: AvailablePropertySeed[] = [
  {
    propertyCode: 102,
    favorited: false,
    pairingNumber: "M4959",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-01", to: "2025-12-03" },
    tiers: ["T1"],
  },
  {
    propertyCode: 118,
    favorited: false,
    pairingNumber: "D11830",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-08", to: "2025-12-09" },
    tiers: ["T1"],
  },
  {
    propertyCode: 168,
    favorited: false,
    pairingNumber: "L16815",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-10", to: "2025-12-11" },
    tiers: ["T1"],
  },
  {
    propertyCode: 121,
    favorited: false,
    pairingNumber: "B12106",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-12", to: "2025-12-14" },
    tiers: ["T1"],
  },
  {
    propertyCode: 131,
    favorited: true,
    pairingNumber: "D00317",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-01", to: "2025-12-03" },
    tiers: ["T4", "T5"],
  },
  {
    propertyCode: 132,
    favorited: true,
    pairingNumber: "D00324",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-24", to: "2025-12-24" },
    tiers: ["T4"],
  },
  {
    propertyCode: 133,
    favorited: true,
    pairingNumber: "N14520",
    pairingType: "NIPD",
    effectiveDateRange: { from: "2025-12-04", to: "2025-12-07" },
    tiers: ["T6"],
  },
  {
    propertyCode: 134,
    favorited: true,
    pairingNumber: "R08311",
    pairingType: "RedEye",
    effectiveDateRange: { from: "2025-12-08", to: "2025-12-10" },
    tiers: ["T2", "T3"],
  },
  {
    propertyCode: 139,
    favorited: true,
    pairingNumber: "R08315",
    pairingType: "RedEye",
    effectiveDateRange: { from: "2025-12-25", to: "2025-12-25" },
    tiers: ["T4", "T5"],
  },
  {
    propertyCode: 135,
    favorited: true,
    pairingNumber: "C18220",
    pairingType: "Charter",
    effectiveDateRange: { from: "2025-12-11", to: "2025-12-13" },
    tiers: ["T4"],
  },
  {
    propertyCode: 140,
    favorited: true,
    pairingNumber: "C18224",
    pairingType: "Charter",
    effectiveDateRange: { from: "2025-12-26", to: "2025-12-26" },
    tiers: ["T4", "T5"],
  },
  {
    propertyCode: 136,
    favorited: true,
    pairingNumber: "I48102",
    pairingType: "IPD",
    effectiveDateRange: { from: "2025-12-14", to: "2025-12-16" },
    tiers: ["T6"],
  },
  {
    propertyCode: 141,
    favorited: true,
    pairingNumber: "I48105",
    pairingType: "IPD",
    effectiveDateRange: { from: "2025-12-17", to: "2025-12-19" },
    tiers: ["T2", "T3"],
  },
  {
    propertyCode: 137,
    favorited: true,
    pairingNumber: "R09112",
    pairingType: "RedEye",
    effectiveDateRange: { from: "2025-12-20", to: "2025-12-22" },
    tiers: ["T4", "T5"],
  },
  {
    propertyCode: 138,
    favorited: false,
    pairingNumber: "I48109",
    pairingType: "IPD",
    effectiveDateRange: { from: "2025-12-23", to: "2025-12-27" },
    tiers: ["T6"],
  },
  {
    propertyCode: 142,
    favorited: false,
    pairingNumber: "P20118",
    pairingType: "Prem Transcon",
    effectiveDateRange: { from: "2025-12-09", to: "2025-12-11" },
    tiers: ["T2", "T3"],
  },
  {
    propertyCode: 143,
    favorited: false,
    pairingNumber: "N14528",
    pairingType: "NIPD",
    effectiveDateRange: { from: "2025-12-05", to: "2025-12-08" },
    tiers: ["T3", "T4"],
  },
  {
    propertyCode: 144,
    favorited: false,
    pairingNumber: "S44103",
    pairingType: "Shuttle",
    effectiveDateRange: { from: "2025-12-01", to: "2025-12-02" },
    tiers: ["T5"],
  },
  {
    propertyCode: 145,
    favorited: false,
    pairingNumber: "S44107",
    pairingType: "Shuttle",
    effectiveDateRange: { from: "2025-12-03", to: "2025-12-05" },
    tiers: ["T2"],
  },
  {
    propertyCode: 146,
    favorited: false,
    pairingNumber: "S44110",
    pairingType: "Shuttle",
    effectiveDateRange: { from: "2025-12-06", to: "2025-12-08" },
    tiers: ["T2", "T3"],
  },
  {
    propertyCode: 147,
    favorited: false,
    pairingNumber: "D10402",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-10", to: "2025-12-12" },
    tiers: ["T1", "T2"],
  },
  {
    propertyCode: 148,
    favorited: false,
    pairingNumber: "D10407",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-13", to: "2025-12-15" },
    tiers: ["T1", "T2"],
  },
  {
    propertyCode: 149,
    favorited: false,
    pairingNumber: "LGA220",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-16", to: "2025-12-18" },
    tiers: ["T4"],
  },
  {
    propertyCode: 150,
    favorited: false,
    pairingNumber: "LAX410",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-19", to: "2025-12-22" },
    tiers: ["T3", "T4"],
  },
  {
    propertyCode: 151,
    favorited: false,
    pairingNumber: "YYZ501",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-23", to: "2025-12-24" },
    tiers: ["T3"],
  },
  {
    propertyCode: 152,
    favorited: false,
    pairingNumber: "ATL611",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-24", to: "2025-12-25" },
    tiers: ["T5"],
  },
  {
    propertyCode: 153,
    favorited: false,
    pairingNumber: "LAX620",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-18", to: "2025-12-20" },
    tiers: ["T4"],
  },
  {
    propertyCode: 154,
    favorited: false,
    pairingNumber: "DFW631",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-20", to: "2025-12-22" },
    tiers: ["T4", "T5"],
  },
  {
    propertyCode: 155,
    favorited: false,
    pairingNumber: "DFW702",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-11", to: "2025-12-13" },
    tiers: ["T2"],
  },
  {
    propertyCode: 156,
    favorited: false,
    pairingNumber: "SFO811",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-14", to: "2025-12-16" },
    tiers: ["T2", "T3"],
  },
  {
    propertyCode: 157,
    favorited: false,
    pairingNumber: "D00918",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-09", to: "2025-12-10" },
    tiers: ["T1"],
  },
  {
    propertyCode: 158,
    favorited: false,
    pairingNumber: "D00922",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-12", to: "2025-12-13" },
    tiers: ["T1"],
  },
  {
    propertyCode: 159,
    favorited: false,
    pairingNumber: "A32110",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-01", to: "2025-12-04" },
    tiers: ["T5", "T6"],
  },
  {
    propertyCode: 160,
    favorited: false,
    pairingNumber: "B73712",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-05", to: "2025-12-08" },
    tiers: ["T5", "T6"],
  },
  {
    propertyCode: 161,
    favorited: false,
    pairingNumber: "P20130",
    pairingType: "Prem Transcon",
    effectiveDateRange: { from: "2025-12-17", to: "2025-12-19" },
    tiers: ["T2", "T3"],
  },
  {
    propertyCode: 162,
    favorited: false,
    pairingNumber: "POS404",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-01", to: "2025-12-31" },
    tiers: ["T4", "T5"],
  },
  {
    propertyCode: 163,
    favorited: false,
    pairingNumber: "CARRY30",
    pairingType: "Regular",
    effectiveDateRange: { from: "2025-12-30", to: "2026-01-02" },
    tiers: ["T1"],
  },
];

const buildAvailableProperty = ({
  propertyCode,
  pairingNumber,
  pairingType,
  effectiveDateRange,
  tiers,
}: AvailablePropertySeed): PairingAvailableProperty => {
  const definition = getPairingPropertyDefinitionByCode(propertyCode);

  if (!definition) {
    throw new Error(`Missing pairing property definition for code ${propertyCode}.`);
  }

  const baseBid = clonePairingBidValue(definition.defaultBid);
  const emptyBid = (() => {
    if (propertyCode === PAIRING_NUMBER_PROPERTY_CODE) {
      return { type: "pairing-id-list" as const, pairingIds: [] };
    }

    if (baseBid.type === "date" || baseBid.type === "time" || baseBid.type === "text" || baseBid.type === "percent") {
      return { ...baseBid, value: "" };
    }

    if (baseBid.type === "percent-or-duration") {
      return { ...baseBid, value: "", unit: "percent" as const };
    }

    if (baseBid.type === "time-range" || baseBid.type === "date-range" || baseBid.type === "percent-range") {
      return { ...baseBid, from: "", to: "" };
    }

    if (baseBid.type === "time-date") {
      return { ...baseBid, value: "", date: "" };
    }

    if (baseBid.type === "time-range-date") {
      return { ...baseBid, from: "", to: "", date: "" };
    }

    if (baseBid.type === "stepper-date" || baseBid.type === "stepper-range-date") {
      return { ...baseBid, date: "" };
    }

    if (baseBid.type === "stepper-date-range") {
      return { ...baseBid, from: "", to: "" };
    }

    if (baseBid.type === "select") {
      return { ...baseBid, value: "", options: [...baseBid.options] };
    }

    if (baseBid.type === "tag-list") {
      return { ...baseBid, values: [], suggestions: undefined };
    }

    if (baseBid.type === "tag-list-date") {
      return { ...baseBid, values: [], date: "", suggestions: undefined };
    }

    if (baseBid.type === "date-or-dow-list") {
      return { ...baseBid, dates: [], daysOfWeek: [] };
    }

    return baseBid;
  })();

  return {
    id: `available-${propertyCode}`,
    source: "catalog",
    propertyCode,
    name: definition.name,
    favorited: false,
    action: definition.defaultAction ?? null,
    quantifier: getPairingPropertyDefaultQuantifierByCode(propertyCode),
    bid: emptyBid,
    tiers: createTierOptions(tiers),
    actions: ["add", "preview"],
    pairingNumber: propertyCode === PAIRING_NUMBER_PROPERTY_CODE ? "" : pairingNumber,
    pairingType,
    effectiveDateRange: { ...effectiveDateRange },
  };
};

const catalogAvailableProperties: PairingAvailableProperty[] = availablePropertySeeds.map((seed) =>
  buildAvailableProperty({ ...seed, favorited: false }));
const configuredFavoriteProperties: PairingAvailableProperty[] = availablePropertySeeds
  .filter((seed) => seed.favorited)
  .map((seed) => {
    const property = buildAvailableProperty(seed);
    const definition = getPairingPropertyDefinitionByCode(seed.propertyCode);

    return {
      ...property,
      id: `favorite-${seed.propertyCode}`,
      source: "favorite",
      favoriteKey: String(10_000 + seed.propertyCode),
      propertyId: seed.propertyCode,
      favorited: true,
      bid: definition ? clonePairingBidValue(definition.defaultBid) : property.bid,
      tiers: property.tiers.map((tier) => ({ ...tier, active: false })),
    };
  });

const availableProperties: PairingAvailableProperty[] = [
  ...catalogAvailableProperties,
  ...configuredFavoriteProperties,
];

const existingPropertySeeds = [
  {
    id: "existing-duty-period",
    propertyCode: 133,
    tiers: ["T4"],
  },
  {
    id: "existing-pairing-type",
    propertyCode: 137,
    tiers: ["T2", "T3", "T4"],
  },
  {
    id: "existing-credit-ratio",
    propertyCode: 138,
    tiers: ["T4", "T6"],
  },
  {
    id: "existing-pairing-length",
    propertyCode: 131,
    tiers: ["T4", "T5"],
  },
  {
    id: "existing-pairing-length-on-date",
    propertyCode: 132,
    tiers: ["T4"],
  },
  {
    id: "existing-pairing-length-secondary",
    propertyCode: 131,
    tiers: ["T1"],
  },
];

const buildExistingProperty = (seed: typeof existingPropertySeeds[number]): PairingExistingProperty => {
  const template = availableProperties.find((property) => property.propertyCode === seed.propertyCode);
  const definition = getPairingPropertyDefinitionByCode(seed.propertyCode);

  if (!template || !definition) {
    throw new Error(`Missing available property template for code ${seed.propertyCode}.`);
  }

  return {
    id: seed.id,
    propertyCode: template.propertyCode,
    name: template.name,
    action: template.action ?? null,
    quantifier: template.quantifier ?? null,
    bid: clonePairingBidValue(definition.defaultBid),
    tiers: createTierOptions(seed.tiers),
    priorityOptions,
    pairingNumber: template.pairingNumber,
    pairingType: template.pairingType,
    effectiveDateRange: { ...template.effectiveDateRange },
  };
};

const existingProperties: PairingExistingProperty[] = existingPropertySeeds.map(buildExistingProperty);

const initialSearchForm: PairingSearchForm = {
  pairingNumber: "",
  pairingType: "All Types",
  dateFrom: "2025-12-01",
  dateTo: "2025-12-31",
};

const cloneExistingProperties = (items: PairingExistingProperty[]) =>
  items.map((item) => ({
    ...item,
    action: item.action ?? null,
    quantifier: item.quantifier ?? null,
    bid: clonePairingBidValue(item.bid),
    tiers: cloneTiers(item.tiers),
    priorityOptions: [...item.priorityOptions],
    effectiveDateRange: { ...item.effectiveDateRange },
  }));

const cloneAvailableProperties = (items: PairingAvailableProperty[]) =>
  items.map((item) => ({
    ...item,
    action: item.action ?? null,
    quantifier: item.quantifier ?? null,
    bid: clonePairingBidValue(item.bid),
    tiers: cloneTiers(item.tiers),
    actions: [...item.actions],
    effectiveDateRange: { ...item.effectiveDateRange },
  }));

const rightPanel: PairingRightPanelData = {
  draftMeta: {
    periodCode: "Apr 2026",
    draftVersion: 0,
    bidContext: "Current",
    remarks: "",
    currentPeriod: {
      id: 42,
      rosterPeriodId: 42,
      rosterPeriodKey: "2026RP04",
      periodCode: "Apr 2026",
      rpStartLocal: "2026-04-01",
      rpEndLocal: "2026-04-30",
      filiale: "F8",
      status: "OPEN",
      computedStage: "OPEN",
      bidOpenAt: "2026-03-06T00:00:00.000Z",
      bidCloseAt: "2026-03-13T23:59:00.000Z",
      canEditBid: true,
      readOnlyReason: null,
    },
  },
  existingTitle: "EXISTING PAIRING PROPERTIES",
  addSectionTitle: "ADD PAIRING PROPERTIES",
  allPropertiesLabel: "ALL PROPERTIES",
  favoritedPropertiesLabel: "FAVORITED PROPERTIES",
  searchPlaceholder: "Search Properties",
  searchButtonLabel: "SEARCH PAIRINGS",
  existingProperties: cloneExistingProperties(existingProperties),
  availableProperties: cloneAvailableProperties(availableProperties),
  initialSearchForm: { ...initialSearchForm },
};

export const pairingPageData: PairingPageData = {
  rightPanel,
};

type PairingSearchCriteriaSeed = {
  id: string;
  propertyCode: number;
  tiers: string[];
};

const buildPairingSearchCriteriaItem = ({
  id,
  propertyCode,
  tiers,
}: PairingSearchCriteriaSeed): PairingSearchCriteriaItem => {
  const template = availableProperties.find((property) => property.propertyCode === propertyCode);

  if (!template) {
    throw new Error(`Missing available property template for code ${propertyCode}.`);
  }

  return {
    id,
    propertyCode: template.propertyCode,
    name: template.name,
    action: template.action ?? null,
    quantifier: template.quantifier ?? null,
    bid: clonePairingBidValue(template.bid),
    tiers: createTierOptions(tiers),
    favorited: template.favorited,
    pairingNumber: template.pairingNumber,
    pairingType: template.pairingType,
    effectiveDateRange: { ...template.effectiveDateRange },
  };
};

const pairingSearchCriteriaItems: PairingSearchCriteriaItem[] = [
  buildPairingSearchCriteriaItem({
    id: "criteria-pairing-type",
    propertyCode: 137,
    tiers: ["T4", "T5"],
  }),
  buildPairingSearchCriteriaItem({
    id: "criteria-min-layover-time",
    propertyCode: 153,
    tiers: ["T4"],
  }),
];

const buildAprilActiveDates = (days: number[]) =>
  days.map((day) => `2026-04-${String(day).padStart(2, "0")}`);

const shiftActiveDate = (isoDate: string, offsetDays: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const pairingSearchResultTemplates: PairingSearchResult[] = [
  {
    id: "search-result-d00304",
    pairingId: "D00304",
    pairingNumber: "D00304",
    base: "CIT",
    reportTime: "0630",
    priorityLabel: "P5",
    prioritySequence: "02",
    totalBlock: "550",
    totalCredit: "0",
    totalPay: "550",
    activeDates: buildAprilActiveDates([3, 10, 17, 24]),
    legs: [
      {
        id: "d00304-leg-1",
        day: 1,
        dutyDate: "0403",
        dutyFdp: "0830",
        dutyFlyingHour: "0550",
        dutyHour: "0930",
        dutyCredit: "0730",
        flightNumber: "1993",
        departureStation: "CLT",
        arrivalStation: "LAX",
        departureTime: "0730",
        arrivalTime: "1020",
        blockTime: "0550",
        equipment: "320",
      },
      {
        id: "d00304-leg-2",
        day: 2,
        dutyDate: "0404",
        dutyFdp: "0315",
        dutyFlyingHour: "0145",
        dutyHour: "0415",
        dutyCredit: "0200",
        flightNumber: "577",
        departureStation: "LAX",
        arrivalStation: "PHX",
        departureTime: "1200",
        arrivalTime: "1345",
        blockTime: "0145",
        equipment: "320",
      },
    ],
  },
  {
    id: "search-result-d00318",
    pairingId: "D00318",
    pairingNumber: "D00318",
    base: "CIT",
    reportTime: "0815",
    priorityLabel: "P6",
    prioritySequence: "07",
    totalBlock: "630",
    totalCredit: "0",
    totalPay: "630",
    activeDates: buildAprilActiveDates([5, 12, 19, 26]),
    legs: [
      {
        id: "d00318-leg-1",
        day: 1,
        dutyDate: "0405",
        dutyFdp: "0715",
        dutyFlyingHour: "0315",
        dutyHour: "0815",
        dutyCredit: "0345",
        flightNumber: "880",
        departureStation: "DFW",
        arrivalStation: "SFO",
        departureTime: "0910",
        arrivalTime: "1125",
        blockTime: "0315",
        equipment: "737",
      },
      {
        id: "d00318-leg-2",
        day: 2,
        dutyDate: "0406",
        dutyFdp: "0535",
        dutyFlyingHour: "0335",
        dutyHour: "0635",
        dutyCredit: "0130",
        flightNumber: "DH221",
        departureStation: "SFO",
        arrivalStation: "DFW",
        departureTime: "1605",
        arrivalTime: "2140",
        blockTime: "0335",
        equipment: "737",
      },
    ],
  },
  {
    id: "search-result-d00411",
    pairingId: "D00411",
    pairingNumber: "D00411",
    base: "CIT",
    reportTime: "0545",
    priorityLabel: "P4",
    prioritySequence: "11",
    totalBlock: "720",
    totalCredit: "0",
    totalPay: "720",
    activeDates: buildAprilActiveDates([7, 14, 21, 28]),
    legs: [
      {
        id: "d00411-leg-1",
        day: 1,
        dutyDate: "0407",
        dutyFdp: "0740",
        dutyFlyingHour: "0440",
        dutyHour: "0840",
        dutyCredit: "0445",
        flightNumber: "1001",
        departureStation: "ORD",
        arrivalStation: "SEA",
        departureTime: "0640",
        arrivalTime: "0920",
        blockTime: "0440",
        equipment: "321",
      },
      {
        id: "d00411-leg-2",
        day: 2,
        dutyDate: "0408",
        dutyFdp: "0750",
        dutyFlyingHour: "0450",
        dutyHour: "0850",
        dutyCredit: "0500",
        flightNumber: "1008",
        departureStation: "SEA",
        arrivalStation: "ORD",
        departureTime: "1340",
        arrivalTime: "1930",
        blockTime: "0450",
        equipment: "321",
      },
    ],
  },
];

const pairingSearchResults: PairingSearchResult[] = Array.from({ length: 225 }, (_, index) => {
  const template = pairingSearchResultTemplates[index % pairingSearchResultTemplates.length];
  const sequence = String(index + 1).padStart(2, "0");

  return {
    ...template,
    id: `${template.id}-${sequence}`,
    pairingId: `${template.pairingId}-${sequence}`,
    activeDates: template.activeDates.map((date) => shiftActiveDate(date, index)),
    legs: template.legs.map((leg, legIndex) => ({
      ...leg,
      id: `${template.id}-${sequence}-leg-${legIndex + 1}`,
    })),
  };
});

export const pairingSearchPageData: PairingSearchPageData = {
  title: "Search Pairings",
  criteriaTitle: "SEARCH CRITERIA",
  criteriaItems: pairingSearchCriteriaItems,
  resultsTitle: "SEARCH RESULTS",
  resultSummaryText: "59 pairing numbers, 225 total results",
  bidThesePropertiesLabel: "BID THESE PROPERTIES",
  addMoreCriteriaLabel: "ADD MORE SEARCH CRITERIA",
  pagination: {
    totalItems: 225,
    pageSizeOptions: [30],
    defaultPageSize: 30,
  },
  results: pairingSearchResults,
};

export const pairingMockFactories = {
  cloneAvailableProperties: () => cloneAvailableProperties(availableProperties),
  cloneExistingProperties: () => cloneExistingProperties(existingProperties),
};
