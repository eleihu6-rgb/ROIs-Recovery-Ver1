import type { PbsBiddingCalendarCurrentResponse } from "../../../../packages/contracts/pbs-bidding-calendar.js";
import { buildDashboardScheduleDataFromBiddingCalendar } from "@/features/dashboard/bidding-calendar-mappers";
import type { CalendarDraftResponse } from "@/features/dashboard/dashboard-calendar-state";

const currentPeriod = {
  id: 4,
  rosterPeriodId: 4,
  rosterPeriodKey: "2026RP04",
  periodCode: "Apr 2026",
  computedStage: "OPEN" as const,
  rpStartLocal: "2026-04-01",
  rpEndLocal: "2026-04-30",
  canEditBid: true,
  readOnlyReason: null,
};

const buildCalendarResponse = (): PbsBiddingCalendarCurrentResponse => ({
  periodCode: "Apr 2026",
  bidContext: "Current",
  currentPeriod,
  activeTierRange: ["T1", "T2"],
  dayOffCapacity: [
    {
      date: "2026-04-05",
      requestedDayOffCount: 23,
      totalCrewCount: 120,
      pairingDemandCount: 69,
      reserveDemandCount: 8,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    },
  ],
  events: [
    {
      id: "weekend-2026-04-05",
      type: "weekend",
      label: "Weekend",
      startDate: "2026-04-05",
      endDate: "2026-04-05",
      tone: "muted",
      source: "computed",
      readonly: true,
    },
    {
      id: "day-off-1",
      type: "prefer_off_bid",
      tier: "T1",
      label: "Off",
      startDate: "2026-04-05",
      endDate: "2026-04-06",
      tone: "green",
      source: "pbs_bid_group",
      readonly: false,
    },
    {
      id: "pairing-bid-1",
      type: "pairing_bid",
      tier: "T1",
      label: "M4959",
      startDate: "2026-04-06",
      endDate: "2026-04-08",
      tone: "blue",
      source: "pbs_bid_group",
      readonly: true,
      metadata: {
        pairingNumber: "M4959",
        pairingId: "4959001",
        originDate: "2026-04-06",
        occurrenceMode: "specific_date",
      },
    },
    {
      id: "planned-absence-1",
      type: "planned_absence",
      label: "ANNUAL LEAVE",
      startDate: "2026-04-14",
      endDate: "2026-04-15",
      tone: "yellow",
      source: "live_roster",
      readonly: true,
    },
  ],
});

