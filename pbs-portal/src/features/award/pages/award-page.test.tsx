import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppProviders } from "@/app/providers/app-providers";
import { AwardPage } from "@/features/award/pages/award-page";
import { queryClient } from "@/shared/query/query-client";
import { awardService } from "@/shared/services/award-service";
import type { PbsAwardCurrentResponse } from "../../../../../packages/contracts/pbs-award-results.js";

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
};

const awardResponse: PbsAwardCurrentResponse = {
  rosterPeriodId: 75,
  periodCode: "Jun 2026",
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
    tier: null,
    offDays: 1,
    creditMinutes: 425,
    premiumMinutes: null,
    pairingCount: 1,
    activityCount: 1,
    warnings: [],
  },
  calendar: {
    monthLabel: "JUN 2026",
    weekdayLabels: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
    events: [
      {
        id: "pairing-2001",
        type: "pairing",
        label: "V4558",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        startTime: "0020",
        endTime: "0355",
        tone: "blue",
        readonly: true,
        sourceItemIds: ["pairing-2001"],
      },
      {
        id: "day-off-2026-06-03",
        type: "day_off",
        label: "DO",
        startDate: "2026-06-03",
        endDate: "2026-06-04",
        startTime: "0001",
        endTime: "0000",
        tone: "green",
        readonly: true,
        sourceItemIds: ["day-off-2026-06-03"],
      },
      {
        id: "activity-2026-06-05-SIM",
        type: "activity",
        label: "SIM",
        startDate: "2026-06-05",
        endDate: "2026-06-05",
        startTime: "1200",
        endTime: "1600",
        tone: "yellow",
        readonly: true,
        sourceItemIds: ["activity-2026-06-05-SIM"],
      },
    ],
  },
  items: [
    {
      id: "pairing-2001",
      type: "pairing",
      label: "V4558",
      pairingId: "2001",
      pairingCode: "V4558",
      assignment: "FLY",
      assignmentGroup: "FLY",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      startTime: "0020",
      endTime: "0355",
      base: "YVR",
      fleet: "737",
      position: "CA",
      matchedTier: null,
      awardPriority: null,
      explanation: "Matched your Tier 3 pairing preferences.",
      creditMinutes: 185,
      creditMissingReason: null,
      blockMinutes: 185,
      tafbDays: 1,
      legEquipmentMissingReason: null,
      legs: [
        {
          id: "101",
          dutySeq: 1,
          segmentSeq: 1,
          day: "01",
          flightNumber: "F8808",
          deadhead: false,
          depAirport: "YVR",
          arrAirport: "YYC",
          depTime: "0020",
          arrTime: "0150",
          blockMinutes: 90,
          creditMinutes: 90,
          equipment: "7M8",
          equipmentMissing: false,
        },
        {
          id: "102",
          dutySeq: 2,
          segmentSeq: 1,
          day: "02",
          flightNumber: "F8809",
          deadhead: false,
          depAirport: "YYC",
          arrAirport: "YVR",
          depTime: "0220",
          arrTime: "0355",
          blockMinutes: 95,
          creditMinutes: 95,
          equipment: "7M8",
          equipmentMissing: false,
        },
      ],
    },
    {
      id: "day-off-2026-06-03",
      type: "day_off",
      label: "Day Off",
      pairingId: null,
      pairingCode: null,
      assignment: "DO",
      assignmentGroup: "DO",
      startDate: "2026-06-03",
      endDate: "2026-06-04",
      startTime: "0001",
      endTime: "0000",
      base: null,
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
    {
      id: "activity-2026-06-05-SIM",
      type: "activity",
      label: "SIM",
      pairingId: null,
      pairingCode: null,
      assignment: "SIM",
      assignmentGroup: "TRAIN",
      startDate: "2026-06-05",
      endDate: "2026-06-05",
      startTime: "1200",
      endTime: "1600",
      base: "YVR",
      fleet: null,
      position: null,
      matchedTier: null,
      awardPriority: null,
      explanation: null,
      creditMinutes: 240,
      creditMissingReason: null,
      blockMinutes: null,
      tafbDays: null,
      legEquipmentMissingReason: null,
      legs: [],
    },
  ],
  reasonReport: {
    available: true,
    items: [
      {
        id: "pairing-2001",
        kind: "awarded_pairing",
        pairingId: "2001",
        pairingCode: "V4558",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        explanation: "Matched your Tier 1 pairing preferences.",
      },
      {
        id: "pairing-2002",
        kind: "awarded_pairing",
        pairingId: "2002",
        pairingCode: "V4559",
        startDate: "2026-06-04",
        endDate: "2026-06-04",
        explanation: "Matched your Tier 2 pairing preferences.",
      },
      {
        id: "pairing-2003",
        kind: "awarded_pairing",
        pairingId: "2003",
        pairingCode: "V4560",
        startDate: "2026-06-07",
        endDate: "2026-06-08",
        explanation: "Matched your Tier 3 pairing preferences.",
      },
      {
        id: "pairing-2004",
        kind: "awarded_pairing",
        pairingId: "2004",
        pairingCode: "V4561",
        startDate: "2026-06-10",
        endDate: "2026-06-10",
        explanation: "Matched your Tier 4 pairing preferences.",
      },
    ],
  },
};

