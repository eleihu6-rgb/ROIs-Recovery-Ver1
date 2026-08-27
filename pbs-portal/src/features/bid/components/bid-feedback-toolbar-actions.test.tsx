import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/app/providers/app-providers";
import { BidFeedbackDialog } from "@/features/bid/components/bid-feedback-dialog";
import { overlapsBidFeedbackPeriod } from "@/features/bid/components/bid-feedback-period";
import { BidFeedbackToolbarActions } from "@/features/bid/components/bid-feedback-toolbar-actions";
import { queryClient } from "@/shared/query/query-client";
import { bidFeedbackService } from "@/shared/services/bid-feedback-service";

const unavailableEligibility = {
  status: "unknown" as const,
  checked: [],
  unavailable: ["rule_engine" as const],
  reasons: [],
};
const unavailableEligibilityWithReason = {
  ...unavailableEligibility,
  reasons: [{
    code: "FACTS_MISSING" as const,
    message: "Rule engine binary is unavailable on this server. Rebuild and deploy rule-engine-rs release binaries.",
  }],
};
const eligibleEligibility = {
  status: "eligible" as const,
  checked: ["rule_engine" as const],
  unavailable: [],
  reasons: [],
};
const ineligibleEligibility = {
  status: "ineligible" as const,
  checked: ["rule_engine" as const],
  unavailable: [],
  reasons: [{
    code: "RULE_ENGINE_CONFLICT" as const,
    message: "Minimum rest between duties is not satisfied.",
    ruleId: "8072",
    ruleName: "Minimum Rest",
  }],
};

