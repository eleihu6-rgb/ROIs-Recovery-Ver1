export type BidConditionGroup = "days-off" | "pairing" | "roster-line" | "reserve";

export type BidConditionContext = "Current" | "StandingLineholder" | "StandingReserve";

export type BidConditionVisibleContext = {
  bidContext: BidConditionContext;
  bidType: "DaysOff" | "Pairing" | "Line" | "Reserve";
  propertyCode: number;
};

export type BidConditionScreenshot = {
  src: string;
  alt: string;
  caption: string;
};

export type BidConditionDetailItem = {
  label: string;
  details: string;
};

export type BidConditionControlGuide = {
  label: string;
  details: string;
  commonMistake?: string;
  screenshot?: BidConditionScreenshot;
};

export type BidConditionHelpEntry = {
  id: string;
  propertyCode: number;
  name: string;
  group: BidConditionGroup;
  availableIn: string[];
  purpose: string;
  screenshot: BidConditionScreenshot;
  openFrom: string[];
  setupSteps: string[];
  fieldDetails: BidConditionDetailItem[];
  controlGuides?: BidConditionControlGuide[];
  example: string;
  saveResult: string[];
  watchOut: string[];
  visibleContexts: BidConditionVisibleContext[];
};

export const BID_CONDITION_GROUP_LABELS: Record<BidConditionGroup, string> = {
  "days-off": "Days Off",
  pairing: "Pairing",
  "roster-line": "Roster / Line",
  reserve: "Reserve",
};

export const EXPECTED_VISIBLE_BID_CONDITION_CONTEXTS: BidConditionVisibleContext[] = [
  { bidContext: "Current", bidType: "DaysOff", propertyCode: 201 },
  { bidContext: "Current", bidType: "DaysOff", propertyCode: 204 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 102 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 103 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 107 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 110 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 112 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 116 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 117 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 122 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 129 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 163 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 168 },
  { bidContext: "Current", bidType: "Pairing", propertyCode: 428 },
  { bidContext: "Current", bidType: "Line", propertyCode: 407 },
  { bidContext: "Current", bidType: "Line", propertyCode: 408 },
  { bidContext: "Current", bidType: "Line", propertyCode: 427 },
  { bidContext: "Current", bidType: "Line", propertyCode: 429 },
  { bidContext: "Current", bidType: "Reserve", propertyCode: 301 },
  { bidContext: "StandingLineholder", bidType: "DaysOff", propertyCode: 201 },
  { bidContext: "StandingLineholder", bidType: "DaysOff", propertyCode: 204 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 103 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 107 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 110 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 112 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 116 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 117 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 122 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 129 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 163 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 168 },
  { bidContext: "StandingLineholder", bidType: "Pairing", propertyCode: 428 },
  { bidContext: "StandingLineholder", bidType: "Line", propertyCode: 407 },
  { bidContext: "StandingLineholder", bidType: "Line", propertyCode: 408 },
  { bidContext: "StandingLineholder", bidType: "Line", propertyCode: 427 },
  { bidContext: "StandingLineholder", bidType: "Line", propertyCode: 429 },
  { bidContext: "StandingReserve", bidType: "Reserve", propertyCode: 301 },
];

const currentDaysOff = (propertyCode: number): BidConditionVisibleContext => ({
  bidContext: "Current",
  bidType: "DaysOff",
  propertyCode,
});

const standingDaysOff = (propertyCode: number): BidConditionVisibleContext => ({
  bidContext: "StandingLineholder",
  bidType: "DaysOff",
  propertyCode,
});

const currentPairing = (propertyCode: number): BidConditionVisibleContext => ({
  bidContext: "Current",
  bidType: "Pairing",
  propertyCode,
});

const standingPairing = (propertyCode: number): BidConditionVisibleContext => ({
  bidContext: "StandingLineholder",
  bidType: "Pairing",
  propertyCode,
});

const currentLine = (propertyCode: number): BidConditionVisibleContext => ({
  bidContext: "Current",
  bidType: "Line",
  propertyCode,
});

const standingLine = (propertyCode: number): BidConditionVisibleContext => ({
  bidContext: "StandingLineholder",
  bidType: "Line",
  propertyCode,
});

const field = (label: string, details: string): BidConditionDetailItem => ({ label, details });

const screenshot = (id: string, name: string): BidConditionScreenshot => ({
  src: `/help/screenshots/bid-condition-${id}-dialog.png`,
  alt: `${name} configuration dialog in PBS Portal`,
  caption: `${name} uses its own configuration dialog. Check the TIERS area first, then complete the condition-specific fields before ADD BID.`,
});

const controlScreenshot = (id: string, alt: string, caption: string): BidConditionScreenshot => ({
  src: `/help/screenshots/${id}.png`,
  alt,
  caption,
});

const control = (
  label: string,
  details: string,
  options: Pick<BidConditionControlGuide, "commonMistake" | "screenshot"> = {},
): BidConditionControlGuide => ({ label, details, ...options });

const APPLY_TO_TIERS_CONTROL = control(
  "Apply to Tiers",
  "Select T1-T7 before saving. The same configured condition is attached to every selected Tier, so T1 can be strict and lower Tiers can be looser.",
  { commonMistake: "Do not treat the Tier buttons as a filter preview. They decide where the saved bid condition is stored." },
);

const AWARD_AVOID_CONTROL = control(
  "Award / Avoid",
  "Award tells the optimizer to prefer matches. Avoid tells it to avoid matches when possible. The fields below the segmented button define what counts as a match.",
  { commonMistake: "Changing Award to Avoid reverses the meaning of the same fields; it does not clear those fields." },
);

const ADD_BID_CONTROL = control(
  "ADD BID and SAVE FAVORITE",
  "ADD BID attaches the configured condition to the selected Tiers. SAVE FAVORITE stores a reusable template and does not by itself add the bid to the draft.",
  { commonMistake: "A favorite is only a template. The draft changes only after ADD BID or an update action succeeds." },
);