const buildExtraActivityItem = (index: number): PbsAwardCurrentResponse["items"][number] => {
  const day = String(index + 5).padStart(2, "0");
  const label = `TRN${String(index).padStart(2, "0")}`;

  return {
    id: `activity-extra-${index}`,
    type: "activity",
    label,
    pairingId: null,
    pairingCode: null,
    assignment: label,
    assignmentGroup: "TRAIN",
    startDate: `2026-06-${day}`,
    endDate: `2026-06-${day}`,
    startTime: "0800",
    endTime: "1000",
    base: "YVR",
    fleet: null,
    position: null,
    matchedTier: null,
    awardPriority: null,
    explanation: null,
    creditMinutes: 120,
    creditMissingReason: null,
    blockMinutes: null,
    tafbDays: null,
    legEquipmentMissingReason: null,
    legs: [],
  };
};

const buildVacItem = (index: number): PbsAwardCurrentResponse["items"][number] => {
  const startDay = 22 + index;
  const endDay = startDay + 1;
  const startDate = `2026-06-${String(startDay).padStart(2, "0")}`;
  const endDate = `2026-06-${String(endDay).padStart(2, "0")}`;

  return {
    id: `activity-${startDate}-VAC`,
    type: "activity",
    label: "VAC",
    pairingId: null,
    pairingCode: null,
    assignment: "VAC",
    assignmentGroup: "LEAVE",
    startDate,
    endDate,
    startTime: "0000",
    endTime: "0000",
    base: "YVR",
    fleet: null,
    position: null,
    matchedTier: null,
    awardPriority: null,
    explanation: null,
    creditMinutes: 240,
    creditMissingReason: null,
    blockMinutes: null,
    tafbDays: null,
    legEquipmentMissingReason: null,
    legs: [],
  };
};

const renderAwardPage = () =>
  render(
    <AppProviders>
      <AwardPage />
    </AppProviders>,
  );