describe("BidFeedbackToolbarActions", () => {
  it("keeps overlap-at-boundary rows, drops non-overlapping rows, and fails open on malformed dates", () => {
    expect(overlapsBidFeedbackPeriod("2026-05-31", "2026-06-02", "2026-06-01", "2026-06-30")).toBe(true);
    expect(overlapsBidFeedbackPeriod("2026-06-30", "2026-07-02", "2026-06-01", "2026-06-30")).toBe(true);
    expect(overlapsBidFeedbackPeriod("2026-07-01", "2026-07-02", "2026-06-01", "2026-06-30")).toBe(false);
    expect(overlapsBidFeedbackPeriod("not-a-date", "not-a-date", "2026-06-01", "2026-06-30")).toBe(true);
  });

  beforeEach(() => {
    queryClient.clear();
    vi.spyOn(bidFeedbackService, "getCurrentConflicts").mockResolvedValue({
      draftVersion: "1:1:1:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 1,
      advisoryCount: 0,
      conflicts: [{ code: "A1", stableKey: "A1:test", severity: "conflict", title: "Conflict", message: "Award and Avoid overlap." }],
    });
    vi.spyOn(bidFeedbackService, "startEligibilityRun").mockResolvedValue({
      runId: "run-test",
      status: "computing",
      draftVersion: "1:1:1:1",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
    });
    vi.spyOn(bidFeedbackService, "openEligibilityWs").mockImplementation((_runId, handlers) => {
      handlers.onDone();
      return () => {};
    });
    vi.spyOn(bidFeedbackService, "getEligibilityRun").mockResolvedValue({
      runId: "run-test",
      status: "done",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
      pairings: [],
    });
    vi.spyOn(bidFeedbackService, "getCurrentFeedback").mockResolvedValue({
      crewId: "1001",
      currentPeriod: {
        id: 6,
        rosterPeriodId: 6,
        periodCode: "Jun 2026",
        computedStage: "OPEN",
        canEditBid: true,
        readOnlyReason: null,
        rpStartLocal: "2026-06-01",
        rpEndLocal: "2026-06-30",
      },
      timezoneLabel: "YYZ Local Time",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
      draftVersion: "1:1:1:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 1,
      advisoryCount: 0,
      conflicts: [{ code: "A1", stableKey: "A1:test", severity: "conflict", title: "Conflict", message: "Award and Avoid overlap." }],
      pairings: [{
        pairingId: "13335",
        pairingNumber: "V4126",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-08",
        endDate: "2026-06-10",
        routeLabel: "YYZ-MEX-YYZ",
        reportTime: "16:57",
        releaseTime: "23:21",
        totalCredit: "15:48",
        durationDays: 3,
        tafbDays: 3,
        rawScore: 7,
        rawDirection: "award",
        eligibility: { ...eligibleEligibility },
        matchedBids: [{ propertyGroupKey: "p1", propertyName: "Airport Preference", tier: "T1", action: "award" }],
      }, {
        pairingId: "13336",
        pairingNumber: "V4127",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-08",
        endDate: "2026-06-09",
        routeLabel: "YYZ-YVR-YYZ",
        reportTime: "07:10",
        releaseTime: "21:25",
        totalCredit: "08:15",
        durationDays: 2,
        tafbDays: 2,
        rawScore: 6,
        rawDirection: "award",
        eligibility: { ...unavailableEligibility },
        matchedBids: [{ propertyGroupKey: "p4", propertyName: "Pairing Number", tier: "T1", action: "award" }],
      }, {
        pairingId: "13337",
        pairingNumber: "V4128",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-08",
        endDate: "2026-06-09",
        routeLabel: "YYZ-LAX-YYZ",
        reportTime: "08:20",
        releaseTime: "22:35",
        totalCredit: "08:45",
        durationDays: 2,
        tafbDays: 2,
        rawScore: 5,
        rawDirection: "award",
        eligibility: { ...unavailableEligibility },
        matchedBids: [{ propertyGroupKey: "p5", propertyName: "Pairing Number", tier: "T1", action: "award" }],
      }, {
        pairingId: "13338",
        pairingNumber: "V4129",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-08",
        endDate: "2026-06-09",
        routeLabel: "YYZ-MIA-YYZ",
        reportTime: "09:30",
        releaseTime: "23:45",
        totalCredit: "09:05",
        durationDays: 2,
        tafbDays: 2,
        rawScore: 4,
        rawDirection: "award",
        eligibility: { ...unavailableEligibility },
        matchedBids: [{ propertyGroupKey: "p6", propertyName: "Pairing Number", tier: "T1", action: "award" }],
      }, {
        pairingId: "13718",
        pairingNumber: "V4133",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-13",
        endDate: "2026-06-13",
        routeLabel: "YYZ-YYC-YYZ",
        reportTime: "07:40",
        releaseTime: "16:23",
        totalCredit: "06:30",
        durationDays: 1,
        tafbDays: 1,
        rawScore: 6,
        rawDirection: "award",
        eligibility: { ...ineligibleEligibility, reasons: [...ineligibleEligibility.reasons] },
        matchedBids: [{ propertyGroupKey: "p2", propertyName: "Pairing Length", tier: "T2", action: "award" }],
      }, {
        pairingId: "13740",
        pairingNumber: "V4140",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-17",
        endDate: "2026-06-18",
        routeLabel: "YYZ-ORD-YYZ",
        reportTime: "06:20",
        releaseTime: "20:40",
        totalCredit: "08:20",
        durationDays: 2,
        tafbDays: 2,
        rawScore: 4,
        rawDirection: "award",
        eligibility: { ...unavailableEligibilityWithReason, reasons: [...unavailableEligibilityWithReason.reasons] },
        matchedBids: [{ propertyGroupKey: "p7", propertyName: "Pairing Length", tier: "T2", action: "award" }],
      }, {
        pairingId: "14001",
        pairingNumber: "V4200",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-20",
        endDate: "2026-06-20",
        routeLabel: "YYZ-YUL-YYZ",
        reportTime: "08:10",
        releaseTime: "15:25",
        totalCredit: "07:15",
        durationDays: 1,
        tafbDays: 1,
        rawScore: -7,
        rawDirection: "avoid",
        eligibility: null,
        matchedBids: [{ propertyGroupKey: "p3", propertyName: "Airport Preference", tier: "T3", action: "avoid" }],
      }],
      daysOff: [{
        date: "2026-06-03",
        propertyGroupKey: "d2",
        propertyName: "Prefer Early Off",
        tier: "T1",
        source: "prefer_off",
        fromOption: true,
        description: "Prefer Jun 3 off",
      }, {
        date: "2026-06-01",
        propertyGroupKey: "d1",
        propertyName: "Prefer Off",
        tier: "T2",
        source: "prefer_off",
        fromOption: true,
        description: "Prefer Jun 1 off",
      }],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a structured loading skeleton that mirrors the Pairing list and detail", () => {
    render(
      <AppProviders>
        <BidFeedbackDialog
          isError={false}
          isLoading
          onClose={vi.fn()}
          onRetry={vi.fn()}
        />
      </AppProviders>,
    );

    const loadingState = screen.getByRole("status", { name: "Loading Bid Feedback" });
    expect(loadingState).toHaveClass("h-[min(500px,calc(100vh-150px))]");
    expect(screen.getByTestId("bid-feedback-skeleton-list")).toHaveAccessibleName("Loading Pairing list");
    expect(screen.getByTestId("bid-feedback-skeleton-detail")).toHaveAccessibleName("Loading Pairing detail");
  });

  it("opens the white Portal dialog and shows base-local pairing feedback", async () => {
    const user = userEvent.setup();
    render(<AppProviders><BidFeedbackToolbarActions draftVersionKey="1:1:1" /></AppProviders>);

    const toolbarButtons = await screen.findAllByRole("button", { name: /Bid Feedback/ });
    expect(toolbarButtons).toHaveLength(1);
    expect(screen.getByTestId("bid-feedback-toolbar-label")).toHaveTextContent("Feedback");
    expect(screen.getByTestId("bid-feedback-toolbar-label")).not.toHaveTextContent("Bid Feedback");
    expect(toolbarButtons[0]?.querySelector("svg")).toBeNull();
    expect(toolbarButtons[0]).toHaveClass("border-[#e3b94f]", "bg-[#fff7dd]", "text-[#705616]", "overflow-visible");
    expect(screen.queryByTestId("bid-feedback-conflict-count")).not.toBeInTheDocument();
    expect(bidFeedbackService.getCurrentConflicts).not.toHaveBeenCalled();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(toolbarButtons[0]!);

    expect(await screen.findByTestId("bid-feedback-dialog")).toBeInTheDocument();
    expect(screen.getByText("Crew 1001 · Jun 2026 · YYZ Local Time")).toBeInTheDocument();
    expect(await screen.findByTestId("bid-feedback-master-detail")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /V4126/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("option", { name: /V4126/ })).toHaveAttribute("data-eligibility", "eligible");
    expect(screen.getByText("Select a pairing to see whether this crew can be awarded it.")).toBeInTheDocument();
    const awardOption = screen.getByRole("option", { name: /V4126/ });
    expect(awardOption).toHaveTextContent("06-08");
    expect(awardOption).not.toHaveTextContent("2026-06-08");
    expect(awardOption.querySelector('[data-column="eligibility"]')).toHaveTextContent("✓");
    await user.click(awardOption);
    expect(screen.getByText("Eligible")).toHaveClass("bg-emerald-50", "text-emerald-800");
    expect(screen.getByText("PASS")).toHaveClass("bg-emerald-50", "text-emerald-800");
    expect(screen.getByText("Eligible for this crew. No blocking rule was returned by the rule engine.")).toBeInTheDocument();
    expect(screen.queryByText("Eligibility unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("FAIL")).not.toBeInTheDocument();
    expect(screen.getAllByText("15:48h")).toHaveLength(2);
    expect(screen.getByTestId("bid-feedback-pairing-header")).toHaveClass("bg-background");
    expect(screen.getByTestId("bid-feedback-pairing-header")).toHaveClass("grid-cols-[minmax(72px,1fr)_48px_76px_76px_40px_54px_28px]");
    expect(screen.getByTestId("bid-feedback-pairing-header")).not.toHaveClass("bg-muted");
    expect(screen.getByTestId("bid-feedback-pairing-header").children).toHaveLength(7);
    for (const column of ["pairing", "base", "start", "end", "days", "credit"] as const) {
      expect(document.querySelector(`[data-column="${column}"][data-column-role="header"]`)).toHaveClass("justify-self-center", "text-center", "text-xs", "scale-90");
      expect(awardOption.querySelector(`[data-column="${column}"]`)).toHaveClass("justify-self-center", "text-center");
      expect(awardOption.querySelector(`[data-column="${column}"]`)).not.toHaveClass("text-xs", "scale-90");
    }
    expect(awardOption.querySelector('[data-column="eligibility"]')).toHaveClass("justify-self-center");
    const previouslyBlockedOption = screen.getByRole("option", { name: /V4133/ });
    expect(previouslyBlockedOption).toHaveAttribute("data-eligibility", "ineligible");
    expect(previouslyBlockedOption).toHaveClass("bg-destructive/5");
    expect(previouslyBlockedOption.querySelector('[data-column="eligibility"]')).toHaveTextContent("✗");
    expect(screen.getByTestId("bid-feedback-pairing-detail")).toHaveTextContent("2026-06-08 16:57 – 2026-06-10 23:21");
    expect(screen.getByTestId("bid-feedback-pairing-detail")).toHaveTextContent("RankCA+FO");
    expect(screen.getByTestId("bid-feedback-pairing-detail")).toHaveTextContent("TAFB3");
    expect(screen.getByTestId("bid-feedback-pairing-detail")).toHaveTextContent("YYZ → MEX → YYZ");
    expect(screen.queryByText("Score")).not.toBeInTheDocument();
    expect(screen.queryByText("Matched Bids")).not.toBeInTheDocument();
    expect(screen.queryByText("BID CONFLICTS")).not.toBeInTheDocument();
    expect(screen.queryByText("Award and Avoid overlap.")).not.toBeInTheDocument();

    await user.click(previouslyBlockedOption);
    expect(previouslyBlockedOption).toHaveClass("bg-primary/10");
    expect(screen.getByText("Not eligible")).toHaveClass("bg-destructive/10", "text-destructive");
    expect(screen.getByText("FAIL")).toHaveClass("bg-destructive/10", "text-destructive");
    expect(screen.getByText("Minimum rest between duties is not satisfied.")).toBeInTheDocument();
    expect(screen.getByText("Minimum Rest · 8072")).toBeInTheDocument();

    const unknownOption = screen.getByRole("option", { name: /V4140/ });
    expect(unknownOption).toHaveAttribute("data-eligibility", "unknown");
    expect(unknownOption.querySelector('[data-column="eligibility"]')).toHaveTextContent("");
    expect(screen.queryByLabelText("Unable to verify")).not.toBeInTheDocument();
    await user.click(unknownOption);
    expect(screen.getByText("Eligibility unavailable")).toHaveClass("bg-muted", "text-muted-foreground");
    expect(screen.getByText("Unavailable")).toHaveClass("bg-muted", "text-muted-foreground");
    expect(screen.getByText("Rule engine binary is unavailable on this server. Rebuild and deploy rule-engine-rs release binaries.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Days Off 2" }));
    expect(screen.getByTestId("bid-feedback-days-off-header")).toHaveClass("bg-background");
    expect(screen.getByTestId("bid-feedback-days-off-header")).not.toHaveClass("bg-muted");
    expect(screen.getByTestId("bid-feedback-days-off-header").children).toHaveLength(2);
    for (const column of ["date", "tier"] as const) {
      expect(document.querySelector(`[data-column="${column}"][data-column-role="header"]`)).toHaveClass("justify-self-center", "text-center", "text-xs", "scale-90");
    }
    expect(screen.getByText("Select a day off to view its bid.")).toBeInTheDocument();
    const dayOffOptions = within(screen.getByRole("listbox", { name: "Days Off bids" })).getAllByRole("option");
    expect(dayOffOptions.map((option) => option.querySelector('[data-column="date"]')?.textContent)).toEqual([
      "2026-06-01",
      "2026-06-03",
    ]);
    const dayOffOption = screen.getByRole("option", { name: /2026-06-01 T2/ });
    expect(dayOffOption.querySelector('[data-column="date"]')).toHaveClass("justify-self-center", "text-center");
    expect(dayOffOption.querySelector('[data-column="tier"]')).toHaveClass("justify-self-center", "text-center");
    await user.click(dayOffOption);
    expect(screen.getByTestId("bid-feedback-days-off-detail")).toHaveTextContent("Prefer Jun 1 off");
    expect(screen.getByTestId("bid-feedback-days-off-detail")).toHaveTextContent("Days Off Bid");
    expect(screen.getByTestId("bid-feedback-days-off-detail")).not.toHaveTextContent("BidAward");

    await user.click(screen.getByRole("button", { name: "calendar" }));
    expect(screen.getByTestId("bid-feedback-calendar")).toBeInTheDocument();
    expect(screen.getByText("Award Pairing, not eligible")).toBeInTheDocument();
    expect(screen.getByLabelText("V4126, 2026-06-08 16:57 to 2026-06-10 23:21")).toBeInTheDocument();
    expect(screen.getByLabelText("V4133, 2026-06-13 07:40 to 2026-06-13 16:23")).toHaveClass("ring-[#d83030]");
    expect(screen.getByLabelText("V4140, 2026-06-17 06:20 to 2026-06-18 20:40")).toBeInTheDocument();
    expect(screen.queryByLabelText(/V4200/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("bid-feedback-calendar-segment")).toHaveLength(8);
    const weeks = screen.getAllByTestId("bid-feedback-calendar-week");
    expect(weeks).toHaveLength(5);
    expect(Number(weeks[1]?.getAttribute("data-lane-count"))).toBeGreaterThan(1);
    expect(Number.parseFloat(weeks[1]?.style.height ?? "0")).toBeGreaterThan(92);

    await user.click(screen.getByRole("button", { name: "bids" }));
    await user.click(screen.getByRole("tab", { name: "Avoid 1" }));
    expect(screen.getByTestId("bid-feedback-pairing-header")).toHaveClass("bg-background");
    expect(screen.getByTestId("bid-feedback-pairing-header")).toHaveClass("grid-cols-[minmax(72px,1fr)_48px_76px_76px_40px_54px_28px]");
    expect(screen.getByTestId("bid-feedback-pairing-header").children).toHaveLength(7);
    const avoidOption = screen.getByRole("option", { name: /V4200/ });
    expect(avoidOption).toHaveTextContent("07:15h");
    expect(avoidOption).toHaveAttribute("aria-selected", "false");
    expect(avoidOption).toHaveClass("grid-cols-[minmax(72px,1fr)_48px_76px_76px_40px_54px_28px]");
    expect(avoidOption.querySelector('[data-column="eligibility"]')).toHaveTextContent("");
    expect(avoidOption).not.toHaveAttribute("data-eligibility");
    expect(screen.getByText("Select a pairing to see whether this crew can be awarded it.")).toBeInTheDocument();
    await user.click(avoidOption);
    expect(screen.getByText("Avoid bids are not eligibility-checked. Being unable to fly a pairing you asked to avoid is not a problem worth reporting.")).toBeInTheDocument();
  });

  it("hydrates pairing eligibility from the lazy endpoint after the dialog opens", async () => {
    const user = userEvent.setup();
    vi.mocked(bidFeedbackService.getCurrentFeedback).mockResolvedValueOnce({
      crewId: "1001",
      currentPeriod: {
        id: 6,
        rosterPeriodId: 6,
        periodCode: "Jun 2026",
        computedStage: "OPEN",
        canEditBid: true,
        readOnlyReason: null,
        rpStartLocal: "2026-06-01",
        rpEndLocal: "2026-06-30",
      },
      timezoneLabel: "YYZ Local Time",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
      draftVersion: "1:1:1:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 0,
      advisoryCount: 0,
      conflicts: [],
      pairings: [{
        pairingId: "13335",
        pairingNumber: "V4126",
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-08",
        endDate: "2026-06-10",
        routeLabel: "YYZ-MEX-YYZ",
        reportTime: "16:57",
        releaseTime: "23:21",
        totalCredit: "15:48",
        durationDays: 3,
        tafbDays: 3,
        rawScore: 7,
        rawDirection: "award",
        eligibility: { ...unavailableEligibility },
        matchedBids: [{ propertyGroupKey: "p1", propertyName: "Airport Preference", tier: "T1", action: "award" }],
      }],
      daysOff: [],
    });
    vi.mocked(bidFeedbackService.openEligibilityWs).mockImplementationOnce((_runId, handlers) => {
      handlers.onUpdate("13335", { ...ineligibleEligibility, reasons: [...ineligibleEligibility.reasons] });
      handlers.onDone();
      return () => {};
    });

    render(<AppProviders><BidFeedbackToolbarActions draftVersionKey="1:1:1" /></AppProviders>);
    await user.click((await screen.findAllByRole("button", { name: /Bid Feedback/ }))[0]!);

    const option = await screen.findByRole("option", { name: /V4126/ });
    expect(await screen.findByLabelText("Not eligible")).toBeInTheDocument();
    expect(option).toHaveAttribute("data-eligibility", "ineligible");
    expect(option.querySelector('[data-column="eligibility"]')).toHaveTextContent("✗");

    await user.click(option);
    expect(screen.getByText("FAIL")).toHaveClass("bg-destructive/10", "text-destructive");
    expect(screen.getByText("Minimum rest between duties is not satisfied.")).toBeInTheDocument();
    expect(screen.getByText("Minimum Rest · 8072")).toBeInTheDocument();
  });

  it("requests eligibility only for the visible 25-row Award page", async () => {
    const user = userEvent.setup();
    const awardPairings = Array.from({ length: 30 }, (_, index) => {
      const id = String(20000 + index);
      return {
        pairingId: id,
        pairingNumber: `T${4100 + index}`,
        rank: "CA+FO",
        base: "YYZ",
        zoneId: "America/Toronto",
        originDate: "2026-06-08",
        endDate: "2026-06-09",
        routeLabel: "YYZ-YVR-YYZ",
        reportTime: "07:10",
        releaseTime: "21:25",
        totalCredit: "08:15",
        durationDays: 2,
        tafbDays: 2,
        rawScore: 30 - index,
        rawDirection: "award" as const,
        eligibility: { ...unavailableEligibility },
        matchedBids: [{ propertyGroupKey: `p${index}`, propertyName: "Pairing Number", tier: "T1", action: "award" as const }],
      };
    });
    vi.mocked(bidFeedbackService.getCurrentFeedback).mockResolvedValueOnce({
      crewId: "1001",
      currentPeriod: {
        id: 6,
        rosterPeriodId: 6,
        periodCode: "Jun 2026",
        computedStage: "OPEN",
        canEditBid: true,
        readOnlyReason: null,
        rpStartLocal: "2026-06-01",
        rpEndLocal: "2026-06-30",
      },
      timezoneLabel: "YYZ Local Time",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
      draftVersion: "1:1:1:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 0,
      advisoryCount: 0,
      conflicts: [],
      pairings: awardPairings,
      daysOff: [],
    });
    const eligibilityRequests: string[][] = [];
    vi.mocked(bidFeedbackService.startEligibilityRun).mockImplementation(async (pairingIds) => {
      eligibilityRequests.push(pairingIds);
      return {
        runId: "run-test",
        status: "computing",
        draftVersion: "1:1:1:1",
        eligibilityLabel: "Eligibility based on PBS ruleset \"Test Ruleset\".",
      };
    });

    render(<AppProviders><BidFeedbackToolbarActions draftVersionKey="1:1:1" /></AppProviders>);
    await user.click((await screen.findAllByRole("button", { name: /Bid Feedback/ }))[0]!);

    await screen.findByRole("option", { name: /T4100/ });
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await waitFor(() => expect(eligibilityRequests[0]).toHaveLength(25));
    expect(eligibilityRequests[0]).toEqual(awardPairings.slice(0, 25).map((pairing) => pairing.pairingId));

    await user.click(screen.getByRole("button", { name: "calendar" }));
    expect(eligibilityRequests).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "bids" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("option", { name: /T4125/ });
    await waitFor(() => expect(eligibilityRequests).toHaveLength(2));
    expect(eligibilityRequests[1]).toEqual(awardPairings.slice(25).map((pairing) => pairing.pairingId));
  });
});