const PAIRING_SEARCH_CONTROL = control(
  "Search pairing list",
  "Search narrows the candidate pairing table by pairing number, base, route, or rank text. It helps you find rows to select; the search text is not saved as a bid condition.",
  {
    commonMistake: "If you type a search and click ADD BID without selecting rows, nothing meaningful is saved because Pairing Preference stores exact selected pairing rows.",
    screenshot: controlScreenshot(
      "bid-condition-pairing-preference-search-controls",
      "Pairing Preference search input and Filters button",
      "Use the search box to find candidate pairings. Use Filters for structured candidate-list filters. Neither control saves a bid by itself.",
    ),
  },
);

const PAIRING_FILTERS_CONTROL = control(
  "Filters",
  "Filters opens the Pairing Filters dialog. Apply Filters can narrow by start dates, check-in, check-out, length, route station, layover station, layover count, credit, Redeye, or DHD.",
  {
    commonMistake: "Apply Filters only changes the visible candidate table. To save a Pairing Preference bid, select pairing rows after filtering and then click ADD BID.",
    screenshot: controlScreenshot(
      "bid-condition-pairing-preference-filters-dialog",
      "Pairing Filters dialog with date, time, station, credit, Redeye, and DHD controls",
      "Pairing Filters are temporary candidate-list filters for Pairing Preference. They are not stored as a standalone bid condition.",
    ),
  },
);

const PAIRING_SELECTION_CONTROL = control(
  "Pairing row selection",
  "Use the table checkbox, row click, or Select all pairings on this page checkbox to move pairings into the selected set. The selected count shows how many exact rows will be saved.",
  {
    commonMistake: "The total count is only how many rows match search and filters. Only the selected count becomes the Pairing Preference bid.",
    screenshot: controlScreenshot(
      "bid-condition-pairing-preference-selection-controls",
      "Pairing Preference selected count and selected pairing chip after a row is checked",
      "Selected rows appear in the selected strip and drive what ADD BID saves.",
    ),
  },
);

const EVENT_DATE_SCOPE_OFF_CONTROL = control(
  "Limit to Event Date off",
  "When the switch is off in Current Bid, the rule is evaluated across the whole current bid period. Standing Pairing dialogs hide this control because exact current-period event dates are not reusable Standing Bid data.",
  {
    commonMistake: "Off does not mean the bid is disabled. It means there is no extra date restriction on the rule.",
    screenshot: controlScreenshot(
      "bid-condition-limit-to-event-date-off",
      "Limit to Event Date switch in the off state",
      "With the switch off, the rule applies wherever the rest of the condition matches in the period.",
    ),
  },
);

const EVENT_DATE_SCOPE_ON_CONTROL = control(
  "Limit to Event Date on",
  "When the switch is on in Current Bid, choose Specific Dates or Date Range. The saved rule is only evaluated on the event dates selected for that condition.",
  {
    commonMistake: "This does not change the bid period and does not filter the Pairing Preference table. It limits when this saved Current Bid rule is eligible to match.",
    screenshot: controlScreenshot(
      "bid-condition-limit-to-event-date-on",
      "Limit to Event Date switch in the on state with Specific Dates and Date Range choices",
      "After turning the switch on, choose the date mode and pick dates inside the current period.",
    ),
  },
);

const EVENT_DATE_SCOPE_CONTROLS = [
  EVENT_DATE_SCOPE_OFF_CONTROL,
  EVENT_DATE_SCOPE_ON_CONTROL,
];

const FLIGHT_DATE_SCOPE_CONTROL = control(
  "Limit to Flight Date",
  "Flight Date means the operating date of a flight leg inside the pairing. Turn the switch on only when the saved rule should match flights on selected dates or inside a selected date range.",
  {
    commonMistake: "This is not the Pairing Preference table filter. It is saved with the condition and limits which flight-leg dates can satisfy the rule.",
    screenshot: controlScreenshot(
      "bid-condition-limit-to-flight-date-on",
      "Limit to Flight Date switch in the on state with Specific Dates and Date Range choices",
      "Use Limit to Flight Date when the flight-leg operating date matters for the saved rule.",
    ),
  },
);

const PAIRING_START_DATE_SCOPE_CONTROL = control(
  "Limit to Pairing Start Date",
  "Pairing Start Date means the first calendar date of the pairing. Turn the switch on when a length rule should only match pairings that start on selected dates or inside a selected date range.",
  {
    commonMistake: "For a multi-day pairing, this uses the first day of the pairing, not every calendar day touched by the pairing.",
    screenshot: controlScreenshot(
      "bid-condition-limit-to-pairing-start-date-on",
      "Limit to Pairing Start Date switch in the on state with Specific Dates and Date Range choices",
      "Pairing Start Date limits the start day of the pairing, not each duty or flight date inside the pairing.",
    ),
  },
);

const DAYS_OFF_TYPE_CONTROL = control(
  "Prefer Off Type",
  "Specific Dates and Date Range are current-period choices. Days of Week and Weekends are reusable patterns, especially useful in Standing Bid.",
  {
    commonMistake: "Do not turn on Time Window unless the request is for part of a day. A full-day Prefer Off can be saved without a time window.",
    screenshot: controlScreenshot(
      "bid-condition-days-off-date-type-controls",
      "Prefer Off Type segmented control with Specific Dates, Date Range, Days of Week, and Weekends",
      "Choose the date mode first, then complete only the fields that appear for that mode.",
    ),
  },
);

const WORK_DAY_CONTROL = control(
  "Work days and check-in window",
  "Select the weekdays you want to work. A weekday can be saved without check-in times; add times only when the check-in window matters.",
  {
    commonMistake: "Leaving time blank is valid for a weekday-only Work Day Preference. The day choice is the required part.",
    screenshot: controlScreenshot(
      "bid-condition-work-day-weekday-controls",
      "Work Day Preference weekday buttons and optional check-in windows",
      "Select work days first. Time fields are optional refinements for selected weekdays.",
    ),
  },
);