describe("AwardPage", () => {
  beforeEach(() => {
    setViewportWidth(1920);
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValue(structuredClone(awardResponse));
    vi.spyOn(awardService, "getAwardPeriods").mockResolvedValue({
      periods: [{
        rosterPeriodId: 75,
        periodCode: "Jun 2026",
        rpStart: "2026-06-01",
        rpEnd: "2026-06-30",
        lifecycleStage: "PUBLISHED",
        awardPublishAt: "2026-05-20T00:00:00.000Z",
        awardFinalAt: "2026-05-22T00:00:00.000Z",
        misAwardDeadlineAt: "2026-05-26T00:00:00.000Z",
        firstPublishedAt: "2026-05-20T00:05:00.000Z",
        latestPublishedAt: "2026-05-20T00:05:00.000Z",
      }],
    });
    vi.spyOn(awardService, "getAwardByPeriodId").mockResolvedValue(structuredClone(awardResponse));
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    queryClient.clear();
    setViewportWidth(1024);
  });

  it("loads award results through the service boundary and renders the approved layout", async () => {
    const serviceSpy = vi.spyOn(awardService, "getCurrentAward");

    renderAwardPage();

    expect(screen.getByRole("status", { name: "Loading award results..." })).toBeInTheDocument();
    expect(screen.getByTestId("award-page-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("award-loading-detail-grid").className).toContain("grid-cols-[1.1fr_0.9fr]");

    await waitFor(() => {
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });

    const awardResultsPage = await screen.findByTestId("award-results-page");

    expect(screen.getByTestId("award-page-viewport")).toBeInTheDocument();
    expect(screen.getByTestId("award-page-canvas")).toBeInTheDocument();
    expect(awardResultsPage).toBeInTheDocument();
    expect(awardResultsPage.className).toContain("h-[var(--portal-page-shell-height)]");
    expect(screen.getByRole("heading", { name: "Award" })).toBeInTheDocument();
    expect(screen.getByText("Published · Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("JUN 2026 Award Calendar")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("BIDDING CALENDAR");
    expect(screen.getByTestId("award-detail-grid").className).toContain("grid-cols-[1.1fr_0.9fr]");
    expect(screen.getByTestId("award-month-calendar")).toBeInTheDocument();
    expect(screen.queryByTestId("award-month-calendar-scroll")).not.toBeInTheDocument();
    expect(screen.getAllByText(/V4558/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Off/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SIM/).length).toBeGreaterThan(0);
    expect(screen.getByText("YVR Local Time")).toBeInTheDocument();
    const calendarSegments = screen.getAllByTestId("award-calendar-time-segment");
    expect(calendarSegments).toHaveLength(3);
    const getCalendarSegmentByTitlePrefix = (titlePrefix: string) => {
      const segment = calendarSegments.find((candidate) => candidate.getAttribute("title")?.startsWith(titlePrefix));

      expect(segment).toBeDefined();
      return segment!;
    };
    const pairingSegment = getCalendarSegmentByTitlePrefix("V4558");
    const dayOffSegment = getCalendarSegmentByTitlePrefix("DO");
    const activitySegment = getCalendarSegmentByTitlePrefix("SIM");

    expect(pairingSegment).toHaveAttribute("data-start-offset", "1.014");
    expect(pairingSegment).toHaveAttribute("data-end-offset", "2.163");
    expect(pairingSegment).toHaveTextContent("V4558");
    expect(pairingSegment).not.toHaveTextContent("00:20");
    expect(pairingSegment.className).toContain("bg-[#4FCFED]");
    expect(pairingSegment.className).toContain("text-white");
    expect(dayOffSegment).toHaveAttribute("data-start-offset", "3.001");
    expect(dayOffSegment).toHaveAttribute("data-end-offset", "4");
    expect(dayOffSegment).toHaveTextContent("DO");
    expect(dayOffSegment.className).toContain("bg-[#3DC0A9]");
    expect(activitySegment).toHaveTextContent("SIM");
    expect(activitySegment.className).toContain("bg-[#F5B507]");
    expect(calendarSegments.every((segment) => segment.dataset.conflict === "false")).toBe(true);

    const summary = screen.getByLabelText("Award summary");
    expect(within(summary).getByText("Period")).toBeInTheDocument();
    expect(within(summary).getByText("Jun 01 ~ Jun 30")).toBeInTheDocument();
    expect(within(summary).getByText("Duties")).toBeInTheDocument();
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("Days Off")).toBeInTheDocument();
    expect(within(summary).getByText("Pairings")).toBeInTheDocument();
    expect(within(summary).getByText("Credit Hours")).toBeInTheDocument();
    expect(within(summary).getByText("7:05")).toBeInTheDocument();
    expect(within(summary).getByText("Block Hours")).toBeInTheDocument();
    expect(within(summary).getByText("3:05")).toBeInTheDocument();
    expect(within(summary).queryByText("Tier")).not.toBeInTheDocument();
    expect(within(summary).queryByText("Premium PRM")).not.toBeInTheDocument();
    expect(within(summary).queryByText("Activities")).not.toBeInTheDocument();

    const rosterDetailsPanel = screen.getByTestId("award-roster-details-panel");
    expect(within(rosterDetailsPanel).getByText("Roster Details")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).getByText("Code")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).queryByText("Tier")).not.toBeInTheDocument();
    expect(within(rosterDetailsPanel).getByText("Duty / Activity")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).getByText("Position")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).getAllByText("V4558").length).toBeGreaterThan(0);
    expect(within(rosterDetailsPanel).getByText("Jun 01 00:20")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).getByText("YVR-YYC-YVR")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).getAllByText("CA").length).toBeGreaterThan(0);
    expect(within(rosterDetailsPanel).getAllByText("3:05").length).toBeGreaterThan(0);
    expect(within(rosterDetailsPanel).getByText("3 duties · 3 rows")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).queryByText("Sort by Start Time")).not.toBeInTheDocument();
    expect(within(rosterDetailsPanel).queryByText("Show: All")).not.toBeInTheDocument();
    expect(within(rosterDetailsPanel).queryByText("View all duties")).not.toBeInTheDocument();
    const selectedDutyDetails = within(rosterDetailsPanel).getByTestId("award-selected-duty-details");
    expect(within(selectedDutyDetails).getByText("Selected Duty")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByTestId("award-selected-pairing-card")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("F8808")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("F8809")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("PAIRING FLEET:")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("TAFB:")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("2 days")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getAllByText("7M8")).toHaveLength(2);
    expect(within(selectedDutyDetails).queryByText(/Missing/)).not.toBeInTheDocument();
    expect(within(selectedDutyDetails).getByLabelText("Award Explanation")).toHaveTextContent(
      "Matched your Tier 3 pairing preferences.",
    );
    const reportPreview = screen.getByLabelText("Reason report preview");
    expect(within(reportPreview).getByRole("heading", { name: "Reason Report Preview" })).toBeInTheDocument();
    expect(within(reportPreview).getByText("Matched your Tier 1 pairing preferences.")).toBeInTheDocument();
    expect(within(reportPreview).getByText("Matched your Tier 2 pairing preferences.")).toBeInTheDocument();
    expect(within(reportPreview).getByText("Matched your Tier 3 pairing preferences.")).toBeInTheDocument();
    expect(within(reportPreview).queryByText("Matched your Tier 4 pairing preferences.")).not.toBeInTheDocument();
    expect(within(reportPreview).getByText("+ 1 more explanation")).toBeInTheDocument();
  });

  it("switches to a historical published period through the period selector", async () => {
    const mayResponse = structuredClone(awardResponse);
    mayResponse.rosterPeriodId = 74;
    mayResponse.periodCode = "May 2026";
    mayResponse.calendar.monthLabel = "MAY 2026";
    vi.mocked(awardService.getAwardPeriods).mockResolvedValue({
      periods: [
        {
          rosterPeriodId: 75,
          periodCode: "Jun 2026",
          rpStart: "2026-06-01",
          rpEnd: "2026-06-30",
          lifecycleStage: "PUBLISHED",
          awardPublishAt: "2026-05-20T00:00:00.000Z",
          awardFinalAt: "2026-05-22T00:00:00.000Z",
          misAwardDeadlineAt: "2026-05-26T00:00:00.000Z",
          firstPublishedAt: "2026-05-20T00:05:00.000Z",
          latestPublishedAt: "2026-05-20T00:05:00.000Z",
        },
        {
          rosterPeriodId: 74,
          periodCode: "May 2026",
          rpStart: "2026-05-01",
          rpEnd: "2026-05-31",
          lifecycleStage: "FINAL",
          awardPublishAt: "2026-04-20T00:00:00.000Z",
          awardFinalAt: "2026-04-22T00:00:00.000Z",
          misAwardDeadlineAt: "2026-04-26T00:00:00.000Z",
          firstPublishedAt: "2026-04-20T00:05:00.000Z",
          latestPublishedAt: "2026-04-20T00:05:00.000Z",
        },
      ],
    });
    vi.mocked(awardService.getAwardByPeriodId).mockResolvedValue(mayResponse);

    renderAwardPage();
    const selector = await screen.findByTestId("award-period-select");
    fireEvent.change(selector, { target: { value: "74" } });

    expect(await screen.findByText("Published · May 2026")).toBeInTheDocument();
    expect(awardService.getAwardByPeriodId).toHaveBeenCalledWith(74);
  });

  it("opens the complete reason report and returns focus when closed", async () => {
    renderAwardPage();

    const reportButton = await screen.findByRole("button", { name: "View Reason Report" });
    fireEvent.click(reportButton);

    const dialog = await screen.findByRole("dialog", { name: "Award Reason Report" });
    expect(within(dialog).getByText("Jun 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("Matched your Tier 1 pairing preferences.")).toBeInTheDocument();
    expect(within(dialog).getByText("Matched your Tier 2 pairing preferences.")).toBeInTheDocument();
    expect(within(dialog).getByText("Matched your Tier 3 pairing preferences.")).toBeInTheDocument();
    expect(within(dialog).getByText("Matched your Tier 4 pairing preferences.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Award Reason Report" })).not.toBeInTheDocument();
      expect(reportButton).toHaveFocus();
    });
  });

  it("updates selected duty details from roster row interactions", async () => {
    renderAwardPage();

    const rosterDetailsPanel = await screen.findByTestId("award-roster-details-panel");
    const rosterDetailsScroll = within(rosterDetailsPanel).getByTestId("award-roster-details-scroll");
    const selectedDutyDetails = within(rosterDetailsPanel).getByTestId("award-selected-duty-details");

    const simRow = within(rosterDetailsScroll).getByText("Jun 05 12:00").closest("tr");
    expect(simRow).not.toBeNull();
    fireEvent.click(simRow!);

    expect(within(selectedDutyDetails).getByTestId("award-selected-activity-card")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("SIM · SIM")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("12:00 - 16:00")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("Location / Assignment")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("YVR")).toBeInTheDocument();
    expect(within(selectedDutyDetails).queryByLabelText("Award Explanation")).not.toBeInTheDocument();

    const dayOffRow = within(rosterDetailsScroll).getByText("Jun 03 00:01").closest("tr");
    expect(dayOffRow).not.toBeNull();
    fireEvent.keyDown(dayOffRow!, { key: "Enter" });

    expect(within(selectedDutyDetails).getByText("Day Off · Day Off")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getByText("00:01 - 00:00")).toBeInTheDocument();
    expect(dayOffRow).toHaveAttribute("aria-selected", "true");
  });

  it("groups continuous roster rows and selects the whole task from the calendar", async () => {
    const vacItems = Array.from({ length: 5 }, (_, index) => buildVacItem(index));
    const vacItemIds = vacItems.map((item) => item.id);

    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      summary: {
        ...structuredClone(awardResponse.summary),
        activityCount: 6,
        creditMinutes: 1_625,
      },
      calendar: {
        ...structuredClone(awardResponse.calendar),
        events: [
          ...structuredClone(awardResponse.calendar.events),
          {
            id: "calendar-activity-VAC-2026-06-22T0000-2026-06-27T0000",
            type: "activity",
            label: "VAC",
            startDate: "2026-06-22",
            endDate: "2026-06-27",
            startTime: "0000",
            endTime: "0000",
            tone: "yellow",
            readonly: true,
            sourceItemIds: vacItemIds,
          },
        ],
      },
      items: [...structuredClone(awardResponse.items), ...vacItems],
    });

    renderAwardPage();

    const rosterDetailsPanel = await screen.findByTestId("award-roster-details-panel");
    const rosterDetailsScroll = within(rosterDetailsPanel).getByTestId("award-roster-details-scroll");
    const selectedDutyDetails = within(rosterDetailsPanel).getByTestId("award-selected-duty-details");
    const vacCalendarButton = screen.getByRole("button", {
      name: "VAC from Jun 22 00:00 to Jun 27 00:00",
    });

    expect(within(rosterDetailsPanel).getByText("8 duties · 4 rows")).toBeInTheDocument();
    expect(within(rosterDetailsScroll).getByText("Jun 22 00:00")).toBeInTheDocument();
    expect(within(rosterDetailsScroll).queryByText("Jun 23 00:00")).not.toBeInTheDocument();

    fireEvent.click(vacCalendarButton);

    const vacRow = within(rosterDetailsScroll).getByText("Jun 22 00:00").closest("tr");

    expect(vacCalendarButton).toHaveAttribute("aria-pressed", "true");
    expect(vacRow).toHaveAttribute("aria-selected", "true");
    expect(within(selectedDutyDetails).getByText("VAC · VAC")).toBeInTheDocument();
    expect(within(selectedDutyDetails).getAllByText("Jun 22 - Jun 27").length).toBeGreaterThan(0);
    expect(within(selectedDutyDetails).getByText("20:00")).toBeInTheDocument();
  });

  it("keeps roster rows stable when calendar source item ids are duplicated or unknown", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      calendar: {
        ...structuredClone(awardResponse.calendar),
        events: [
          ...structuredClone(awardResponse.calendar.events),
          {
            id: "activity-duplicate-source",
            type: "activity",
            label: "SIM",
            startDate: "2026-06-05",
            endDate: "2026-06-05",
            startTime: "1700",
            endTime: "1800",
            tone: "yellow",
            readonly: true,
            sourceItemIds: [
              "activity-2026-06-05-SIM",
              "activity-2026-06-05-SIM",
              "unknown-item",
            ],
          },
          {
            id: "activity-unknown-source",
            type: "activity",
            label: "UNK",
            startDate: "2026-06-06",
            endDate: "2026-06-06",
            startTime: "0800",
            endTime: "0900",
            tone: "yellow",
            readonly: true,
            sourceItemIds: ["unknown-item"],
          },
        ],
      },
    });

    renderAwardPage();

    const rosterDetailsPanel = await screen.findByTestId("award-roster-details-panel");
    const rosterDetailsScroll = within(rosterDetailsPanel).getByTestId("award-roster-details-scroll");
    const rosterRows = within(rosterDetailsScroll).getAllByRole("row");

    expect(within(rosterDetailsPanel).getByText("3 duties · 3 rows")).toBeInTheDocument();
    expect(rosterRows).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", {
      name: "SIM from Jun 05 17:00 to Jun 05 18:00",
    }));

    expect(within(rosterDetailsPanel).getByText("SIM · SIM")).toBeInTheDocument();
  });

  it("shows missing published data instead of unsafe pairing credit totals", async () => {
    const missingCreditReason = "Published roster snapshot is missing duty_seq, so pairing credit cannot be safely deduplicated.";

    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      summary: {
        ...structuredClone(awardResponse.summary),
        creditMinutes: null,
        warnings: [missingCreditReason],
      },
      items: structuredClone(awardResponse.items).map((item) =>
        item.type === "pairing"
          ? {
              ...item,
              creditMinutes: null,
              creditMissingReason: missingCreditReason,
              legs: item.legs.map((leg) => ({
                ...leg,
                dutySeq: null,
              })),
            }
          : item,
      ),
    });

    renderAwardPage();

    const rosterDetailsPanel = await screen.findByTestId("award-roster-details-panel");
    const selectedDutyDetails = within(rosterDetailsPanel).getByTestId("award-selected-duty-details");

    expect(screen.getAllByText(missingCreditReason).length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText("Award summary")).getByText("Missing data")).toBeInTheDocument();
    expect(within(rosterDetailsPanel).getAllByText("Missing data").length).toBeGreaterThan(0);
    expect(within(selectedDutyDetails).getByText((content) => content.includes(missingCreditReason))).toBeInTheDocument();
    const missingCreditRows = within(selectedDutyDetails).getAllByRole("row").slice(1);
    expect(missingCreditRows).toHaveLength(2);
    for (const row of missingCreditRows) {
      expect(within(row).getAllByRole("cell")[8]).toHaveTextContent("Missing data");
    }
  });

  it("shows duty credit once for each duty in the selected pairing", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      items: structuredClone(awardResponse.items).map((item) =>
        item.type === "pairing"
          ? {
              ...item,
              creditMinutes: 300,
              legs: [
                {
                  ...item.legs[0]!,
                  id: "duty-1-segment-1",
                  dutySeq: 1,
                  segmentSeq: 1,
                  creditMinutes: 120,
                },
                {
                  ...item.legs[0]!,
                  id: "duty-1-segment-2",
                  dutySeq: 1,
                  segmentSeq: 2,
                  creditMinutes: 120,
                },
                {
                  ...item.legs[1]!,
                  id: "duty-2-segment-1",
                  dutySeq: 2,
                  segmentSeq: 1,
                  creditMinutes: 180,
                },
                {
                  ...item.legs[1]!,
                  id: "duty-2-segment-2",
                  dutySeq: 2,
                  segmentSeq: 2,
                  creditMinutes: 180,
                },
              ],
            }
          : item,
      ),
    });

    renderAwardPage();

    const selectedDutyDetails = await screen.findByTestId("award-selected-duty-details");
    const legRows = within(selectedDutyDetails).getAllByRole("row").slice(1);
    const creditCells = legRows.map((row) => within(row).getAllByRole("cell")[8]);

    expect(creditCells).toHaveLength(4);
    expect(creditCells[0]).toHaveTextContent("2:00");
    expect(creditCells[1]).toHaveTextContent("--");
    expect(creditCells[2]).toHaveTextContent("3:00");
    expect(creditCells[3]).toHaveTextContent("--");
    expect(within(selectedDutyDetails).queryByText("Duty", { exact: true })).not.toBeInTheDocument();
  });

  it("marks overlapping award calendar segments as conflicts", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      calendar: {
        ...structuredClone(awardResponse.calendar),
        events: [
          ...structuredClone(awardResponse.calendar.events),
          {
            id: "activity-overlap-2026-06-01",
            type: "activity",
            label: "OVL",
            startDate: "2026-06-01",
            endDate: "2026-06-01",
            startTime: "0100",
            endTime: "0300",
            tone: "yellow",
            readonly: true,
          },
        ],
      },
    });

    renderAwardPage();

    expect(await screen.findByText("OVL")).toBeInTheDocument();
    const calendarSegments = screen.getAllByTestId("award-calendar-time-segment");

    expect(calendarSegments.some((segment) => segment.dataset.conflict === "true")).toBe(true);
  });

  it("draws one same-week segment from the real start time through the real end time", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      calendar: {
        ...structuredClone(awardResponse.calendar),
        events: [
          {
            id: "pairing-3010",
            type: "pairing",
            label: "T4510",
            startDate: "2026-06-10",
            endDate: "2026-06-12",
            startTime: "1200",
            endTime: "1300",
            tone: "blue",
            readonly: true,
          },
        ],
      },
    });

    renderAwardPage();

    const calendarSegments = await screen.findAllByTestId("award-calendar-time-segment");

    expect(calendarSegments).toHaveLength(1);
    expect(calendarSegments[0]).toHaveAttribute("data-start-offset", "3.5");
    expect(calendarSegments[0]).toHaveAttribute("data-end-offset", "5.542");
    expect(calendarSegments[0]).toHaveTextContent("T4510");
  });

  it("marks only clipped week edges as continuations", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      calendar: {
        ...structuredClone(awardResponse.calendar),
        events: [
          {
            id: "activity-VAC-cross-week",
            type: "activity",
            label: "VAC",
            startDate: "2026-06-13",
            endDate: "2026-06-15",
            startTime: "1200",
            endTime: "1300",
            tone: "yellow",
            readonly: true,
          },
        ],
      },
    });

    renderAwardPage();

    const calendarSegments = await screen.findAllByTestId("award-calendar-time-segment");
    const firstWeekSegment = calendarSegments.find((segment) =>
      segment.getAttribute("data-start-offset") === "6.5");
    const secondWeekSegment = calendarSegments.find((segment) =>
      segment.getAttribute("data-start-offset") === "0");

    expect(calendarSegments).toHaveLength(2);
    expect(firstWeekSegment).toHaveAttribute("data-continues-before", "false");
    expect(firstWeekSegment).toHaveAttribute("data-continues-after", "true");
    expect(secondWeekSegment).toHaveAttribute("data-continues-before", "true");
    expect(secondWeekSegment).toHaveAttribute("data-continues-after", "false");
  });

  it("keeps real endpoints at week boundaries distinct from clipped continuations", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      calendar: {
        ...structuredClone(awardResponse.calendar),
        events: [
          {
            id: "activity-VAC-exact-week",
            type: "activity",
            label: "VAC",
            startDate: "2026-06-14",
            endDate: "2026-06-21",
            startTime: "0000",
            endTime: "0000",
            tone: "yellow",
            readonly: true,
          },
        ],
      },
    });

    renderAwardPage();

    const calendarSegments = await screen.findAllByTestId("award-calendar-time-segment");

    expect(calendarSegments).toHaveLength(1);
    expect(calendarSegments[0]).toHaveAttribute("data-start-offset", "0");
    expect(calendarSegments[0]).toHaveAttribute("data-end-offset", "7");
    expect(calendarSegments[0]).toHaveAttribute("data-continues-before", "false");
    expect(calendarSegments[0]).toHaveAttribute("data-continues-after", "false");
  });

  it("renders all roster detail rows in an internal scroll area", async () => {
    const extraItems = Array.from({ length: 15 }, (_, index) => buildExtraActivityItem(index + 1));

    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      items: [...structuredClone(awardResponse.items), ...extraItems],
    });

    renderAwardPage();

    const rosterDetailsPanel = await screen.findByTestId("award-roster-details-panel");
    const rosterDetailsScroll = within(rosterDetailsPanel).getByTestId("award-roster-details-scroll");
    const reasonReportPreview = screen.getByRole("region", { name: "Reason report preview" });

    expect(within(rosterDetailsPanel).getByText("18 duties · 18 rows")).toBeInTheDocument();
    expect(rosterDetailsPanel.className).not.toContain("100dvh");
    expect(rosterDetailsPanel.className).toContain("flex-1");
    expect(rosterDetailsScroll.className).toContain("overflow-y-auto");
    expect(reasonReportPreview.className).toContain("shrink-0");
    expect(within(rosterDetailsScroll).getAllByText("TRN15").length).toBeGreaterThan(0);
    expect(within(rosterDetailsPanel).queryByText("Total: 18 duties")).not.toBeInTheDocument();
    expect(within(rosterDetailsPanel).queryByText("View all duties")).not.toBeInTheDocument();
  });

  it("keeps reason report unavailable without using Layer terminology", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      reasonReport: {
        available: false,
        disabledReason: "No award explanations are available for this period.",
        items: [],
      },
    });

    renderAwardPage();

    const reportButton = await screen.findByRole("button", { name: "View Reason Report" });

    expect(reportButton).toBeDisabled();
    expect(screen.getByText("No award explanations are available for this period.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Missing");
    expect(document.body).not.toHaveTextContent(/\bLayer\b/i);
  });

  it("keeps award loading failures in the existing page error state", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockRejectedValueOnce(
      new Error("database password leaked"),
    );

    renderAwardPage();

    expect(await screen.findByTestId("award-page-error")).toHaveTextContent(
      "Unable to load the current award results.",
    );
    expect(screen.queryByLabelText("Reason report preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Award Reason Report" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("database password leaked");
  });

  it("shows a stable empty state when no published roster exists for the period", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      published: false,
      availability: "PUBLISH_PENDING",
      lifecycleStage: "PUBLISH_PENDING",
      summary: {
        tier: null,
        offDays: 0,
        creditMinutes: null,
        premiumMinutes: null,
        pairingCount: 0,
        activityCount: 0,
        warnings: [],
      },
      calendar: {
        ...awardResponse.calendar,
        events: [],
      },
      items: [],
      reasonReport: {
        available: false,
        disabledReason: "No award explanations are available for this period.",
        items: [],
      },
    });

    renderAwardPage();

    expect(await screen.findByTestId("award-empty-state")).toHaveTextContent(
      "The Award display date has arrived, but no matching published roster snapshot is available yet.",
    );
  });

  it("does not claim to show historical Award data when no readable published period exists", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      published: false,
      availability: "UNCONFIGURED",
      lifecycleStage: "UNCONFIGURED",
      upcomingPeriod: {
        rosterPeriodId: 76,
        periodCode: "Jul 2026",
        rpStart: "2026-07-01T00:00:00",
        rpEnd: "2026-07-31T23:59:59",
        lifecycleStage: "UNCONFIGURED",
        awardPublishAt: "2026-06-20T12:00:00.000Z",
        awardFinalAt: null,
        misAwardDeadlineAt: null,
      },
      items: [],
      calendar: { ...awardResponse.calendar, events: [] },
    });

    renderAwardPage();

    expect(await screen.findByTestId("award-empty-state")).toHaveTextContent(
      "The Award period or Award display date has not been configured.",
    );
    expect(screen.queryByText(/Showing the latest published Award/)).not.toBeInTheDocument();
  });

  it("explains historical fallback when a newer Period is not configured", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      published: true,
      availability: "AVAILABLE",
      lifecycleStage: "PUBLISHED",
      upcomingPeriod: {
        rosterPeriodId: 76,
        periodCode: "Jul 2026",
        rpStart: "2026-07-01T00:00:00",
        rpEnd: "2026-07-31T23:59:59",
        lifecycleStage: "UNCONFIGURED",
        awardPublishAt: "2026-06-20T12:00:00.000Z",
        awardFinalAt: null,
        misAwardDeadlineAt: null,
      },
    });

    renderAwardPage();

    expect(await screen.findByText(/Jul 2026 is not fully configured/)).toHaveTextContent(
      "Showing the latest published Award.",
    );
  });

  it("shows the planned Award display time before results become available", async () => {
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValueOnce({
      ...structuredClone(awardResponse),
      published: false,
      availability: "SCHEDULED",
      awardPublishAt: "2026-05-25T09:00:00.000Z",
      items: [],
      calendar: { ...awardResponse.calendar, events: [] },
    });

    renderAwardPage();

    expect(await screen.findByText("Scheduled · Jun 2026")).toBeInTheDocument();
    expect(screen.getByTestId("award-empty-state")).toHaveTextContent(
      "Award results are scheduled to become available on",
    );
  });
});
