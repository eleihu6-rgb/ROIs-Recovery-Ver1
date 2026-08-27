import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PairingPreferencePicker,
  type PairingPreferenceSelectionItem,
} from "@/features/pairing/components/pairing-preference-picker";
import { AppProviders } from "@/app/providers/app-providers";
import { queryClient } from "@/shared/query/query-client";
import { pairingService } from "@/shared/services/pairing-service";

const buildResult = (pairingId: string, pairingNumber: string) => ({
  id: pairingId,
  pairingId,
  pairingNumber,
  base: "YVR",
  originDate: "2026-07-22",
  endDate: "2026-07-23",
  endDateLabel: "Jul 23, 2026",
  compositionLabel: "CA+FO",
  reportTime: "0430",
  releaseTime: "1545",
  durationDays: 2,
  routeLabel: "YVR-YYZ-YVR",
  priorityLabel: "P3",
  prioritySequence: "02",
  totalBlock: "4:00",
  totalCredit: "5:30",
  totalPay: "5:30",
  activeDates: ["2026-07-22"],
  legs: [],
});

const PickerHarness = () => {
  const [selected, setSelected] = useState(new Map<string, PairingPreferenceSelectionItem>());

  return (
    <AppProviders>
      <PairingPreferencePicker
        period={{ rosterPeriodId: 10, periodCode: "Jul 2026" }}
        periodCode="Jul 2026"
        periodEndDate="2026-07-31"
        periodStartDate="2026-07-01"
        selected={selected}
        onSelectionChange={setSelected}
      />
      <output aria-label="Selected pairing ids">{Array.from(selected.keys()).join(",")}</output>
    </AppProviders>
  );
};