const RESERVE_DATE_SCOPE_CONTROL = control(
  "Date Scope",
  "Reserve Date Scope controls when the reserve request is active. Current Bid Reserve Preference can use Whole Month, First Half, Second Half, Date Range, or Specific Dates; Standing Bid Reserve Preference supports Whole Month, First Half, or Second Half only.",
  {
    commonMistake: "Reserve Date Scope is part of the saved Reserve Preference. It is not a visual filter and does not change the global bid period.",
    screenshot: controlScreenshot(
      "bid-condition-reserve-date-scope",
      "Reserve Preference Date Scope control with scope mode choices",
      "Reserve Preference uses Date Scope to save how much of the bid month the reserve request should cover.",
    ),
  },
);

const ENTRY_CONTROL_GUIDES: Record<string, BidConditionControlGuide[]> = {
  "prefer-off": [
    APPLY_TO_TIERS_CONTROL,
    DAYS_OFF_TYPE_CONTROL,
    control("Time Window", "Leave Time Window off for full-day requests. Turn it on only when the off request applies to part of a day."),
    ADD_BID_CONTROL,
  ],
  "long-stretch-off": [
    APPLY_TO_TIERS_CONTROL,
    control("Minimum stretch", "Enter the minimum number of consecutive off days the optimizer should try to preserve."),
    control("Date range", "Use the optional date range only when the stretch must happen inside a specific part of the period."),
    ADD_BID_CONTROL,
  ],
  "pairing-preference": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    PAIRING_SEARCH_CONTROL,
    PAIRING_FILTERS_CONTROL,
    PAIRING_SELECTION_CONTROL,
    ADD_BID_CONTROL,
  ],
  "pairing-check-in-check-out-time": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Time Type", "Check-In evaluates report time. Check-Out evaluates release time. Choose the time type before setting the time rule."),
    control("Time", "Use Between for a range, Before for earlier than a time, After for later than a time, or Exactly at for a specific clock time."),
    ...EVENT_DATE_SCOPE_CONTROLS,
    ADD_BID_CONTROL,
  ],
  "flight-legs-per-duty": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Duty Match", "Any duty matches if at least one duty in the pairing satisfies the leg rule. Every duty requires all evaluated duties to satisfy it."),
    control("Legs per duty", "Use the operator and number fields to define the duty-level leg count, not the total legs in the whole pairing."),
    ...EVENT_DATE_SCOPE_CONTROLS,
    ADD_BID_CONTROL,
  ],
  "work-day-preference": [
    APPLY_TO_TIERS_CONTROL,
    WORK_DAY_CONTROL,
    ...EVENT_DATE_SCOPE_CONTROLS,
    ADD_BID_CONTROL,
  ],
  "pairing-length": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Min / Max days", "Set the total pairing duration in calendar days. Use one side for a minimum or maximum, or both sides for a range."),
    PAIRING_START_DATE_SCOPE_CONTROL,
    ADD_BID_CONTROL,
  ],
  "flight-number-preference": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Type", "Use Type when the flight-number list should be limited to a supported flight-number category. Type changes the suggestion source; it does not select a flight number by itself."),
    control("Flight Numbers", "Type at least one character, then choose and add flight numbers that must appear inside a pairing for the rule to match."),
    FLIGHT_DATE_SCOPE_CONTROL,
    ADD_BID_CONTROL,
  ],
  "redeye-preference": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Redeye definition", "The displayed definition comes from company configuration. The bid stores the preference, not a manual time window."),
    FLIGHT_DATE_SCOPE_CONTROL,
    ADD_BID_CONTROL,
  ],
  "deadhead-flying": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Deadhead Flying", "Any deadhead matches pairings containing deadhead travel. Deadhead-only duty narrows the rule to duties made only of deadhead flying."),
    FLIGHT_DATE_SCOPE_CONTROL,
    ADD_BID_CONTROL,
  ],
  "time-between-flights": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Match", "Any means one connection can satisfy the rule. Every means all evaluated connections must satisfy it."),
    control("Time Between Flights", "Enter a duration in HH:MM. This is elapsed connection time, not a clock time such as 14:00."),
    control("Configured limits", "The editor is disabled until valid Time Between Flights limits load. If loading fails, use Retry on the message Unable to load the Time Between Flights limits."),
    ADD_BID_CONTROL,
  ],
  "month-end-carryover": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Carry-out days", "Set how many days the pairing carries beyond the roster period boundary. This is different from total pairing length."),
    ADD_BID_CONTROL,
  ],
  "airport-preference": [
    APPLY_TO_TIERS_CONTROL,
    AWARD_AVOID_CONTROL,
    control("Airport Event", "Choose what station event should be checked, such as landing, layover, or landing or layover."),
    control("Airports", "Choose airport or city values supported by the selected event type for the current account, base, period, and search text. If no option is returned, the selector shows No airports or cities match."),
    ...EVENT_DATE_SCOPE_CONTROLS,
    control("Preferred Layover Hours", "This appears for layover-related event types. Turn it on only when layover duration should also be part of the match."),
    ADD_BID_CONTROL,
  ],
  "efficient-flying-first": [
    APPLY_TO_TIERS_CONTROL,
    control("Efficient / Inefficient flying", "Choose whether to prefer the company-defined efficient or inefficient band. The percentage is configured by the company."),
    ADD_BID_CONTROL,
  ],
  "minimum-base-layover": [
    APPLY_TO_TIERS_CONTROL,
    control("Minimum duration", "Enter the minimum base layover duration required before the next work block."),
    ADD_BID_CONTROL,
  ],
  "commuter-pattern": [
    APPLY_TO_TIERS_CONTROL,
    control("Work / off pattern", "Set the allowed work block and the minimum off block that should follow it."),
    control("Date range", "Use this only when the commuter pattern should apply inside a smaller part of the period."),
    ADD_BID_CONTROL,
  ],
  "mixed-line-bid": [
    APPLY_TO_TIERS_CONTROL,
    control("Mixed Line", "Mixed Line is the default behavior and allows both pairing and reserve work when needed."),
    control("Reserve Only / Pairing Only", "Use these options to save an explicit line-shape restriction."),
    ADD_BID_CONTROL,
  ],
  "credit-window-preference": [
    APPLY_TO_TIERS_CONTROL,
    control("Direction", "Choose the configured credit direction. The amount comes from company configuration, not free text."),
    ADD_BID_CONTROL,
  ],
  "reserve-preference": [
    APPLY_TO_TIERS_CONTROL,
    control("Short-call type", "Choose one of the reserve short-call types configured for your crew type. Pilot crews see the company P-series reserve types, such as PRAM, PRMM, or PRPM. Cabin crews see the company C-series reserve types, such as CRAM or CRPM."),
    RESERVE_DATE_SCOPE_CONTROL,
    ADD_BID_CONTROL,
  ],
};