describe("buildDashboardScheduleDataFromBiddingCalendar", () => {
  it("maps day off, pairing, planned absence, and weekend data into the schedule panel", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(buildCalendarResponse(), "TIER-01");

    expect(result.monthLabel).toBe("APR 2026 · 2026-04-01 – 2026-04-30");
    expect(result.tierRows).toHaveLength(2);
    expect(result.tierRows[0]?.cells[4]).toBe("green");
    expect(result.tierRows[0]?.cells[5]).toBe("green");
    expect(result.tierRows[0]?.cells[6]).toBe("blue");
    expect(result.calendarCells.find((cell) => cell.isoDate === "2026-04-05")?.weekend).toBe(true);
    expect(result.calendarCells.find((cell) => cell.isoDate === "2026-04-05")?.dayOffCapacity).toEqual({
      requestedDayOffCount: 23,
      totalCrewCount: 120,
      pairingDemandCount: 69,
      reserveDemandCount: 8,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    });
    expect(result.calendarCells.find((cell) => cell.isoDate === "2026-04-05")?.metricBadges).toEqual([{
      type: "days_off",
      label: "DO",
      numerator: 23,
      denominator: 33,
      ariaLabel: "DO days off requests for 2026-04-05: 23 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
    }]);
    expect(result.calendarEvents).toHaveLength(3);
    expect(result.calendarEvents[0]).toMatchObject({
      row: 2,
      colStart: 1,
      colSpan: 2,
      top: 24,
      label: "Off",
      tone: "green",
      sourceEvent: {
        id: "day-off-1",
        type: "prefer_off_bid",
      },
    });
    expect(result.calendarEvents[1]).toMatchObject({
      row: 2,
      colStart: 2,
      colSpan: 3,
      top: 49,
      label: "M4959",
      tone: "blue",
      ariaLabel: "View pairing bid M4959",
      selectable: true,
      sourceEvent: {
        id: "pairing-bid-1",
        type: "pairing_bid",
        tier: "T1",
        metadata: {
          pairingNumber: "M4959",
          pairingId: "4959001",
          originDate: "2026-04-06",
          occurrenceMode: "specific_date",
        },
      },
    });
    expect(result.calendarEvents[2]).toMatchObject({
      row: 3,
      colStart: 3,
      colSpan: 2,
      top: 24,
      label: "ANNUAL LEAVE",
      tone: "yellow",
      sourceEvent: {
        id: "planned-absence-1",
        type: "planned_absence",
      },
    });
  });

  it("uses the editable day-off draft as the day-off overlay without dropping pairing events", () => {
    const dayOffDraft: CalendarDraftResponse = {
      draft: {
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        tiers: [
          {
            tier: "T1",
            dates: ["2026-04-10"],
          },
        ],
      },
    };

    const result = buildDashboardScheduleDataFromBiddingCalendar(
      buildCalendarResponse(),
      "TIER-01",
      dayOffDraft,
    );

    expect(result.tierRows[0]?.cells[4]).toBe("empty");
    expect(result.tierRows[0]?.cells[9]).toBe("green");
    expect(result.calendarEvents.some((event) => event.label === "M4959")).toBe(true);
    expect(result.calendarEvents.some((event) => event.label === "Off" && event.colStart === 6)).toBe(true);
  });

  it("adds reserve coverage as a second calendar metric when available", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      buildCalendarResponse(),
      "TIER-01",
      null,
      {
        reserveCoverage: {
          rosterPeriodId: 4,
          rpStartLocal: "2026-04-01",
          rpEndLocal: "2026-04-30",
          periodCode: "Apr 2026",
          baseCode: "YVR",
          days: [
            {
              date: "2026-04-05",
              requiredReserveCount: 12,
              availableOffCount: 33,
            },
          ],
          warnings: [],
        },
      },
    );

    const cell = result.calendarCells.find((candidate) => candidate.isoDate === "2026-04-05");

    expect(cell?.dayOffCapacity).toEqual({
      requestedDayOffCount: 23,
      totalCrewCount: 120,
      pairingDemandCount: 69,
      reserveDemandCount: 8,
      preAssignedDayOffCount: 10,
      maxDaysOffCount: 33,
    });
    expect(cell?.metricBadges).toEqual([
      {
        type: "days_off",
        label: "DO",
        numerator: 23,
        denominator: 33,
        ariaLabel: "DO days off requests for 2026-04-05: 23 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
      },
      {
        type: "reserve",
        label: "RES",
        numerator: 12,
        denominator: 33,
        ariaLabel: "RES reserve coverage for 2026-04-05: need 12; off 33",
      },
    ]);
  });

  it("keeps days off capacity when reserve coverage is unavailable", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      buildCalendarResponse(),
      "TIER-01",
      null,
      {
        reserveCoverage: null,
      },
    );

    expect(result.calendarCells.find((cell) => cell.isoDate === "2026-04-05")?.metricBadges).toEqual([{
      type: "days_off",
      label: "DO",
      numerator: 23,
      denominator: 33,
      ariaLabel: "DO days off requests for 2026-04-05: 23 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
    }]);
    expect(result.calendarEvents).toHaveLength(3);
  });

  it("defaults calendar events to T1 when no tier is selected", () => {
    const response = buildCalendarResponse();

    response.events.push({
      id: "pairing-bid-t2",
      type: "pairing_bid",
      tier: "T2",
      label: "T2PAIR",
      startDate: "2026-04-09",
      endDate: "2026-04-09",
      tone: "blue",
      source: "pbs_bid_group",
      readonly: true,
      metadata: {
        pairingNumber: "T2PAIR",
        pairingId: "2001",
        originDate: "2026-04-09",
        occurrenceMode: "specific_date",
      },
    });

    const defaultTierResult = buildDashboardScheduleDataFromBiddingCalendar(response, "");
    const t2Result = buildDashboardScheduleDataFromBiddingCalendar(response, "TIER-02");

    expect(defaultTierResult.calendarEvents.map((event) => event.label)).toEqual([
      "Off",
      "M4959",
      "ANNUAL LEAVE",
    ]);
    expect(t2Result.calendarEvents.map((event) => event.label)).toEqual([
      "T2PAIR",
      "ANNUAL LEAVE",
    ]);
  });

  it("uses periodCode only as a display label when the real roster range is valid", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      {
        periodCode: "bad-period",
        bidContext: "Current",
        currentPeriod,
        activeTierRange: ["T1"],
        events: [],
      },
      "TIER-01",
    );

    expect(result.title).toBe("BIDDING CALENDAR");
    expect(result.monthLabel).toBe("BAD-PERIOD · 2026-04-01 – 2026-04-30");
    expect(result.dayLabels).toHaveLength(30);
    expect(result.tierRows).toHaveLength(1);
    expect(result.calendarCells.some((cell) => cell.isoDate === "2026-04-01")).toBe(true);
    expect(result.calendarEvents).toEqual([]);
  });

  it("merges consecutive daily Prefer Off events from the bidding calendar into one bar", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      {
        periodCode: "Apr 2026",
        bidContext: "Current",
        currentPeriod,
        activeTierRange: ["T1"],
        events: [
          {
            id: "day-off-2026-04-06",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-06",
            endDate: "2026-04-06",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
          {
            id: "day-off-2026-04-07",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-07",
            endDate: "2026-04-07",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
          {
            id: "day-off-2026-04-08",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-08",
            endDate: "2026-04-08",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
        ],
      },
      "TIER-01",
    );

    expect(result.calendarEvents).toHaveLength(1);
    expect(result.calendarEvents[0]).toMatchObject({
      row: 2,
      colStart: 2,
      colSpan: 3,
      label: "Off",
      tone: "green",
    });
  });

  it("deduplicates overlapping Prefer Off events into one visual bar", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      {
        periodCode: "Apr 2026",
        bidContext: "Current",
        currentPeriod,
        activeTierRange: ["T1"],
        events: [
          {
            id: "prefer-off-list-2026-04-19",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-19",
            endDate: "2026-04-22",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
          {
            id: "prefer-off-range-2026-04-19",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-19",
            endDate: "2026-04-22",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
        ],
      },
      "TIER-01",
    );

    expect(result.calendarEvents).toHaveLength(1);
    expect(result.calendarEvents[0]).toMatchObject({
      row: 4,
      colStart: 1,
      colSpan: 4,
      top: 24,
      label: "Off",
      tone: "green",
    });
  });

  it("splits consecutive Prefer Off events at calendar week boundaries", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      {
        periodCode: "Apr 2026",
        bidContext: "Current",
        currentPeriod,
        activeTierRange: ["T1"],
        events: [
          {
            id: "day-off-2026-04-11",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-11",
            endDate: "2026-04-11",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
          {
            id: "day-off-2026-04-12",
            type: "prefer_off_bid",
            tier: "T1",
            label: "Off",
            startDate: "2026-04-12",
            endDate: "2026-04-12",
            tone: "green",
            source: "pbs_bid_group",
            readonly: false,
          },
        ],
      },
      "TIER-01",
    );

    expect(result.calendarEvents).toEqual([
      expect.objectContaining({
        row: 2,
        colStart: 7,
        colSpan: 1,
        label: "Off",
      }),
      expect.objectContaining({
        row: 3,
        colStart: 1,
        colSpan: 1,
        label: "Off",
      }),
    ]);
  });

  it("does not merge adjacent non-Off events with different ids", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      {
        periodCode: "Apr 2026",
        bidContext: "Current",
        currentPeriod,
        activeTierRange: ["T1"],
        events: [
          {
            id: "leave-2026-04-06",
            type: "planned_absence",
            tier: "T1",
            label: "LEAVE",
            startDate: "2026-04-06",
            endDate: "2026-04-06",
            tone: "yellow",
            source: "live_roster",
            readonly: true,
          },
          {
            id: "leave-2026-04-07",
            type: "planned_absence",
            tier: "T1",
            label: "LEAVE",
            startDate: "2026-04-07",
            endDate: "2026-04-07",
            tone: "yellow",
            source: "live_roster",
            readonly: true,
          },
        ],
      },
      "TIER-01",
    );

    expect(result.calendarEvents).toHaveLength(2);
    expect(result.calendarEvents.map((event) => event.colSpan)).toEqual([1, 1]);
  });

  it("merges overlapping same-tier pairing bars into one calendar event", () => {
    const result = buildDashboardScheduleDataFromBiddingCalendar(
      {
        periodCode: "Apr 2026",
        bidContext: "Current",
        currentPeriod,
        activeTierRange: ["T1"],
        events: [
          {
            id: "pairing-bid-1",
            type: "pairing_bid",
            tier: "T1",
            label: "C4101",
            startDate: "2026-04-08",
            endDate: "2026-04-10",
            tone: "blue",
            source: "pbs_bid_group",
            readonly: true,
            metadata: {
              propertyGroupKey: "pairing-property-key-1",
              pairingNumber: "C4101",
              pairingId: "410101",
              originDate: "2026-04-08",
              occurrenceMode: "specific_date",
            },
          },
          {
            id: "pairing-bid-2",
            type: "pairing_bid",
            tier: "T1",
            label: "C4102",
            startDate: "2026-04-08",
            endDate: "2026-04-08",
            tone: "blue",
            source: "pbs_bid_group",
            readonly: true,
            metadata: {
              propertyGroupKey: "pairing-property-key-2",
              pairingNumber: "C4102",
              pairingId: "410201",
              originDate: "2026-04-08",
              occurrenceMode: "specific_date",
            },
          },
        ],
      },
      "TIER-01",
    );

    expect(result.calendarEvents).toHaveLength(1);
    expect(result.calendarEvents[0]).toMatchObject({
      row: 2,
      colStart: 4,
      colSpan: 3,
      label: "C4101 +1",
      tone: "blue",
      sourceEvent: {
        metadata: {
          propertyGroupKeys: "pairing-property-key-1,pairing-property-key-2",
          pairingNumbers: "C4101,C4102",
          pairingBidEntries: "pairing-property-key-1|C4101|410101|2026-04-08|2026-04-08|2026-04-10; pairing-property-key-2|C4102|410201|2026-04-08|2026-04-08|2026-04-08",
          pairingCount: 2,
        },
      },
    });
  });
});