describe("PairingPreferencePicker", () => {
  beforeEach(() => {
    vi.spyOn(pairingService, "getAirportOptions").mockResolvedValue({
      airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
      airportPreferenceOptions: [],
      filterAirports: ["YVR", "YYZ", "YYC", "YHZ"],
      landingAirports: ["YVR", "YYZ"],
      layoverAirports: ["YYC", "YHZ"],
      workStartStations: ["YVR"],
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("keeps the sticky header, results, and readable route in one table", async () => {
    const routeLabel = "YYZ-YVR-YYC-YKF-YOW-YYZ";
    vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 1, totalItems: 1 },
      pagination: { page: 1, pageSize: 30, totalItems: 1, totalPages: 1 },
      results: [{ ...buildResult("100227", "100227"), routeLabel }],
    });

    render(<PickerHarness />);

    const routeCell = await screen.findByTitle(routeLabel);
    const routeHeader = screen.getByRole("columnheader", { name: "Route" });
    const resultsScroll = screen.getByTestId("pairing-preference-results-scroll");

    expect(resultsScroll.querySelectorAll("table")).toHaveLength(1);
    expect(routeCell.closest("table")).toBe(routeHeader.closest("table"));
    expect(routeHeader).toHaveClass("sticky");
    expect(routeCell).toHaveTextContent(routeLabel);
    expect(routeCell).not.toHaveClass("truncate");
    expect(routeCell).toHaveClass("whitespace-normal", "break-words");
    expect(resultsScroll).toHaveClass("overflow-x-hidden");
  });

  it("shows existing check-in and check-out values in a ten-column table", async () => {
    vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 4, totalItems: 4 },
      pagination: { page: 1, pageSize: 30, totalItems: 4, totalPages: 1 },
      results: [
        { ...buildResult("100227", "100227"), reportTime: "1645", releaseTime: "2340" },
        { ...buildResult("100228", "100228"), reportTime: "16:45", releaseTime: "23:42" },
        { ...buildResult("100229", "100229"), reportTime: "", releaseTime: "" },
        { ...buildResult("100230", "100230"), originDate: "2026-06-01", endDate: "2026-06-02" },
      ],
    });

    render(<PickerHarness />);

    const compactRow = (await screen.findByRole("checkbox", { name: "Select pairing 100227" })).closest("tr");
    const colonRow = screen.getByRole("checkbox", { name: "Select pairing 100228" }).closest("tr");
    const missingRow = screen.getByRole("checkbox", { name: "Select pairing 100229" }).closest("tr");
    const rangeRow = screen.getByRole("checkbox", { name: "Select pairing 100230" }).closest("tr");
    const compactCells = compactRow?.querySelectorAll("td");
    const colonCells = colonRow?.querySelectorAll("td");
    const missingCells = missingRow?.querySelectorAll("td");
    const rangeDateParts = rangeRow?.querySelectorAll("td:nth-child(5) > span > span");

    const headerCells = screen.getAllByRole("columnheader");
    const columns = screen.getByTestId("pairing-preference-results-scroll").querySelectorAll("col");

    expect(headerCells).toHaveLength(10);
    expect(headerCells[0]?.parentElement).toHaveClass("whitespace-nowrap");
    expect(columns[4]).toHaveClass("w-[16%]");
    expect(columns[5]).toHaveClass("w-[9%]");
    expect(columns[6]).toHaveClass("w-[9%]");
    expect(compactCells).toHaveLength(10);
    expect(compactCells?.[4]).toHaveClass("whitespace-normal");
    expect(compactCells?.[4]).not.toHaveClass("truncate", "line-clamp-2");
    expect(rangeDateParts).toHaveLength(2);
    expect(rangeDateParts?.[0]).toHaveClass("whitespace-nowrap");
    expect(rangeDateParts?.[0]).toHaveTextContent("2026-06-01 →");
    expect(rangeDateParts?.[1]).toHaveClass("whitespace-nowrap");
    expect(rangeDateParts?.[1]).toHaveTextContent("2026-06-02");
    expect(compactCells?.[5]).toHaveTextContent("16:45");
    expect(compactCells?.[6]).toHaveTextContent("23:40");
    expect(colonCells?.[5]).toHaveTextContent("16:45");
    expect(colonCells?.[6]).toHaveTextContent("23:42");
    expect(missingCells?.[5]).toHaveTextContent("-");
    expect(missingCells?.[6]).toHaveTextContent("-");
    expect(compactCells?.[5]).toHaveClass("whitespace-nowrap");
    expect(compactCells?.[6]).toHaveClass("whitespace-nowrap");
    expect(compactCells?.[5]).not.toHaveClass("truncate");
    expect(compactCells?.[6]).not.toHaveClass("truncate");
  });

  it("keeps the empty state inside the shared table", async () => {
    vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 0, totalItems: 0 },
      pagination: { page: 1, pageSize: 30, totalItems: 0, totalPages: 1 },
      results: [],
    });

    render(<PickerHarness />);

    const emptyState = await screen.findByText("No pairings match the current search and filters.");
    expect(emptyState.closest("td")).toHaveAttribute("colspan", "10");
    expect(screen.getByTestId("pairing-preference-results-scroll").querySelectorAll("table")).toHaveLength(1);
  });

  it("keeps the recoverable error state inside the shared table", async () => {
    vi.spyOn(pairingService, "previewAllPairings").mockRejectedValue(new Error("network unavailable"));

    render(<PickerHarness />);

    const errorState = await screen.findByText("Unable to load pairings.");
    expect(errorState.closest("td")).toHaveAttribute("colspan", "10");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByTestId("pairing-preference-results-scroll").querySelectorAll("table")).toHaveLength(1);
  });

  it("keeps stable selections while moving between server pages", async () => {
    const user = userEvent.setup();
    const previewSpy = vi.spyOn(pairingService, "previewAllPairings").mockImplementation(async (page) => {
      const pageNumber = page ?? 1;

      return {
        mode: "all_pairings_preview",
        summary: { pairingIdCount: 2, totalItems: 2 },
        pagination: { page: pageNumber, pageSize: 30, totalItems: 2, totalPages: 2 },
        results: [pageNumber === 1 ? buildResult("100227", "100227") : buildResult("100257", "100257")],
      };
    });

    render(<PickerHarness />);

    await user.click(await screen.findByRole("checkbox", { name: "Select pairing 100227" }));
    expect(previewSpy).toHaveBeenLastCalledWith(1, 30, { rosterPeriodId: 10, periodCode: "Jul 2026" }, { pairingScope: "fly" });
    await user.click(screen.getByRole("button", { name: "Next pairing page" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select pairing 100257" }));
    expect(previewSpy).toHaveBeenLastCalledWith(2, 30, { rosterPeriodId: 10, periodCode: "Jul 2026" }, { pairingScope: "fly" });

    expect(screen.getByLabelText("Selected pairing ids")).toHaveTextContent("100227,100257");
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous pairing page" }));
    expect(await screen.findByRole("checkbox", { name: "Select pairing 100227" })).toBeChecked();
  });

  it("resets the results scroll and replaces stale rows with a skeleton while changing pages", async () => {
    const user = userEvent.setup();
    let resolveSecondPage: ((value: Awaited<ReturnType<typeof pairingService.previewAllPairings>>) => void) | undefined;
    const secondPage = new Promise<Awaited<ReturnType<typeof pairingService.previewAllPairings>>>((resolve) => {
      resolveSecondPage = resolve;
    });

    vi.spyOn(pairingService, "previewAllPairings").mockImplementation(async (page) => {
      const pageNumber = page ?? 1;

      if (pageNumber === 2) {
        return secondPage;
      }

      return {
        mode: "all_pairings_preview",
        summary: { pairingIdCount: 2, totalItems: 2 },
        pagination: { page: 1, pageSize: 30, totalItems: 2, totalPages: 2 },
        results: [buildResult("100227", "100227")],
      };
    });

    render(<PickerHarness />);

    await screen.findByRole("checkbox", { name: "Select pairing 100227" });
    const resultsScroll = screen.getByTestId("pairing-preference-results-scroll");
    resultsScroll.scrollTop = 160;

    await user.click(screen.getByRole("button", { name: "Next pairing page" }));

    expect(resultsScroll.scrollTop).toBe(0);
    expect(resultsScroll).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("pairing-preference-page-loading")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select pairing 100227" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous pairing page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next pairing page" })).toBeDisabled();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    resolveSecondPage?.({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 2, totalItems: 2 },
      pagination: { page: 2, pageSize: 30, totalItems: 2, totalPages: 2 },
      results: [buildResult("100257", "100257")],
    });

    expect(await screen.findByRole("checkbox", { name: "Select pairing 100257" })).toBeInTheDocument();
    await waitFor(() => expect(resultsScroll).toHaveAttribute("aria-busy", "false"));
    expect(screen.queryByTestId("pairing-preference-page-loading")).not.toBeInTheDocument();
  });

  it("replaces stale rows with the same skeleton when applying changed filters", async () => {
    const user = userEvent.setup();
    let resolveFilteredResults: ((value: Awaited<ReturnType<typeof pairingService.previewAllPairings>>) => void) | undefined;
    const filteredResults = new Promise<Awaited<ReturnType<typeof pairingService.previewAllPairings>>>((resolve) => {
      resolveFilteredResults = resolve;
    });

    vi.spyOn(pairingService, "previewAllPairings").mockImplementation(async (_page, _pageSize, _periodCode, filters) => {
      if (filters?.durationDaysMin === 2) {
        return filteredResults;
      }

      return {
        mode: "all_pairings_preview",
        summary: { pairingIdCount: 2, totalItems: 2 },
        pagination: { page: 1, pageSize: 30, totalItems: 2, totalPages: 1 },
        results: [buildResult("100227", "100227")],
      };
    });

    render(<PickerHarness />);

    await screen.findByRole("checkbox", { name: "Select pairing 100227" });
    const resultsScroll = screen.getByTestId("pairing-preference-results-scroll");
    resultsScroll.scrollTop = 160;
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.type(screen.getByLabelText("Pairing length minimum"), "2");
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));

    expect(resultsScroll.scrollTop).toBe(0);
    expect(resultsScroll).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("pairing-preference-page-loading")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select pairing 100227" })).not.toBeInTheDocument();

    resolveFilteredResults?.({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 1, totalItems: 1 },
      pagination: { page: 1, pageSize: 30, totalItems: 1, totalPages: 1 },
      results: [buildResult("100257", "100257")],
    });

    expect(await screen.findByRole("checkbox", { name: "Select pairing 100257" })).toBeInTheDocument();
    await waitFor(() => expect(resultsScroll).toHaveAttribute("aria-busy", "false"));
  });

  it("applies validated filters without clearing existing selections", async () => {
    const user = userEvent.setup();
    const previewSpy = vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 1, totalItems: 1 },
      pagination: { page: 1, pageSize: 30, totalItems: 1, totalPages: 1 },
      results: [buildResult("100227", "100227")],
    });

    render(<PickerHarness />);
    await user.click(await screen.findByRole("checkbox", { name: "Select pairing 100227" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog", { name: "Pairing Filters" })).toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
    const openDateRangeButton = screen.getByRole("button", { name: "Open Pairing Preference date range calendar" });
    expect(openDateRangeButton.parentElement).toHaveAttribute("data-density", "filter");
    expect(openDateRangeButton.parentElement).toHaveClass("h-8", "rounded-md");
    expect(screen.getByText("Length (days)")).toBeInTheDocument();
    expect(screen.getByText("Credit (HH:MM)")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Route station" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Layover station" })).toBeInTheDocument();
    expect(screen.queryByText("Basic")).not.toBeInTheDocument();
    expect(screen.queryByText("Stations")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Credit minimum")).toHaveAttribute("placeholder", "HH:MM");
    await user.click(openDateRangeButton);
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-07-10" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-07-25" }));
    expect(screen.getByRole("group", { name: "Dates" })).toHaveTextContent("2026-07-10");
    expect(screen.getByRole("group", { name: "Dates" })).toHaveTextContent("2026-07-25");
    expect(screen.getByLabelText("Check-in time from")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Check-out time to")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Pairing length minimum")).toHaveAttribute("type", "number");
    await user.type(await screen.findByLabelText("Pairing length minimum"), "2");
    await user.type(screen.getByLabelText("Pairing length maximum"), "4");
    await user.click(screen.getByRole("button", { name: /Select route stations/i }));
    await user.click(screen.getByRole("option", { name: "YYZ" }));
    await user.click(screen.getByRole("button", { name: /Select layover stations/i }));
    await user.click(screen.getByRole("option", { name: "YHZ" }));
    await user.type(screen.getByLabelText("Layover count minimum"), "1");
    await user.type(screen.getByLabelText("Layover count maximum"), "2");
    await user.type(screen.getByLabelText("Credit minimum"), "04:30");
    await user.type(screen.getByLabelText("Credit maximum"), "12:15");
    await user.click(screen.getByRole("button", { name: "Redeye" }));
    await user.click(screen.getByRole("button", { name: "DHD" }));
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));

    await waitFor(() => expect(previewSpy).toHaveBeenLastCalledWith(
      1,
      30,
      { rosterPeriodId: 10, periodCode: "Jul 2026" },
      {
        pairingScope: "fly",
        originDateFrom: "2026-07-10",
        originDateTo: "2026-07-25",
        durationDaysMin: 2,
        durationDaysMax: 4,
        airports: ["YYZ"],
        layoverAirports: ["YHZ"],
        layoverCountMin: 1,
        layoverCountMax: 2,
        creditMinutesMin: 270,
        creditMinutesMax: 735,
        hasRedeye: true,
        hasDeadhead: true,
      },
    ));
    expect(screen.getByLabelText("Selected pairing ids")).toHaveTextContent("100227");

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    const callsBeforeClear = previewSpy.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(previewSpy).toHaveBeenCalledTimes(callsBeforeClear);
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pairing Filters" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(previewSpy).toHaveBeenCalledTimes(callsBeforeClear);
    expect(previewSpy.mock.calls.every((call) => call[3]?.pairingScope === "fly")).toBe(true);
    expect(screen.getByLabelText("Selected pairing ids")).toHaveTextContent("100227");
  });

  it("discards draft filters when the filter dialog is cancelled", async () => {
    const user = userEvent.setup();
    const previewSpy = vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue({
      mode: "all_pairings_preview",
      summary: { pairingIdCount: 1, totalItems: 1 },
      pagination: { page: 1, pageSize: 30, totalItems: 1, totalPages: 1 },
      results: [buildResult("100227", "100227")],
    });

    render(<PickerHarness />);

    await screen.findByRole("checkbox", { name: "Select pairing 100227" });
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.type(screen.getByLabelText("Pairing length minimum"), "3");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Pairing Filters" })).not.toBeInTheDocument();
    expect(previewSpy).toHaveBeenLastCalledWith(
      1,
      30,
      { rosterPeriodId: 10, periodCode: "Jul 2026" },
      { pairingScope: "fly" },
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByLabelText("Pairing length minimum")).toHaveValue(null);
  });
});