const BID_CONDITION_HELP_ENTRY_BASE: BidConditionHelpEntry[] = [
  {
    id: "prefer-off",
    propertyCode: 201,
    name: "Prefer Off",
    group: "days-off",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Requests dates, date ranges, weekdays, or weekends when you prefer not to work.",
    screenshot: screenshot("prefer-off", "Prefer Off"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> DAYS OFF -> Add Prefer Off.",
      "Left BIDDING CALENDAR: click a calendar date when the day is the starting point; the date is prefilled before you save the Days Off bid.",
      "Standing Bid: Lineholder -> Days Off -> Prefer Off for reusable patterns.",
    ],
    setupSteps: [
      "Choose the Tiers that should carry this preference.",
      "Choose the Prefer Off Type: Specific Dates, Date Range, Days of Week, or Weekends.",
      "Use Time Window only when the preference is for part of a day. Leave it off for a full-day request.",
      "Click ADD BID or SAVE BID to attach the request to the selected Tier.",
    ],
    fieldDetails: [
      field("Specific Dates", "Exact dates in the current period. Use this for one-off days off."),
      field("Date Range", "A continuous range. Use this when every date in the range should be off."),
      field("Days of Week", "Repeating weekdays. This is useful in Standing Bid because it can apply every period."),
      field("Weekends", "A shortcut for the configured weekend pattern."),
      field("Time Window", "Optional. When off, the bid means the full selected day or pattern."),
    ],
    example: "Mary wants June 7 and June 8 off in T1, or wants every Sunday off as a standing pattern.",
    saveResult: [
      "The saved days-off preference appears on BIDDING CALENDAR for the selected Tier.",
      "The daily DO capacity badge counts the crew once per date even if the same crew requested the date in multiple Tiers.",
    ],
    watchOut: [
      "Do not turn on Time Window unless the time matters.",
      "For reusable preferences, prefer Days of Week or Weekends instead of one current-period date.",
      "Calendar-first and condition-first entry points save the same kind of Days Off bid; they only start from different context.",
    ],
    visibleContexts: [currentDaysOff(201), standingDaysOff(201)],
  },
  {
    id: "long-stretch-off",
    propertyCode: 204,
    name: "Long Stretch Off / Compressed Flying",
    group: "days-off",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Requests a longer block of days off, allowing the rest of the month to be built in more compressed work blocks.",
    screenshot: screenshot("long-stretch-off", "Long Stretch Off / Compressed Flying"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> DAYS OFF -> Add Long Stretch Off / Compressed Flying.",
      "Standing Bid: Lineholder -> Days Off -> Long Stretch Off / Compressed Flying.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Set the minimum stretch length.",
      "Optionally limit the stretch to a date range.",
      "Save the condition into the draft.",
    ],
    fieldDetails: [
      field("Minimum stretch", "The minimum number of consecutive off days requested."),
      field("Date range", "Optional. Limits where the stretch can be found."),
      field("Tiers", "Controls whether this stretch preference is a high-priority or lower-priority request."),
    ],
    example: "Mary wants at least four days off together, even if she works a tighter sequence on the other days.",
    saveResult: [
      "The draft stores a stretch pattern rather than a list of exact individual off dates.",
      "The optimizer can satisfy it with any qualifying block within the allowed range.",
    ],
    watchOut: [
      "This is not the same as manually selecting each day with Prefer Off.",
      "If a date range is enabled, it must be long enough to contain the requested stretch.",
    ],
    visibleContexts: [currentDaysOff(204), standingDaysOff(204)],
  },
  {
    id: "pairing-preference",
    propertyCode: 102,
    name: "Pairing Preference",
    group: "pairing",
    availableIn: ["Current Bid"],
    purpose: "Awards or avoids exact current-period pairing rows selected from the pairing list.",
    screenshot: screenshot("pairing-preference", "Pairing Preference"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Pairing Preference.",
      "Left BIDDING CALENDAR: click an existing pairing entry when you want to work from that visible exact pairing; use ADD BID PROPERTIES when selecting new exact pairing rows from the full table.",
    ],
    setupSteps: [
      "Choose Award or Avoid.",
      "Use search and Filters to narrow the pairing table.",
      "Select one or more pairing rows.",
      "Choose the Tiers and click ADD BID.",
    ],
    fieldDetails: [
      field("Pairing table", "The list of current-period pairings that can be selected."),
      field("Search", "Finds pairings by pairing number, base, route, or rank text."),
      field("Filters", "Narrows the table by start date, check-in, check-out, length, station, layover count, credit, redeye, or DHD."),
      field("Selected count", "Shows how many pairing rows will be saved."),
    ],
    example: "Mary wants pairing T4501 and T4502 specifically, so she selects those rows and saves them in T1.",
    saveResult: [
      "Only selected rows are saved. Filter settings by themselves are not saved as a bid.",
      "Saved pairing bids appear in Existing Bid Properties and on BIDDING CALENDAR.",
    ],
    watchOut: [
      "This condition is Current Bid only because exact pairing rows change by period.",
      "If you want a reusable pattern such as length or station, use the matching reusable condition instead.",
    ],
    visibleContexts: [currentPairing(102)],
  },
  {
    id: "pairing-check-in-check-out-time",
    propertyCode: 103,
    name: "Pairing Check-In / Check-Out Time",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings by their report time or release time.",
    screenshot: screenshot("check-in-check-out-time", "Pairing Check-In / Check-Out Time"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Pairing Check-In / Check-Out Time.",
      "Standing Bid: Lineholder -> Pairing -> Pairing Check-In / Check-Out Time.",
    ],
    setupSteps: [
      "Choose Tiers.",
      "Choose Award or Avoid.",
      "Choose Check-In or Check-Out.",
      "Enter the time rule, then optionally limit it to event dates.",
    ],
    fieldDetails: [
      field("Time Type", "Check-In means report time. Check-Out means release time."),
      field("Time", "Defines the time operator or between range, such as 14:00 to 22:00."),
      field("Limit to Event Date", "Optional date scope. Event Date is the date of the check-in or check-out event being evaluated. When off, the time rule applies across the period."),
    ],
    example: "Mary avoids pairings checking in before 06:00, or awards pairings checking out before 18:00.",
    saveResult: [
      "The saved rule evaluates pairing check-in or check-out times when matching pairings.",
      "It can be reused in Standing Bid because it is a rule, not an exact pairing row.",
    ],
    watchOut: [
      "Use Check-In for start time and Check-Out for finish time. They are not interchangeable.",
      "A date scope narrows when the time rule is checked.",
    ],
    visibleContexts: [currentPairing(103), standingPairing(103)],
  },
  {
    id: "flight-legs-per-duty",
    propertyCode: 107,
    name: "Flight Legs per Duty",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings based on how many flight legs are inside each duty period.",
    screenshot: screenshot("flight-legs-per-duty", "Flight Legs per Duty"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Flight Legs per Duty.",
      "Standing Bid: Lineholder -> Pairing -> Flight Legs per Duty.",
    ],
    setupSteps: [
      "Choose the Tiers and preference direction.",
      "Set Any or Every if the editor exposes that choice.",
      "Choose the comparison operator and leg count.",
      "Optionally limit the rule to event dates.",
    ],
    fieldDetails: [
      field("Any / Every", "Any means at least one duty can match. Every means all evaluated duties must match."),
      field("Operator", "Controls whether the duty should equal, exceed, be less than, or fall between the leg count."),
      field("Leg count", "The number of flight legs inside a duty period."),
      field("Limit to Event Date", "Optional. Event Date is the date of the duty event being evaluated by the leg-count rule."),
    ],
    example: "Mary prefers duties with two legs and wants to avoid four-leg duty days.",
    saveResult: [
      "The rule is saved as a pairing condition and evaluated against duties inside pairings.",
      "It does not control total pairing length; use Pairing Length for that.",
    ],
    watchOut: [
      "Leg count per duty is different from total legs in a full pairing.",
      "Any is broader than Every and will usually match more pairings.",
    ],
    visibleContexts: [currentPairing(107), standingPairing(107)],
  },
  {
    id: "work-day-preference",
    propertyCode: 110,
    name: "Work Day Preference",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards pairings that work on selected dates or weekdays.",
    screenshot: screenshot("work-day-preference", "Work Day Preference"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Work Day Preference.",
      "Standing Bid: Lineholder -> Pairing -> Work Day Preference.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Choose specific dates or days of week.",
      "Add a time window only if the work time matters.",
      "Save the preference.",
    ],
    fieldDetails: [
      field("Specific dates", "Current-period dates when work is preferred."),
      field("Days of week", "Reusable weekday pattern, such as Monday and Tuesday."),
      field("Time window", "Optional. The condition can be saved with weekdays only, without a specific time."),
    ],
    example: "Mary prefers to work Mondays and Tuesdays. She can select those weekdays without entering a time.",
    saveResult: [
      "The saved rule requests work on the selected dates or weekdays.",
      "Leaving time blank is valid when the time window is not enabled.",
    ],
    watchOut: [
      "Do not force a time just to save this bid. Weekday-only configuration is allowed.",
      "Use Prefer Off when the goal is not to work on a day.",
    ],
    visibleContexts: [currentPairing(110), standingPairing(110)],
  },
  {
    id: "pairing-length",
    propertyCode: 112,
    name: "Pairing Length",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings by total pairing duration in days.",
    screenshot: screenshot("pairing-length", "Pairing Length"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Pairing Length.",
      "Standing Bid: Lineholder -> Pairing -> Pairing Length.",
    ],
    setupSteps: [
      "Choose Tiers and Award or Avoid.",
      "Choose the length value or range.",
      "Optionally limit the rule to pairing start dates.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Length", "Total number of calendar days covered by the pairing."),
      field("Award / Avoid", "Award requests matching lengths. Avoid asks the system not to assign matching lengths."),
      field("Limit to Pairing Start Date", "Optional. Pairing Start Date is the first day of the pairing, not every date the pairing touches."),
    ],
    example: "Mary awards 1-day pairings and avoids 4-day pairings.",
    saveResult: [
      "The saved rule matches pairings by duration in days.",
      "It is reusable in Standing Bid because it does not reference exact pairing numbers.",
    ],
    watchOut: [
      "Pairing Length is not the same as Flight Legs per Duty.",
      "Use Pairing Preference for exact pairing numbers.",
    ],
    visibleContexts: [currentPairing(112), standingPairing(112)],
  },
  {
    id: "flight-number-preference",
    propertyCode: 116,
    name: "Flight Number Preference",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings that include selected flight numbers.",
    screenshot: screenshot("flight-number-preference", "Flight Number Preference"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Flight Number Preference.",
      "Standing Bid: Lineholder -> Pairing -> Flight Number Preference.",
    ],
    setupSteps: [
      "Choose Tiers and Award or Avoid.",
      "Select or search flight numbers.",
      "Optionally limit the rule to flight dates.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Type", "Optional category selector for supported flight-number groups. It changes which suggestions are searched."),
      field("Flight Numbers", "The flight numbers that must be present in a pairing to match."),
      field("Limit to Flight Date", "Optional. Flight Date is the operating date of a flight leg inside the pairing."),
      field("Award / Avoid", "Controls whether matching flight numbers are preferred or avoided."),
    ],
    example: "Mary wants pairings that include flight 2660, or wants to avoid a flight number she dislikes.",
    saveResult: [
      "The rule matches pairings by flight number occurrence.",
      "The condition does not select a pairing row by itself.",
    ],
    watchOut: [
      "Use the flight-number selector, not the general pairing table search, when the flight number itself is the bid.",
      "Flight number and pairing number are different identifiers.",
      "The autocomplete starts after at least one character is typed. Changing Type alone will not add a flight number.",
    ],
    visibleContexts: [currentPairing(116), standingPairing(116)],
  },
  {
    id: "redeye-preference",
    propertyCode: 117,
    name: "Redeye Preference",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings classified as redeye by the configured company definition.",
    screenshot: screenshot("redeye-preference", "Redeye Preference"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Redeye Preference.",
      "Standing Bid: Lineholder -> Pairing -> Redeye Preference.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Confirm Award or Avoid.",
      "Add a flight-date scope only if the redeye preference should apply to specific flight dates.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Redeye definition", "The Portal uses the configured company redeye window to classify pairings."),
      field("Award / Avoid", "Avoid is commonly used for crew who do not want overnight redeye flying."),
      field("Limit to Flight Date", "Optional. Limits the redeye rule to selected flight-leg operating dates."),
    ],
    example: "Mary avoids redeye pairings in T1 but may accept them in lower Tiers.",
    saveResult: [
      "The saved rule evaluates whether a pairing is a redeye pairing.",
      "It is different from filtering the pairing table by the Redeye button.",
    ],
    watchOut: [
      "The visible Redeye filter only narrows Pairing Preference selection. This condition saves the rule.",
      "Check the selected Tier because Avoid in a high Tier can strongly shape the result.",
    ],
    visibleContexts: [currentPairing(117), standingPairing(117)],
  },
  {
    id: "deadhead-flying",
    propertyCode: 122,
    name: "Deadhead Flying",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings that include deadhead flying.",
    screenshot: screenshot("deadhead-flying", "Deadhead Flying"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Deadhead Flying.",
      "Standing Bid: Lineholder -> Pairing -> Deadhead Flying.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Choose Award or Avoid.",
      "Confirm the deadhead mode shown in the dialog.",
      "Add a flight-date scope only if the deadhead rule should apply to specific flight dates.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Deadhead mode", "The deadhead pattern being requested or avoided."),
      field("Limit to Flight Date", "Optional. Limits the deadhead rule to selected flight-leg operating dates."),
      field("Award / Avoid", "Award accepts or prefers matching deadhead flying. Avoid requests not to receive it."),
      field("Tiers", "Controls priority of this deadhead preference."),
    ],
    example: "Mary avoids pairings with DHD travel in T1.",
    saveResult: [
      "The saved rule evaluates pairing deadhead content.",
      "It can be reused in Standing Bid.",
    ],
    watchOut: [
      "The DHD button in Pairing Filters only narrows the list. This condition saves a bid rule.",
      "Deadhead flying may still appear if higher-priority requirements cannot be satisfied.",
    ],
    visibleContexts: [currentPairing(122), standingPairing(122)],
  },
  {
    id: "time-between-flights",
    propertyCode: 129,
    name: "Time Between Flights",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings by the connection or ground time between flight legs.",
    screenshot: screenshot("time-between-flights", "Time Between Flights"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Time Between Flights.",
      "Standing Bid: Lineholder -> Pairing -> Time Between Flights.",
    ],
    setupSteps: [
      "Choose Tiers and Award or Avoid.",
      "Choose Any or Every if the editor exposes that choice.",
      "Enter the HH:MM duration rule.",
      "Save the duration rule.",
    ],
    fieldDetails: [
      field("Any / Every", "Any means at least one connection can match. Every means all evaluated connections must match."),
      field("Duration", "A time span in HH:MM, such as 01:30."),
      field("Operator", "Controls less than, equal to, greater than, or other configured comparisons."),
      field("Configured limits", "The valid duration range is loaded from period configuration before the editor becomes active."),
      field("No date scope", "This editor saves the duration rule across the period; it does not expose Limit to Event Date."),
    ],
    example: "Mary awards pairings with at least 01:30 between flights so connections are not too tight.",
    saveResult: [
      "The saved rule evaluates time gaps inside matching pairings.",
      "It does not change check-in or check-out time preferences.",
    ],
    watchOut: [
      "Use HH:MM duration values, not clock times.",
      "Any usually matches more pairings than Every.",
      "If the dialog shows Unable to load the Time Between Flights limits., use Retry before saving.",
    ],
    visibleContexts: [currentPairing(129), standingPairing(129)],
  },
  {
    id: "month-end-carryover",
    propertyCode: 163,
    name: "Month-End Carryover",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings by how many days carry into the next month.",
    screenshot: screenshot("month-end-carryover", "Month-End Carryover"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Month-End Carryover.",
      "Standing Bid: Lineholder -> Pairing -> Month-End Carryover.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Choose Award or Avoid.",
      "Set the carryover-day comparison.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Carryover days", "How many days of the pairing continue after the roster period ends."),
      field("Operator", "Controls how the carryover count is compared."),
      field("Award / Avoid", "Controls whether carrying into next month is preferred or avoided."),
    ],
    example: "Mary avoids pairings that start in June and carry two or more days into July.",
    saveResult: [
      "The saved rule evaluates month-end crossing behavior.",
      "It does not create or remove calendar off markers by itself.",
    ],
    watchOut: [
      "This is about crossing the period boundary, not ordinary multi-day pairings inside the same month.",
      "Use Pairing Length if the concern is total duration, regardless of month end.",
    ],
    visibleContexts: [currentPairing(163), standingPairing(163)],
  },
  {
    id: "airport-preference",
    propertyCode: 168,
    name: "Airport Preference",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Awards or avoids pairings that include selected airport or station events.",
    screenshot: screenshot("airport-preference", "Airport Preference"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Airport Preference.",
      "Standing Bid: Lineholder -> Pairing -> Airport Preference.",
    ],
    setupSteps: [
      "Choose Tiers and Award or Avoid.",
      "Choose the station event type, such as landing or layover.",
      "Select one or more airport or station values.",
      "Optionally add a date scope or layover duration when the dialog exposes it.",
    ],
    fieldDetails: [
      field("Event type", "Controls what airport event is checked, such as landing or layover."),
      field("Stations", "The airport or station codes that should match."),
      field("Available options", "Airport and city options depend on the current account, base, period, selected event type, and search text."),
      field("Layover duration", "Optional duration rule when layover airport behavior is being configured."),
      field("Limit to Event Date", "Optional. Event Date is the date of the airport event being evaluated."),
    ],
    example: "Mary awards pairings with a YYZ layover, or avoids pairings that pass through a station she does not want.",
    saveResult: [
      "The saved rule evaluates station behavior in pairings.",
      "It is reusable because it stores station criteria rather than exact pairing rows.",
    ],
    watchOut: [
      "Route Station and Layover Station in Pairing Filters only narrow the Pairing Preference list.",
      "Use this condition when the station rule itself should be saved.",
      "No airports or cities match means the current search and event type returned no selectable option; try a different airport, city, or event type.",
    ],
    visibleContexts: [currentPairing(168), standingPairing(168)],
  },
  {
    id: "efficient-flying-first",
    propertyCode: 428,
    name: "Efficient Flying First",
    group: "pairing",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Requests higher-efficiency flying before less efficient flying.",
    screenshot: screenshot("efficient-flying-first", "Efficient Flying First"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> PAIRING -> Add Efficient Flying First.",
      "Standing Bid: Lineholder -> Pairing -> Efficient Flying First.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Confirm the configured efficient-flying mode.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Efficiency mode", "The company-configured definition for efficient flying."),
      field("Tiers", "Controls how strongly this ranking preference is applied."),
    ],
    example: "Mary wants more productive flying time rather than long low-credit pairings.",
    saveResult: [
      "The saved rule becomes a ranking preference.",
      "It does not require selecting exact pairing rows.",
    ],
    watchOut: [
      "Use Pairing Preference when the desired result is one exact pairing.",
      "This condition depends on the configured efficient-flying definition.",
    ],
    visibleContexts: [currentPairing(428), standingPairing(428)],
  },
  {
    id: "minimum-base-layover",
    propertyCode: 407,
    name: "Minimum Base Layover",
    group: "roster-line",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Sets a minimum rest or layover duration at base before the next work block.",
    screenshot: screenshot("minimum-base-layover", "Minimum Base Layover"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> ROSTER -> Add Minimum Base Layover.",
      "Standing Bid: Lineholder -> Roster / Line -> Minimum Base Layover.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Enter the minimum base layover duration.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Minimum duration", "The minimum base layover requested before another work block."),
      field("Configured bounds", "The Portal uses company configuration to decide valid duration limits."),
      field("Tiers", "Controls where this line-shape preference sits in priority."),
    ],
    example: "Mary wants at least 13:00 at base before starting the next block.",
    saveResult: [
      "The saved condition shapes the final line, not a single pairing row.",
      "It appears under line properties in the draft.",
    ],
    watchOut: [
      "Use this for base layover spacing. Use Airport Preference for station or layover station matching.",
      "Invalid durations are blocked by the dialog.",
    ],
    visibleContexts: [currentLine(407), standingLine(407)],
  },
  {
    id: "commuter-pattern",
    propertyCode: 408,
    name: "Commuter Pattern",
    group: "roster-line",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Requests a work-days-on and days-off pattern that supports commuter-friendly schedules.",
    screenshot: screenshot("commuter-pattern", "Commuter Pattern"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> ROSTER -> Add Commuter Pattern.",
      "Standing Bid: Lineholder -> Roster / Line -> Commuter Pattern.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Set minimum and maximum work days on.",
      "Set minimum days off after the work block.",
      "Optionally limit the pattern to a date range.",
    ],
    fieldDetails: [
      field("Min days on", "The shortest acceptable work block."),
      field("Max days on", "The longest acceptable work block."),
      field("Minimum days off", "The minimum off block after working."),
      field("Date range", "Optional. Limits where this pattern is applied."),
    ],
    example: "Mary commutes and wants 4 to 5 work days followed by at least 4 days off.",
    saveResult: [
      "The saved condition asks for an overall monthly pattern.",
      "It does not pick exact pairings or exact days off.",
    ],
    watchOut: [
      "If a date range is used, make sure it is long enough for the configured work/off pattern.",
      "Use Prefer Off when exact off dates matter more than pattern shape.",
    ],
    visibleContexts: [currentLine(408), standingLine(408)],
  },
  {
    id: "mixed-line-bid",
    propertyCode: 427,
    name: "Mixed Line Bid",
    group: "roster-line",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Controls whether the line may mix pairing work and reserve work, or restricts it to one type.",
    screenshot: screenshot("mixed-line-bid", "Mixed Line Bid"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> ROSTER -> Add Mixed Line Bid.",
      "Standing Bid: Lineholder -> Roster / Line -> Mixed Line Bid.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Choose Mixed Line, Reserve Only, or Pairing Only.",
      "If reserve work is included, complete any short-call settings shown by the dialog.",
      "Save the condition when a restriction is needed.",
    ],
    fieldDetails: [
      field("Mixed Line", "Default behavior. The crew can receive either flying first and reserve later if the system needs it."),
      field("Reserve Only", "Requests a reserve-only line."),
      field("Pairing Only", "Requests a pairing-only line."),
      field("Short-call rows", "Optional reserve detail rows when reserve-only behavior needs short-call configuration."),
    ],
    example: "Mary wants Pairing Only in T1 but can accept the default Mixed Line behavior in lower Tiers.",
    saveResult: [
      "Reserve Only and Pairing Only save an explicit restriction.",
      "Mixed Line is the default and normally does not need a saved 427 restriction.",
    ],
    watchOut: [
      "This is the current display name for the old Reserve line-rule entry.",
      "Saving Pairing Only or Reserve Only changes line shape, not a specific pairing filter.",
    ],
    visibleContexts: [currentLine(427), standingLine(427)],
  },
  {
    id: "credit-window-preference",
    propertyCode: 429,
    name: "Credit Window Preference",
    group: "roster-line",
    availableIn: ["Current Bid", "Standing Bid"],
    purpose: "Requests a configured credit direction for the final line.",
    screenshot: screenshot("credit-window-preference", "Credit Window Preference"),
    openFrom: [
      "Bid page: ADD BID PROPERTIES -> ROSTER -> Add Credit Window Preference.",
      "Standing Bid: Lineholder -> Roster / Line -> Credit Window Preference.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Choose the credit direction shown in the dialog.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Direction", "The configured choice, usually more or less credit."),
      field("Company delta", "The amount comes from company configuration, not from free text entry."),
      field("Tiers", "Controls priority for this line-credit preference."),
    ],
    example: "Mary wants her line to trend toward more credit within the configured credit window.",
    saveResult: [
      "The saved rule shapes final line credit direction.",
      "It does not change Dashboard Existing Credit, which is informational crew data.",
    ],
    watchOut: [
      "Use this for final line credit direction, not for pairing table credit filtering.",
      "Pairing Filters credit only narrows selectable Pairing Preference rows.",
    ],
    visibleContexts: [currentLine(429), standingLine(429)],
  },
  {
    id: "reserve-preference",
    propertyCode: 301,
    name: "Reserve Preference",
    group: "roster-line",
    availableIn: ["Bid", "Standing Bid"],
    purpose: "Requests a reserve short-call type for selected dates and Tiers.",
    screenshot: screenshot("reserve-preference", "Reserve Preference"),
    openFrom: [
      "Bid: ADD BID PROPERTIES -> ROSTER -> Reserve Preference.",
      "Standing Bid: ADD STANDING BID -> ROSTER -> Reserve Preference.",
    ],
    setupSteps: [
      "Choose the Tiers.",
      "Choose the short-call type shown for your crew type.",
      "Choose the Date Scope. Current Bid Reserve Preference can use Whole Month, First Half, Second Half, Date Range, or Specific Dates. Standing Bid Reserve Preference supports Whole Month, First Half, or Second Half only.",
      "Save the condition.",
    ],
    fieldDetails: [
      field("Short-call type", "The reserve type being requested. The list comes from company reserve configuration and is filtered by your crew type: pilot crews see P-series options such as PRAM, PRMM, or PRPM; cabin crews see C-series options such as CRAM or CRPM."),
      field("Date Scope", "Controls whether the reserve request is active for the whole month, a half month, a range, or specific dates."),
      field("Specific dates", "Used when Date Scope is Specific dates."),
      field("Tiers", "Controls priority of the reserve preference."),
    ],
    example: "A pilot crew can request PRAM for the whole month. A cabin crew can request CRPM for only the first half of the month.",
    saveResult: [
      "The saved reserve preference appears with the other Roster conditions for the selected Tier.",
      "Internally, Current Bid keeps this property in the reserve draft and Standing Bid keeps it in the StandingReserve draft so downstream save/export behavior stays unchanged.",
    ],
    watchOut: [
      "There is no separate Reserve page or RESERVE tab. Use ROSTER for Reserve Preference.",
      "If no short-call type is shown, the company reserve call-type configuration is missing for your crew type.",
      "Reserve Date Scope controls when reserve preference is active. It is not the same as Pairing event-date, flight-date, or pairing-start-date limits.",
      "Standing Bid Reserve Preference supports Whole Month, First Half, or Second Half only; use Current Bid for exact date ranges or specific dates.",
    ],
    visibleContexts: [
      { bidContext: "Current", bidType: "Reserve", propertyCode: 301 },
      { bidContext: "StandingReserve", bidType: "Reserve", propertyCode: 301 },
    ],
  },
];

export const BID_CONDITION_HELP_ENTRIES: BidConditionHelpEntry[] = BID_CONDITION_HELP_ENTRY_BASE.map((entry) => ({
  ...entry,
  controlGuides: ENTRY_CONTROL_GUIDES[entry.id] ?? [],
}));

export const getBidConditionEntriesByGroup = (group: BidConditionGroup): BidConditionHelpEntry[] =>
  BID_CONDITION_HELP_ENTRIES.filter((entry) => entry.group === group);

export const getStandingBidConditionEntries = (): BidConditionHelpEntry[] =>
  BID_CONDITION_HELP_ENTRIES.filter((entry) =>
    entry.visibleContexts.some((context) =>
      context.bidContext === "StandingLineholder" || context.bidContext === "StandingReserve"));
