import type { Page, Route } from "playwright";

const currentPeriod = {
  id: 9001,
  rosterPeriodId: 9001,
  rosterPeriodKey: "help-jun-2026",
  periodCode: "Jun 2026",
  filiale: "F8",
  division: "TEST",
  status: "OPEN",
  computedStage: "OPEN",
  bidOpenAt: "2026-05-01T00:00:00.000Z",
  bidCloseAt: "2026-05-08T23:59:00.000Z",
  base: "YVR",
  zoneId: "America/Vancouver",
  timezoneLabel: "YVR Local Time",
  rpStartLocal: "2026-06-01",
  rpEndLocal: "2026-06-30",
  canEditBid: true,
  readOnlyReason: null,
};

const profile = {
  id: "help-sample",
  employeeNo: "TEST-001",
  name: "Sample Crew",
  email: "sample.crew@example.test",
  base: "YVR",
  rank: "FA",
  division: "TEST",
  fleet: ["737"],
  languages: ["EN"],
  seniorityLabel: "Sample",
  statusLabel: null,
  existingCreditLabel: "75:00",
  trainingMonthLabel: null,
  lastLoginLabel: null,
};

const biddingCalendar = {
  periodCode: currentPeriod.periodCode,
  bidContext: "Current",
  currentPeriod,
  activeTierRange: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
  events: [],
  dayOffCapacity: [
    {
      date: "2026-06-01",
      requestedDayOffCount: 23,
      totalCrewCount: 100,
      pairingDemandCount: 45,
      reserveDemandCount: 12,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
    {
      date: "2026-06-02",
      requestedDayOffCount: 33,
      totalCrewCount: 100,
      pairingDemandCount: 45,
      reserveDemandCount: 12,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
    {
      date: "2026-06-03",
      requestedDayOffCount: 39,
      totalCrewCount: 100,
      pairingDemandCount: 45,
      reserveDemandCount: 12,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
    {
      date: "2026-06-10",
      requestedDayOffCount: 18,
      totalCrewCount: 100,
      pairingDemandCount: 45,
      reserveDemandCount: 12,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
    {
      date: "2026-06-16",
      requestedDayOffCount: 35,
      totalCrewCount: 100,
      pairingDemandCount: 45,
      reserveDemandCount: 12,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
  ],
};

const biddingCalendarBidEvents = [
  {
    id: "help-days-off",
    type: "prefer_off_bid",
    tier: "T1",
    label: "Off",
    startDate: "2026-06-07",
    endDate: "2026-06-08",
    tone: "green",
    source: "pbs_bid_group",
    readonly: false,
  },
  {
    id: "help-pairing",
    type: "pairing_bid",
    tier: "T1",
    label: "M4959",
    startDate: "2026-06-15",
    endDate: "2026-06-17",
    tone: "blue",
    source: "pbs_bid_group",
    readonly: true,
    metadata: {
      pairingNumber: "M4959",
      pairingNumbers: "M4959",
      pairingId: "help-pairing-4959",
      pairingIds: "help-pairing-4959",
      originDate: "2026-06-15",
      originDates: "2026-06-15",
      occurrenceMode: "specific_date",
      propertyGroupKey: "sample-pairing-length",
      propertyGroupKeys: "sample-pairing-length",
      pairingDateRanges: "M4959:2026-06-15 - 2026-06-17",
      pairingBidEntries: "sample-pairing-length|M4959|help-pairing-4959|2026-06-15|2026-06-15|2026-06-17",
    },
  },
];

const lineholderSummary = {
  draftVersion: 3,
  periodCode: currentPeriod.periodCode,
  bidContext: "Current",
  statistics: [
    { tier: "T1", totalItems: 2, pairingCount: 1, lineCount: 0, daysOffCount: 1 },
    { tier: "T2", totalItems: 1, pairingCount: 0, lineCount: 1, daysOffCount: 0 },
  ],
  summaryItems: [
    {
      id: "sample-days-off",
      groupKey: "sample-days-off",
      bidType: "DaysOff",
      action: "Award",
      label: "Prefer Off",
      bid: "Weekends",
      value: "Weekends",
      readableText: "Prefer off on weekends",
      tiers: ["T1"],
      editableSource: { module: "DaysOff", propertyGroupKey: "sample-days-off" },
    },
    {
      id: "sample-pairing-length",
      groupKey: "sample-pairing-length",
      bidType: "Pairing",
      action: "Award",
      label: "Pairing Length",
      bid: "2–3 days long",
      value: "2–3 days long",
      readableText: "Award pairings 2–3 days long",
      tiers: ["T1"],
      editableSource: { module: "Pairing", propertyGroupKey: "sample-pairing-length" },
    },
    {
      id: "sample-commuter-pattern",
      groupKey: "sample-commuter-pattern",
      bidType: "Line",
      action: "Award",
      label: "Commuter Pattern",
      bid: "Work 4–5 days, then 4 days off",
      value: "Work 4–5 days, then 4 days off",
      readableText: "Work 4–5 days, then 4 days off",
      tiers: ["T2"],
      editableSource: { module: "Line", propertyGroupKey: "sample-commuter-pattern" },
    },
  ],
  warnings: [],
  diagnostics: [],
};

const bidDraftBase = {
  draftKey: "help-current",
  bidId: 9100,
  periodId: currentPeriod.id,
  draftVersion: 3,
  periodCode: currentPeriod.periodCode,
  bidContext: "Current",
  remarks: "",
};

const daysOffPropertyCatalog = [
  {
    propertyCode: 201,
    name: "Prefer Off",
    defaultBid: { type: "tag-list", values: [], suggestions: [] },
  },
  {
    propertyCode: 204,
    name: "Long Stretch Off / Compressed Flying",
    defaultBid: { type: "stepper-date-range", value: 10, from: "", to: "", min: 1, max: 14 },
  },
];

const pairingPropertyCatalog = [
  {
    propertyCode: 102,
    name: "Pairing Preference",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    defaultBid: {
      type: "pairing-preference",
      pairingIds: [],
      pairingLabels: [],
    },
  },
  {
    propertyCode: 103,
    name: "Pairing Check-In / Check-Out Time",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    supportedOperators: ["=", "<", ">", "Between"],
    defaultBid: {
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "",
      to: "",
      dateScope: null,
    },
  },
  {
    propertyCode: 107,
    name: "Flight Legs per Duty",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    supportedOperators: ["=", "<", ">", "Between"],
    supportedQuantifiers: ["any", "every"],
    defaultQuantifier: "any",
    numericBounds: { min: 1, max: 8 },
    defaultBid: {
      type: "flight-legs-per-duty",
      operator: "=",
      legs: 2,
      dateScope: null,
    },
  },
  {
    propertyCode: 110,
    name: "Work Day Preference",
    defaultAction: "award",
    supportedActions: ["award"],
    defaultBid: {
      type: "work-day-preference",
      days: [],
      dateScope: null,
    },
  },
  {
    propertyCode: 112,
    name: "Pairing Length",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    defaultBid: {
      type: "pairing-length-preference",
      minDays: null,
      maxDays: null,
      dateScope: null,
      min: 1,
      max: 7,
    },
  },
  {
    propertyCode: 116,
    name: "Flight Number Preference",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    defaultBid: {
      type: "flight-number-preference",
      flightNumbers: [],
      dateScope: null,
    },
  },
  {
    propertyCode: 117,
    name: "Redeye Preference",
    defaultAction: "avoid",
    supportedActions: ["award", "avoid"],
    defaultBid: {
      type: "redeye-preference",
      dateScope: null,
    },
  },
  {
    propertyCode: 122,
    name: "Deadhead Flying",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    defaultBid: {
      type: "deadhead-flying",
      mode: "any-deadhead",
      dateScope: null,
    },
  },
  {
    propertyCode: 129,
    name: "Time Between Flights",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    supportedOperators: ["<", "=", ">", "Between"],
    supportedQuantifiers: ["any", "every"],
    defaultQuantifier: "any",
    defaultBid: {
      type: "duration",
      value: "",
      operator: ">",
    },
  },
  {
    propertyCode: 163,
    name: "Month-End Carryover",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    supportedOperators: ["<", "=", ">", "Between"],
    defaultBid: {
      type: "month-end-carryover",
      operator: ">",
      days: null,
    },
  },
  {
    propertyCode: 168,
    name: "Airport Preference",
    defaultAction: "award",
    supportedActions: ["award", "avoid"],
    defaultBid: {
      type: "airport-preference",
      event: "landing",
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    },
  },
  {
    propertyCode: 428,
    name: "Efficient Flying First",
    defaultAction: "award",
    supportedActions: ["award"],
    defaultBid: {
      type: "efficient-flying-preference",
      mode: "efficient",
    },
  },
];

const linePropertyCatalog = [
  {
    propertyCode: 407,
    name: "Minimum Base Layover",
    defaultBid: { type: "minimum-base-layover", minimumDuration: "" },
  },
  {
    propertyCode: 408,
    name: "Commuter Pattern",
    defaultBid: {
      type: "days-off-on-pattern",
      minDaysOff: 4,
      minDaysOn: 4,
      maxDaysOn: 5,
      dateRange: null,
      min: 1,
      max: 14,
    },
  },
  {
    propertyCode: 427,
    name: "Reserve",
    defaultBid: {
      type: "reserve-flying-date-pattern",
      segments: [
        { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
        { workType: "flying", dateScope: { mode: "second_half" } },
      ],
      callTypeOptions: ["CRAM", "CRPM", "PRAM", "PRMM", "PRPM", "RESA", "RESB"],
      strength: "strong",
    },
  },
  {
    propertyCode: 429,
    name: "Credit Window Preference",
    defaultBid: {
      type: "credit-window-preference",
      direction: "more",
    },
  },
];

const daysOffCurrent = {
  currentPeriod,
  preferOffConfig: {
    weekdays: [
      { code: "MON", name: "Monday", order: 1, isoDay: 1 },
      { code: "TUE", name: "Tuesday", order: 2, isoDay: 2 },
      { code: "WED", name: "Wednesday", order: 3, isoDay: 3 },
      { code: "THU", name: "Thursday", order: 4, isoDay: 4 },
      { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
      { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
      { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
    ],
    weekend: {
      available: true,
      startDayCode: "SAT",
      startDayName: "Saturday",
      startTime: "00:00",
      endDayCode: "SUN",
      endDayName: "Sunday",
      endTime: "24:00",
    },
  },
  draft: {
    ...bidDraftBase,
    properties: [{
      propertyGroupKey: "sample-days-off",
      rowSeq: 1,
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["Weekends"] },
      tiers: ["T1"],
    }],
  },
  propertyCatalog: daysOffPropertyCatalog,
  favoriteProperties: [{
    favoriteKey: "sample-favorite-days-off",
    propertyId: 201,
    propertyCode: 201,
    name: "Prefer Off",
    bid: { type: "tag-list", values: ["Weekends"] },
    allOrNothing: false,
    minimumN: null,
    maximumN: null,
  }],
  recommendedPropertyCodes: [201, 204],
};

const pairingCurrent = {
  currentPeriod,
  draft: {
    ...bidDraftBase,
    properties: [{
      propertyGroupKey: "sample-pairing-length",
      rowSeq: 1,
      propertyCode: 112,
      name: "Pairing Length",
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 2,
        maxDays: 3,
        dateScope: null,
        min: 1,
        max: 7,
      },
      tiers: ["T1"],
    }],
  },
  propertyCatalog: pairingPropertyCatalog,
  favoriteProperties: [],
  recommendedPropertyCodes: [102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168, 428],
};

const pairingPreviewResults = [
  {
    id: "help-pairing-t4501",
    pairingId: "help-pairing-t4501",
    pairingNumber: "T4501",
    base: "YVR",
    originDate: "2026-06-01",
    startDateLabel: "2026-06-01",
    endDate: "2026-06-01",
    endDateLabel: "2026-06-01",
    compositionLabel: "FA(3)",
    reportTime: "06:00",
    releaseTime: "13:05",
    durationDays: 1,
    routeLabel: "YVR-YWG-YVR",
    priorityLabel: "FA",
    prioritySequence: "1",
    totalBlock: "04:35",
    totalCredit: "05:10",
    totalPay: "05:10",
    legs: [],
    activeDates: ["2026-06-01"],
  },
  {
    id: "help-pairing-t4502",
    pairingId: "help-pairing-t4502",
    pairingNumber: "T4502",
    base: "YVR",
    originDate: "2026-06-01",
    startDateLabel: "2026-06-01",
    endDate: "2026-06-02",
    endDateLabel: "2026-06-02",
    compositionLabel: "FA(3)",
    reportTime: "14:00",
    releaseTime: "22:00",
    durationDays: 2,
    routeLabel: "YVR-YYZ-YUL-YVR",
    priorityLabel: "FA",
    prioritySequence: "2",
    totalBlock: "07:20",
    totalCredit: "08:15",
    totalPay: "08:15",
    legs: [],
    activeDates: ["2026-06-01"],
  },
  {
    id: "help-pairing-t4503",
    pairingId: "help-pairing-t4503",
    pairingNumber: "T4503",
    base: "YVR",
    originDate: "2026-06-02",
    startDateLabel: "2026-06-02",
    endDate: "2026-06-02",
    endDateLabel: "2026-06-02",
    compositionLabel: "FA(2)",
    reportTime: "08:15",
    releaseTime: "17:30",
    durationDays: 1,
    routeLabel: "YVR-YYC-YVR",
    priorityLabel: "FA",
    prioritySequence: "3",
    totalBlock: "05:20",
    totalCredit: "06:00",
    totalPay: "06:00",
    legs: [],
    activeDates: ["2026-06-02"],
  },
];

const pairingDetailResults = [
  {
    id: "help-pairing-4959",
    pairingId: "help-pairing-4959",
    pairingNumber: "M4959",
    base: "YVR",
    originDate: "2026-06-15",
    startDateLabel: "2026-06-15",
    endDate: "2026-06-17",
    endDateLabel: "2026-06-17",
    compositionLabel: "FA(3)",
    reportTime: "09:15",
    releaseTime: "18:35",
    durationDays: 3,
    routeLabel: "YVR-YYZ-YUL-YVR",
    priorityLabel: "FA",
    prioritySequence: "1",
    totalBlock: "14:20",
    totalCredit: "16:05",
    totalPay: "16:05",
    legs: [],
    activeDates: ["2026-06-15", "2026-06-16", "2026-06-17"],
  },
];

const pairingPreview = {
  mode: "all_pairings_preview",
  summary: {
    pairingIdCount: pairingPreviewResults.length,
    totalItems: pairingPreviewResults.length,
  },
  pagination: {
    page: 1,
    pageSize: 30,
    totalItems: pairingPreviewResults.length,
    totalPages: 1,
  },
  results: pairingPreviewResults,
};

const pairingAirportOptions = {
  airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
  airportPreferenceOptions: [
    { code: "YVR", kind: "airport", label: "YVR · Vancouver", events: ["landing", "layover"] },
    { code: "YYZ", kind: "airport", label: "YYZ · Toronto Pearson", events: ["landing", "layover"] },
    { code: "YUL", kind: "airport", label: "YUL · Montreal", events: ["layover"] },
  ],
  filterAirports: ["YVR", "YYZ", "YWG", "YUL", "YYC", "YEG"],
  landingAirports: ["YVR", "YYZ", "YYC"],
  layoverAirports: ["YYZ", "YUL", "YWG"],
  workStartStations: ["YVR", "YYZ"],
};

const pairingReferenceOptions = {
  airports: [
    { code: "YVR", name: "Vancouver", icao: null, abbr: null, city: "YVR" },
    { code: "YYZ", name: "Toronto Pearson", icao: null, abbr: null, city: "YYZ" },
  ],
  cities: [{ code: "YVR" }, { code: "YYZ" }],
};

const lineCurrent = {
  currentPeriod,
  draft: {
    ...bidDraftBase,
    properties: [{
      propertyGroupKey: "sample-commuter-pattern",
      rowSeq: 1,
      propertyCode: 408,
      name: "Commuter Pattern",
      bid: {
        type: "days-off-on-pattern",
        minDaysOff: 4,
        minDaysOn: 4,
        maxDaysOn: 5,
        dateRange: null,
        min: 1,
        max: 14,
      },
      tiers: ["T2"],
    }],
  },
  propertyCatalog: linePropertyCatalog,
  favoriteProperties: [],
  recommendedPropertyCodes: [407, 408, 427, 429],
};

const reserveCurrent = {
  currentPeriod,
  draft: {
    ...bidDraftBase,
    draftKey: "help-reserve",
    bidId: 9200,
    properties: [{
      propertyGroupKey: "sample-reserve",
      rowSeq: 1,
      propertyCode: 301,
      name: "Reserve Preference",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["CRAM", "CRPM", "PRAM", "PRPM"],
        dateScope: { mode: "whole_month" },
      },
      tiers: ["T2"],
    }],
  },
  propertyCatalog: [{
    propertyCode: 301,
    name: "Reserve Preference",
    defaultBid: {
      type: "reserve-call-type-date-scope",
      callType: "PRAM",
      options: ["CRAM", "CRPM", "PRAM", "PRPM"],
      dateScope: { mode: "whole_month" },
    },
  }],
};

const reserveCoverage = {
  periodCode: currentPeriod.periodCode,
  baseCode: "YVR",
  rpStartLocal: "2026-06-01",
  rpEndLocal: "2026-06-30",
  days: Array.from({ length: 30 }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    requiredReserveCount: 8 + (index % 5),
    availableOffCount: 2 + (index % 4),
  })),
  warnings: [],
};

const standingCurrent = {
  currentPeriod: {
    id: null,
    periodCode: "Standing Bid",
    filiale: null,
    division: null,
    status: "OPEN",
    computedStage: "OPEN",
    bidOpenAt: null,
    bidCloseAt: null,
    canEditBid: true,
    readOnlyReason: null,
  },
  lineholderDraft: {
    draftKey: "help-standing-lineholder",
    bidId: 9300,
    periodId: null,
    draftVersion: 2,
    periodCode: "STANDING",
    bidContext: "StandingLineholder",
    remarks: "",
    properties: [
      {
        propertyGroupKey: "standing-weekends",
        rowSeq: 1,
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["Weekends"] },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "standing-pairing-length",
        rowSeq: 2,
        bidType: "Pairing",
        propertyCode: 112,
        name: "Pairing Length",
        action: "award",
        bid: {
          type: "pairing-length-preference",
          minDays: 2,
          maxDays: 3,
          dateScope: null,
          min: 1,
          max: 7,
        },
        tiers: ["T2"],
      },
    ],
  },
  reserveDraft: {
    draftKey: "help-standing-reserve",
    bidId: 9301,
    periodId: null,
    draftVersion: 1,
    periodCode: "STANDING",
    bidContext: "StandingReserve",
    remarks: "",
    properties: [],
  },
  preferOffConfig: daysOffCurrent.preferOffConfig,
  propertyCatalog: {
    lineholder: [
      ...daysOffPropertyCatalog.map((property) => ({
        bidType: "DaysOff",
        ...property,
      })),
      ...pairingPropertyCatalog
        .filter((property) => property.propertyCode !== 102)
        .map((property) => ({
          bidType: "Pairing",
          ...property,
        })),
      ...linePropertyCatalog.map((property) => ({
        bidType: "Line",
        ...property,
      })),
    ],
    reserve: reserveCurrent.propertyCatalog.map((property) => ({
      bidType: "Reserve",
      ...property,
    })),
  },
};

const awardCurrent = {
  rosterPeriodId: currentPeriod.id,
  periodCode: currentPeriod.periodCode,
  published: true,
  availability: "AVAILABLE",
  lifecycleStage: "PUBLISHED",
  awardPublishAt: "2026-05-20T00:00:00.000Z",
  awardFinalAt: "2026-05-22T00:00:00.000Z",
  misAwardDeadlineAt: "2026-05-26T00:00:00.000Z",
  rpStart: "2026-06-01",
  rpEnd: "2026-06-30",
  timeZone: {
    base: "YVR",
    zoneId: "America/Vancouver",
    timezoneLabel: "YVR Local Time",
    fallback: false,
  },
  summary: {
    tier: "T1",
    offDays: 2,
    creditMinutes: 420,
    premiumMinutes: 0,
    pairingCount: 1,
    activityCount: 0,
    warnings: [],
  },
  calendar: {
    monthLabel: "JUN 2026",
    weekdayLabels: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
    events: [
      {
        id: "sample-award-pairing",
        type: "pairing",
        label: "S1001",
        startDate: "2026-06-03",
        endDate: "2026-06-03",
        startTime: "0800",
        endTime: "1600",
        tone: "blue",
        readonly: true,
      },
      {
        id: "sample-award-off",
        type: "day_off",
        label: "DO",
        startDate: "2026-06-04",
        endDate: "2026-06-05",
        startTime: "0001",
        endTime: "0000",
        tone: "green",
        readonly: true,
      },
    ],
  },
  items: [
    {
      id: "sample-award-pairing",
      type: "pairing",
      label: "S1001",
      pairingId: "SAMPLE-1001",
      pairingCode: "S1001",
      assignment: "FLY",
      assignmentGroup: "FLY",
      startDate: "2026-06-03",
      endDate: "2026-06-03",
      startTime: "0800",
      endTime: "1600",
      base: "YVR",
      fleet: "737",
      position: "FA",
      matchedTier: "T1",
      awardPriority: 1,
      explanation: "Sample result for Help documentation.",
      creditMinutes: 420,
      creditMissingReason: null,
      blockMinutes: 390,
      tafbDays: 1,
      legEquipmentMissingReason: null,
      legs: [{
        id: "sample-leg-1",
        dutySeq: 1,
        segmentSeq: 1,
        day: "03",
        flightNumber: "S101",
        deadhead: false,
        depAirport: "YVR",
        arrAirport: "YYC",
        depTime: "0800",
        arrTime: "0930",
        blockMinutes: 90,
        creditMinutes: 420,
        equipment: "737",
        equipmentMissing: false,
      }],
    },
    {
      id: "sample-award-off",
      type: "day_off",
      label: "Day Off",
      pairingId: null,
      pairingCode: null,
      assignment: "DO",
      assignmentGroup: "DO",
      startDate: "2026-06-04",
      endDate: "2026-06-05",
      startTime: "0001",
      endTime: "0000",
      base: "YVR",
      fleet: null,
      position: null,
      matchedTier: null,
      awardPriority: null,
      explanation: null,
      creditMinutes: null,
      creditMissingReason: null,
      blockMinutes: null,
      tafbDays: null,
      legEquipmentMissingReason: null,
      legs: [],
    },
  ],
  reasonReport: {
    available: true,
    items: [{
      id: "sample-reason",
      kind: "awarded_pairing",
      pairingId: "SAMPLE-1001",
      pairingCode: "S1001",
      startDate: "2026-06-03",
      endDate: "2026-06-03",
      explanation: "Sample result for Help documentation.",
    }],
  },
};

const dashboardSummary = {
  profile,
  bidPackage: {
    rosterPeriodId: currentPeriod.id,
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
    periodCode: currentPeriod.periodCode,
    businessNow: "2026-05-02T12:00:00.000Z",
    timezoneLabel: "YVR Local Time",
    bidStartAt: "2026-05-01T07:00:00.000Z",
    bidCloseAt: "2026-05-09T06:59:00.000Z",
    bidStartLabel: "May 01, 00:00",
    bidCloseLabel: "May 08, 23:59",
    remainingLabel: "6 DAYS 11 HRS 59 MINS",
    computedStage: "OPEN",
    targetedLine: null,
    targetedReserve: null,
    totalBidder: 100,
  },
  messageCenter: {
    title: "MESSAGE CENTER",
    baseLineAverage: null,
    preAssignments: {
      totalDuties: 5,
      daysTouched: 5,
      categories: [
        { code: "PAIRING", label: "Pairing", count: 2 },
        { code: "DAYS_OFF", label: "Days Off", count: 2 },
        { code: "UNAVAILABLE", label: "Unavailable", count: 1 },
      ],
      details: [
        {
          id: "help-preassign-do-1",
          type: "ground",
          code: "GDO",
          label: "GDO",
          startDate: "2026-06-01",
          endDate: "2026-06-01",
          timeText: "08:01-08:00",
        },
        {
          id: "help-preassign-do-2",
          type: "ground",
          code: "GDO",
          label: "GDO",
          startDate: "2026-06-02",
          endDate: "2026-06-02",
          timeText: "08:01-08:00",
        },
        {
          id: "help-preassign-pairing-1",
          type: "pairing",
          code: "PAIRING",
          label: "S1001 YVR-YYC",
          startDate: "2026-06-03",
          endDate: "2026-06-03",
          timeText: "08:00-16:00",
        },
        {
          id: "help-preassign-unavailable-1",
          type: "ground",
          code: "VAC",
          label: "VAC",
          startDate: "2026-06-04",
          endDate: "2026-06-04",
          timeText: null,
        },
        {
          id: "help-preassign-pairing-2",
          type: "pairing",
          code: "PAIRING",
          label: "S1002 YVR-YEG",
          startDate: "2026-06-05",
          endDate: "2026-06-05",
          timeText: "09:15-17:35",
        },
      ],
    },
    fleetItems: [{ fleet: "737", subFleet: null, pairingCount: 20 }],
    messages: [{ id: "sample-message", title: "Bid period is open", body: "Review the close time before saving changes." }],
  },
};

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
};

export const installHelpScreenshotMocks = async (page: Page) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("pbs-portal.auth.token", "help-screenshot-token");
    window.localStorage.removeItem("pbs.workbench.biddingCalendarCollapsed");
  });

  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith("/auth/session")) {
      await fulfillJson(route, {
        user: { id: profile.id, name: profile.name, employeeNo: profile.employeeNo },
        authMode: "password",
      });
      return;
    }

    if (pathname.endsWith("/bidding-calendar/current")) {
      const isBidPage = new URL(page.url()).pathname.endsWith("/bid");
      await fulfillJson(route, {
        ...biddingCalendar,
        events: isBidPage ? biddingCalendarBidEvents : biddingCalendar.events,
      });
      return;
    }

    const responseByPath: Record<string, unknown> = {
      "/api/dashboard/profile": profile,
      "/api/dashboard/summary": dashboardSummary,
      "/api/lineholder-bids/current/summary": lineholderSummary,
      "/api/days-off-bids/current": daysOffCurrent,
      "/api/pairing-bids/current": pairingCurrent,
      "/api/pairing-bids/reference-options": pairingReferenceOptions,
      "/api/pairing-bids/efficient-flying-config": { percentile: 75 },
      "/api/pairing-bids/redeye-config": {
        available: true,
        startTime: "22:00",
        endTime: "05:00",
        crossesMidnight: true,
        version: "help",
      },
      "/api/line-bids/current": lineCurrent,
      "/api/line-bids/credit-window-config": { available: true, deltaHours: 5 },
      "/api/line-bids/minimum-base-layover-config": { available: true, minDuration: "013:00" },
      "/api/reserve-bids/current": reserveCurrent,
      "/api/reserve-bids/current/coverage": reserveCoverage,
      "/api/standing-bids/current": { code: 200, data: standingCurrent, message: "OK" },
      "/api/award/current": { code: 200, data: awardCurrent, message: "OK" },
      "/api/award/periods": {
        code: 200,
        data: {
          periods: [{
            rosterPeriodId: currentPeriod.id,
            periodCode: currentPeriod.periodCode,
            awardPublishAt: "2026-05-20T00:00:00.000Z",
            awardFinalAt: "2026-05-22T00:00:00.000Z",
          }],
        },
        message: "OK",
      },
    };

    if (pathname.endsWith("/pairing-search/preview")) {
      await fulfillJson(route, pairingPreview);
      return;
    }

    if (pathname.endsWith("/pairing-search/pairing-occurrences/by-date")) {
      await fulfillJson(route, {
        originDate: "2026-06-15",
        rosterPeriodId: currentPeriod.id,
        periodCode: currentPeriod.periodCode,
        occurrences: [
          {
            occurrenceId: "help-occurrence-m4959-2026-06-15",
            pairingNumber: "M4959",
            pairingId: "help-pairing-4959",
            originDate: "2026-06-15",
            startDate: "2026-06-15",
            endDate: "2026-06-17",
            startLocal: "2026-06-15T09:15:00",
            endLocal: "2026-06-17T18:35:00",
            label: "M4959 Jun 15 - Jun 17",
          },
          {
            occurrenceId: "help-occurrence-m4960-2026-06-15",
            pairingNumber: "M4960",
            pairingId: "help-pairing-4960",
            originDate: "2026-06-15",
            startDate: "2026-06-15",
            endDate: "2026-06-16",
            startLocal: "2026-06-15T14:10:00",
            endLocal: "2026-06-16T21:25:00",
            label: "M4960 Jun 15 - Jun 16",
          },
        ],
      });
      return;
    }

    if (pathname.endsWith("/pairing-search/pairing-details")) {
      await fulfillJson(route, {
        results: pairingDetailResults,
      });
      return;
    }

    if (pathname.endsWith("/pairing-search/airport-options")) {
      await fulfillJson(route, pairingAirportOptions);
      return;
    }

    if (pathname.endsWith("/pairing-search/time-between-flights-bounds")) {
      await fulfillJson(route, {
        minimumMinutes: 45,
        maximumMinutes: 360,
      });
      return;
    }

    if (pathname.endsWith("/pairing-search/flight-numbers")) {
      await fulfillJson(route, {
        query: "",
        limit: 25,
        options: [
          { value: "2660", label: "2660" },
          { value: "633", label: "633" },
          { value: "4501", label: "4501" },
        ],
      });
      return;
    }

    if (pathname.endsWith("/pairing-search/current-rules/counts")) {
      await fulfillJson(route, {
        mode: "current_rules_counts",
        periodCode: currentPeriod.periodCode,
        tier: "T1",
        computedAt: "2026-05-02T12:00:00.000Z",
        summary: {
          activePropertyCount: 1,
          allRules: { pairingIdCount: 12, totalItems: 12 },
        },
        rows: [],
      });
      return;
    }

    if (pathname.endsWith("/pairing-search/current-rules/tier-pools")) {
      await fulfillJson(route, {
        mode: "current_rules_tier_pools",
        periodCode: currentPeriod.periodCode,
        computedAt: "2026-05-02T12:00:00.000Z",
        packageTotal: { pairingIdCount: 12, totalItems: 12 },
        rows: [],
      });
      return;
    }

    const body = responseByPath[pathname];
    if (body !== undefined) {
      await fulfillJson(route, body);
      return;
    }

    await fulfillJson(route, {});
  });
};
