import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pairingPageData } from "@/features/pairing/mock";
import {
  buildCurrentRulesCountsResponse,
  buildAllPairingsPreviewResponse,
  cleanupPairingPageTest,
  expectedFavoritePropertiesSummary,
  goToAvailablePropertyPage,
  renderPairingPage,
  setupPairingPageTestMocks,
  showAllPairingProperties,
} from "@/features/pairing/pages/pairing-page.test-utils";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { pairingService } from "@/shared/services/pairing-service";
import type {
  PairingExistingProperty,
  PairingOccurrenceBidItem,
} from "@/features/pairing/types";

const PAIRING_PREFERENCE_NAME = "Pairing Preference";
const PAIRING_SEARCH_PERIOD = {
  rosterPeriodId: 42,
  periodCode: pairingPageData.rightPanel.draftMeta.periodCode,
};

const openPairingConfigDialog = async (user: ReturnType<typeof userEvent.setup>, propertyName: string) => {
  await showAllPairingProperties(user);

  let addButton = screen.queryByRole("button", { name: `Add ${propertyName}` });

  if (!addButton) {
    addButton = await screen.findByRole("button", { name: `Add ${propertyName}` });
  }

  await user.click(addButton);

  return screen.findByRole("dialog", { name: `Configure ${propertyName}` });
};

const addConfiguredPairingProperty = async (
  user: ReturnType<typeof userEvent.setup>,
  propertyName: string,
) => {
  const dialog = await openPairingConfigDialog(user, propertyName);
  const awardButton = within(dialog).queryByRole("button", { name: "Award" });
  const tierButton = within(dialog).queryByRole("button", { name: `Toggle T1 for ${propertyName}` });

  if (awardButton) {
    await user.click(awardButton);
  }

  if (tierButton && tierButton.getAttribute("aria-pressed") !== "true") {
    await user.click(tierButton);
  }

  const anyButton = within(dialog).queryByRole("button", { name: "Any" });

  if (anyButton && anyButton.getAttribute("aria-pressed") !== "true") {
    await user.click(anyButton);
  }

  await selectPairingDialogBidOperator(user, dialog, propertyName);
  await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

  return dialog;
};

const selectPairingDialogTier = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  propertyName: string,
  tier = "T1",
) => {
  const tierButton = within(dialog).getByRole("button", { name: `Toggle ${tier} for ${propertyName}` });

  if (tierButton.getAttribute("aria-pressed") !== "true") {
    await user.click(tierButton);
  }
};

const selectPairingDialogBidOperator = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  propertyName: string,
  operator?: string,
) => {
  const operatorSelect = within(dialog).queryByLabelText(`BID ${propertyName} operator`) as HTMLSelectElement | null;

  if (!operatorSelect) {
    return;
  }

  const nextOperator = operator ?? Array.from(operatorSelect.options).find((option) => !option.disabled)?.value;

  if (!nextOperator || operatorSelect.value === nextOperator) {
    return;
  }

  await user.selectOptions(operatorSelect, nextOperator);
};

const selectPairingNumberInDialog = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  pairingNumber = "M4959",
) => {
  await user.click(await within(dialog).findByRole("checkbox", { name: `Select pairing ${pairingNumber}` }));
};

const mockPairingPickerRows = (rows: Array<{
  pairingId: string;
  pairingNumber: string;
  originDate: string;
  endDate: string;
}>) => {
  const response = buildAllPairingsPreviewResponse();
  const template = response.results[0]!;

  vi.mocked(pairingService.previewAllPairings).mockResolvedValue({
    ...response,
    summary: { pairingIdCount: rows.length, totalItems: rows.length },
    pagination: { ...response.pagination, totalItems: rows.length },
    results: rows.map((row) => ({
      ...template,
      ...row,
      id: row.pairingId,
    })),
  });
};

const selectAirportOptionsInDialog = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  ariaLabel: string,
  codes: string[],
) => {
  const combobox = within(dialog).getByRole("combobox", { name: ariaLabel });

  await user.click(combobox);

  for (const code of codes) {
    await user.click(await screen.findByRole("option", { name: code }));
  }
};

const buildTestTierOptions = (activeLabels: string[]) =>
  Array.from({ length: 7 }, (_, index) => {
    const label = `T${index + 1}`;

    return {
      key: label.toLowerCase(),
      label,
      active: activeLabels.includes(label),
    };
  });

const buildClosedPeriodPairingPageData = () => {
  const data = structuredClone(pairingPageData);

  data.rightPanel.draftMeta.currentPeriod = {
    ...data.rightPanel.draftMeta.currentPeriod!,
    status: "CLOSED",
    computedStage: "CLOSED",
    canEditBid: false,
    readOnlyReason: "Bidding closed at May 08, 22:59.",
  };

  return data;
};

const buildLongPairingOccurrences = (): PairingOccurrenceBidItem[] => [
  ["E4101", "2026-06-05"],
  ["E4103", "2026-06-05"],
  ["E4103", "2026-06-08"],
  ["E4103", "2026-06-10"],
  ["E4103", "2026-06-12"],
  ["E4103", "2026-06-19"],
  ["E4106", "2026-06-02"],
  ["E4106", "2026-06-04"],
  ["E4106", "2026-06-06"],
  ["E4106", "2026-06-07"],
  ["E4106", "2026-06-09"],
  ["E4106", "2026-06-11"],
  ["E4106", "2026-06-16"],
  ["E4108", "2026-06-04"],
  ["E4109", "2026-06-04"],
  ["E4109", "2026-06-06"],
  ["E4109", "2026-06-11"],
  ["E4110", "2026-06-08"],
  ["E4111", "2026-06-07"],
  ["E4112", "2026-06-06"],
  ["E4114", "2026-06-12"],
  ["E4117", "2026-06-14"],
  ["E4117", "2026-06-18"],
  ["E4127", "2026-06-21"],
  ["E4203", "2026-06-01"],
].map(([pairingNumber, originDate]) => ({
  occurrenceId: `${pairingNumber}:${originDate}`,
  originDate,
  pairingId: pairingNumber,
  pairingNumber,
}));

const buildLongPairingNumberExistingProperty = (): PairingExistingProperty => ({
  id: "existing-pairing-number-long-rule",
  propertyCode: 102,
  name: PAIRING_PREFERENCE_NAME,
  action: "award",
  quantifier: null,
  bid: {
    type: "pairing-occurrence-list",
    occurrences: buildLongPairingOccurrences(),
  },
  tiers: buildTestTierOptions(["T1"]),
  priorityOptions: [],
  pairingNumber: "",
  pairingType: "Regular",
  effectiveDateRange: { from: "2026-06-01", to: "2026-06-30" },
});

type CountCurrentRulesResponse = Awaited<ReturnType<typeof pairingService.countCurrentRules>>;

const createPendingCurrentRulesCounts = () => {
  let resolveCounts: (response: CountCurrentRulesResponse) => void = () => {};
  const promise = new Promise<CountCurrentRulesResponse>((resolve) => {
    resolveCounts = resolve;
  });

  return { promise, resolve: resolveCounts };
};

describe("PairingPage", () => {
  beforeEach(setupPairingPageTestMocks);

  afterEach(cleanupPairingPageTest);

  it("renders the shared bidding calendar and pairing workbench shell", async () => {
    renderPairingPage();

    expect(screen.getByRole("status", { name: "Loading current pairing draft..." })).toBeInTheDocument();
    expect(await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30")).toBeInTheDocument();
    const searchPairingsButton = await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    const viewRulesButton = screen.getByRole("button", { name: "VIEW RULES" });

    expect(searchPairingsButton).toBeInTheDocument();
    expect(screen.getByText("EXISTING PAIRING PROPERTIES")).toBeInTheDocument();
    expect(screen.getByText("ADD PAIRING PROPERTIES")).toBeInTheDocument();
    expect(await screen.findByTestId("bidding-calendar-current-period-status")).toHaveTextContent("Bidding open for Apr 2026");
    expect(screen.queryByTestId("current-period-status")).not.toBeInTheDocument();
    expect(viewRulesButton).toBeInTheDocument();
    const favoriteTab = screen.getByRole("button", { name: "FAVORITED PROPERTIES" });
    const allTab = screen.getByRole("button", { name: "ALL PROPERTIES" });

    expect(favoriteTab).toHaveAttribute("aria-pressed", "true");
    expect(allTab).toHaveAttribute("aria-pressed", "false");
    expect(favoriteTab.compareDocumentPosition(allTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(expectedFavoritePropertiesSummary)).toBeInTheDocument();
    expect(searchPairingsButton.className).toContain("cursor-pointer");
    expect(viewRulesButton.className).toContain("cursor-pointer");
  });

  it("wraps long existing pairing property names without compressing row actions", async () => {
    const longPropertyName = "Prefer Pairing With Deadhead Duty In Operating Window";
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.availableProperties = [];
    customData.rightPanel.existingProperties = [
      {
        id: "existing-pairing-long-property-name",
        propertyCode: 131,
        name: longPropertyName,
        action: "avoid",
        quantifier: null,
        bid: { type: "duration", value: "06:00", operator: "<" },
        tiers: buildTestTierOptions(["T1"]),
        priorityOptions: [],
        pairingNumber: "",
        pairingType: "Regular",
        effectiveDateRange: { from: "2026-06-01", to: "2026-06-30" },
      },
    ];
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    const existingRow = screen.getByTestId("pairing-property-row-existing-pairing-long-property-name");
    const propertyName = within(existingRow).getByText(longPropertyName);

    expect(propertyName).toHaveClass("whitespace-normal", "break-words");
    expect(propertyName).not.toHaveClass("truncate");
    expect(within(existingRow).getByTestId("pairing-property-actions-existing-pairing-long-property-name")).toBeInTheDocument();
    expect(within(existingRow).getByRole("button", { name: `Edit existing pairing property ${longPropertyName} 1` })).toBeInTheDocument();
  });

  it("loads page data through the pairing service boundary", async () => {
    const serviceSpy = vi.spyOn(pairingService, "getPageData");

    renderPairingPage();

    expect(screen.getByRole("status", { name: "Loading current pairing draft..." })).toBeInTheDocument();

    await waitFor(() => {
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("BIDDING CALENDAR")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "SEARCH PAIRINGS" })).toBeInTheDocument();
    expect(screen.getByText("EXISTING PAIRING PROPERTIES")).toBeInTheDocument();
    expect(screen.getByText("ADD PAIRING PROPERTIES")).toBeInTheDocument();
  });

  it("refreshes current tier pairing pool counts on demand", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    expect(screen.getByTestId("pairing-pool-counts-tier")).toHaveTextContent("T1");
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Counts not calculated");
    expect(pairingService.countCurrentRules).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledWith(
        "T1",
        expect.arrayContaining([
          expect.objectContaining({
            id: "existing-pairing-length-secondary",
          }),
        ]),
        PAIRING_SEARCH_PERIOD,
      );
    });
    expect(screen.getByTestId("pairing-pool-counts-tier")).toHaveTextContent("T1");
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("1 rule");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
    expect(screen.getByTestId("pairing-pool-count-existing-pairing-length-secondary")).toHaveTextContent(
      "20 pairings",
    );
    expect(screen.queryByText("Funnel:")).not.toBeInTheDocument();

    const pendingCounts = createPendingCurrentRulesCounts();

    vi.mocked(pairingService.countCurrentRules).mockClear();
    vi.mocked(pairingService.countCurrentRules).mockImplementationOnce(() => pendingCounts.promise);

    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Refreshing");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("Calculating...");
    expect(screen.getByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-pool-count-existing-pairing-length-secondary")).not.toBeInTheDocument();

    pendingCounts.resolve(buildCurrentRulesCountsResponse("T1"));

    await waitFor(() => {
      expect(screen.queryByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).not.toBeInTheDocument();
      expect(screen.getByTestId("pairing-pool-count-existing-pairing-length-secondary")).toHaveTextContent(
        "20 pairings",
      );
    });
  });

  it("highlights a current tier with zero matching pairings", async () => {
    const user = userEvent.setup();
    const emptyResponse = buildCurrentRulesCountsResponse("T1");
    emptyResponse.summary.allRules = {
      pairingIdCount: 0,
      totalItems: 0,
    };
    vi.mocked(pairingService.countCurrentRules).mockResolvedValueOnce(emptyResponse);

    renderPairingPage();

    await user.click(await screen.findByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("0 pairings matched");
    });
    expect(screen.getByTestId("pairing-pool-counts-summary").className).toContain("bg-[#fff8df]");
  });

  it("automatically refreshes current tier counts after adding a pairing bid from the left calendar", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
    });
    const pendingCounts = createPendingCurrentRulesCounts();

    vi.mocked(pairingService.countCurrentRules).mockClear();
    vi.mocked(pairingService.countCurrentRules).mockImplementationOnce(() => pendingCounts.promise);

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");

    await user.click(await within(popover).findByRole("checkbox", { name: /M4959/ }));
    await user.click(within(popover).getByRole("checkbox", { name: "T2" }));
    await user.click(within(popover).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(pairingService.addCurrentDraftProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          name: PAIRING_PREFERENCE_NAME,
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledTimes(1);
    });

    const countCall = vi.mocked(pairingService.countCurrentRules).mock.calls[0];
    const addedProperty = countCall?.[1].find((property) => property.id === "pairing-property-key-added-1");

    expect(countCall?.[0]).toBe("T1");
    expect(addedProperty).toEqual(
      expect.objectContaining({
        propertyCode: 102,
        name: PAIRING_PREFERENCE_NAME,
        bid: {
          type: "pairing-preference",
          pairingIds: ["496001"],
          pairingLabels: ["M4959"],
        },
      }),
    );
    expect(addedProperty?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T2"]);
    expect(countCall?.[2]).toEqual(PAIRING_SEARCH_PERIOD);
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Refreshing");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("Calculating...");
    expect(screen.getByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).toBeInTheDocument();
    expect(await screen.findByText("Pairing bid added.")).toBeInTheDocument();

    pendingCounts.resolve(buildCurrentRulesCountsResponse("T1"));

    await waitFor(() => {
      expect(screen.queryByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).not.toBeInTheDocument();
    });
  });

  it("does not refresh current tier counts when adding a pairing bid from the left calendar fails", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.addCurrentDraftProperty).mockRejectedValueOnce(new Error("add failed"));

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    vi.mocked(pairingService.countCurrentRules).mockClear();

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");

    await user.click(await within(popover).findByRole("checkbox", { name: /M4959/ }));
    await user.click(within(popover).getByRole("checkbox", { name: "T2" }));
    await user.click(within(popover).getByRole("button", { name: "ADD BID" }));

    expect(await screen.findAllByText("Unable to add pairing bid.")).not.toHaveLength(0);
    expect(pairingService.countCurrentRules).not.toHaveBeenCalled();
  });

  it("automatically refreshes pairing pool counts when the left bidding calendar Tx changes", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    vi.mocked(pairingService.countCurrentRules).mockClear();

    await user.click(screen.getByRole("button", { name: "TIER-04" }));

    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledWith(
        "T4",
        expect.arrayContaining([
          expect.objectContaining({
            id: "existing-duty-period",
          }),
        ]),
        PAIRING_SEARCH_PERIOD,
      );
    });
    expect(screen.getByTestId("pairing-pool-counts-tier")).toHaveTextContent("T4");
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("5 rules");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("42 pairings");
    expect(screen.getByTestId("pairing-pool-count-existing-duty-period")).toHaveTextContent(
      "80 pairings",
    );
  });

  it("shows row-level skeletons while the switched Tx summary is loading", async () => {
    const user = userEvent.setup();
    const pendingCounts = createPendingCurrentRulesCounts();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-count-existing-pairing-length-secondary")).toHaveTextContent(
        "20 pairings",
      );
    });
    vi.mocked(pairingService.countCurrentRules).mockClear();
    vi.mocked(pairingService.countCurrentRules).mockImplementationOnce(() => pendingCounts.promise);

    await user.click(screen.getByRole("button", { name: "TIER-04" }));

    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledWith(
        "T4",
        expect.arrayContaining([
          expect.objectContaining({
            id: "existing-duty-period",
          }),
        ]),
        PAIRING_SEARCH_PERIOD,
      );
    });
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Refreshing");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("Calculating...");
    expect(screen.getByTestId("pairing-pool-count-skeleton-existing-duty-period")).toBeInTheDocument();
    expect(screen.getByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-pool-count-existing-duty-period")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pairing-pool-count-existing-pairing-length-secondary")).not.toBeInTheDocument();

    pendingCounts.resolve(buildCurrentRulesCountsResponse("T4"));

    await waitFor(() => {
      expect(screen.queryByTestId("pairing-pool-count-skeleton-existing-duty-period")).not.toBeInTheDocument();
      expect(screen.getByTestId("pairing-pool-count-existing-duty-period")).toHaveTextContent("80 pairings");
    });
  });

  it("keeps current pairing pool counts when a non-current tier toggle is edited", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
    });

    vi.mocked(pairingService.countCurrentRules).mockClear();

    const existingRow = screen.getByTestId("pairing-property-row-existing-pairing-length-secondary");

    await user.click(within(existingRow).getByRole("button", {
      name: "Toggle existing T2 for Prefer Pairing Length",
    }));

    await waitFor(() => {
      expect(pairingService.patchCurrentDraftProperty).toHaveBeenCalled();
    });

    const patchedProperty = vi.mocked(pairingService.patchCurrentDraftProperty).mock.calls[0]?.[1];

    expect(patchedProperty?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T1", "T2"]);
    expect(pairingService.countCurrentRules).not.toHaveBeenCalled();
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("1 rule");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
    expect(screen.queryByText("Counts need refresh")).not.toBeInTheDocument();
    expect(screen.getByTestId("pairing-pool-count-existing-pairing-length-secondary")).toHaveTextContent(
      "20 pairings",
    );
  });

  it("automatically refreshes current Tx counts after a current tier toggle and keeps row counts visible", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-count-existing-duty-period")).toHaveTextContent("80 pairings");
      expect(screen.getByTestId("pairing-pool-count-existing-pairing-length-secondary")).toHaveTextContent(
        "20 pairings",
      );
    });
    const pendingCounts = createPendingCurrentRulesCounts();

    vi.mocked(pairingService.countCurrentRules).mockClear();
    vi.mocked(pairingService.countCurrentRules).mockImplementationOnce(() => pendingCounts.promise);

    const existingRow = screen.getByTestId("pairing-property-row-existing-duty-period");

    await user.click(within(existingRow).getByRole("button", {
      name: "Toggle existing T1 for Prefer Duty Period",
    }));

    await waitFor(() => {
      expect(pairingService.patchCurrentDraftProperty).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledTimes(1);
    });

    const patchedProperty = vi.mocked(pairingService.patchCurrentDraftProperty).mock.calls[0]?.[1];
    const countCall = vi.mocked(pairingService.countCurrentRules).mock.calls[0];
    const countedDutyPeriod = countCall?.[1].find((property) => property.id === "existing-duty-period");

    expect(patchedProperty?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T1", "T4"]);
    expect(countCall?.[0]).toBe("T1");
    expect(countedDutyPeriod?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T1", "T4"]);
    expect(countCall?.[2]).toEqual(PAIRING_SEARCH_PERIOD);
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Refreshing");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("Calculating...");
    expect(screen.getByTestId("pairing-pool-count-existing-duty-period")).toHaveTextContent("80 pairings");
    expect(screen.getByTestId("pairing-pool-count-existing-pairing-length-secondary")).toHaveTextContent(
      "20 pairings",
    );
    expect(screen.queryByTestId("pairing-pool-count-skeleton-existing-duty-period")).not.toBeInTheDocument();

    pendingCounts.resolve({
      ...buildCurrentRulesCountsResponse("T1"),
      summary: {
        activePropertyCount: 2,
        allRules: {
          pairingIdCount: 16,
          totalItems: 24,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("2 rules");
      expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("16 pairings");
    });
  });

  it("filters available pairing properties without rendering reset footer actions", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", { name: "ALL PROPERTIES" }));
    expect(screen.getAllByText("Prefer Pairing Length")).toHaveLength(3);
    expect(screen.queryByText("Minimum Avg Credit per Duty")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    expect(screen.getByRole("button", { name: "FAVORITED PROPERTIES" })).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByPlaceholderText("Search Properties"), "report");

    expect(screen.getAllByText("Report Between")).toHaveLength(1);
    expect(screen.getAllByText("Report Between on Date")).toHaveLength(1);
    expect(screen.queryByLabelText("Bid for available Prefer Pairing Length")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset All" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("shows template-only all properties and saved favorite summaries", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const addPropertiesWorkspace = screen.getByTestId("pairing-add-properties-workspace");

    await user.click(screen.getByRole("button", { name: "ALL PROPERTIES" }));
    expect(within(addPropertiesWorkspace).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(addPropertiesWorkspace).queryByText("BID")).not.toBeInTheDocument();
    expect(within(addPropertiesWorkspace).queryByRole("button", {
      name: "Toggle available T4 for Prefer Pairing Length",
    })).not.toBeInTheDocument();
    expect(within(addPropertiesWorkspace).getByText("Prefer Pairing Length")).toBeInTheDocument();
    expect(within(addPropertiesWorkspace).queryByText("Recommended")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));

    expect(within(addPropertiesWorkspace).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(addPropertiesWorkspace).queryByText("BID")).not.toBeInTheDocument();
    expect(within(addPropertiesWorkspace).queryByText("Saved setup")).not.toBeInTheDocument();
    expect(within(addPropertiesWorkspace).getByLabelText("Favorite bid for Prefer Pairing Length")).toBeInTheDocument();
    expect(within(addPropertiesWorkspace).getAllByText("T4").length).toBeGreaterThan(0);
    expect(within(addPropertiesWorkspace).queryByRole("button", {
      name: "Toggle available T4 for Prefer Pairing Length",
    })).not.toBeInTheDocument();
  });

  it("aligns the pairing configure dialog header and tiers order with days off", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const dialog = await openPairingConfigDialog(user, "Prefer Pairing Length");
    const labels = within(dialog)
      .getAllByText(/^(APPLY TO TIERS|MODE|BID|PROPERTY)$/)
      .map((item) => item.textContent);

    expect(within(dialog).getByText("Configure Pairing Bid")).toBeInTheDocument();
    expect(within(dialog).getByText("Prefer Pairing Length")).toBeInTheDocument();
    expect(labels).toEqual(["APPLY TO TIERS · REQUIRED", "MODE", "BID"]);
    expect(within(dialog).queryByText("PROPERTY")).not.toBeInTheDocument();
  });

  it("keeps pairing bid save actions disabled until required choices are selected", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const dialog = await openPairingConfigDialog(user, "Prefer Pairing Length");

    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Award" }));

    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();

    await selectPairingDialogTier(user, dialog, "Prefer Pairing Length");

    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();

    await selectPairingDialogBidOperator(user, dialog, "Prefer Pairing Length", "=");

    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeEnabled();
  });

  it("opens Flight Legs per Duty with default Award and Any duty, but requires an explicit tier, comparison, and legs value", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.availableProperties.unshift({
      id: "available-duty-legs",
      source: "catalog",
      propertyCode: 107,
      name: "Flight Legs per Duty",
      favorited: false,
      action: "award",
      quantifier: "any",
      bid: { type: "flight-legs-per-duty", operator: "=", legs: 1, dateScope: null },
      tiers: buildTestTierOptions(["T1"]),
      actions: ["add", "preview"],
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "", to: "" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.type(screen.getByPlaceholderText("Search Properties"), "Flight Legs");
    const dialog = await openPairingConfigDialog(user, "Flight Legs per Duty");

    expect(within(dialog).getByText("Configure Flight Legs per Duty")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Flight Legs per Duty" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Avoid" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "Any duty" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Every duty" })).toHaveAttribute("aria-pressed", "false");
    const operatorSelect = within(dialog).getByRole("combobox", { name: "Flight Legs per Duty operator" });
    expect(operatorSelect).toHaveValue("");
    expect(within(dialog).getByRole("spinbutton", { name: "Flight Legs per Duty legs per duty" })).toHaveValue(null);
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await selectPairingDialogTier(user, dialog, "Flight Legs per Duty");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.selectOptions(operatorSelect, ">");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    const legsInput = within(dialog).getByRole("spinbutton", { name: "Flight Legs per Duty legs per duty" });

    await user.type(legsInput, "9");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.clear(legsInput);
    await user.type(legsInput, "3");

    expect(within(dialog).queryByText("Award pairings with any duty having more than 3 legs.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();

    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "award",
          propertyCode: 107,
          quantifier: "any",
          tiers: expect.arrayContaining([
            expect.objectContaining({ active: true, label: "T1" }),
          ]),
          bid: {
            type: "flight-legs-per-duty",
            operator: ">",
            legs: 3,
            dateScope: null,
          },
        }),
        expect.any(Object),
      );
    });
  });

  it("opens Month-End Carryover with default Award but requires an explicit tier, comparison, and days value", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.availableProperties = customData.rightPanel.availableProperties.filter(
      (property) => property.propertyCode !== 163,
    );
    customData.rightPanel.availableProperties.unshift({
      id: "available-month-end-carryover",
      source: "catalog",
      propertyCode: 163,
      name: "Month-End Carryover",
      favorited: false,
      action: null,
      quantifier: null,
      bid: { type: "month-end-carryover", operator: ">", days: null },
      tiers: buildTestTierOptions(["T1"]),
      actions: ["add", "preview"],
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "", to: "" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.type(screen.getByPlaceholderText("Search Properties"), "Month-End");
    const dialog = await openPairingConfigDialog(user, "Month-End Carryover");

    expect(within(dialog).getByText("Configure Month-End Carryover")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Month-End Carryover" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Avoid" })).toHaveAttribute("aria-pressed", "false");
    const operatorSelect = within(dialog).getByRole("combobox", { name: "Month-End Carryover operator" });
    const daysInput = within(dialog).getByRole("spinbutton", { name: "Month-End Carryover carry-out days" });

    expect(operatorSelect).toHaveValue("");
    expect(daysInput).toHaveValue(null);
    expect(daysInput).toHaveAttribute("placeholder", "Enter");
    expect(within(dialog).queryByDisplayValue("1-5")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await selectPairingDialogTier(user, dialog, "Month-End Carryover");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.selectOptions(operatorSelect, ">");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.type(daysInput, "6");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();

    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "award",
          propertyCode: 163,
          quantifier: null,
          tiers: expect.arrayContaining([
            expect.objectContaining({ active: true, label: "T1" }),
          ]),
          bid: {
            type: "month-end-carryover",
            operator: ">",
            days: 6,
          },
        }),
        expect.any(Object),
      );
    });
  });

  it("adds award-only Work Day Preference with weekday check-in and optional event dates", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.availableProperties.unshift({
      id: "available-work-day-preference",
      source: "catalog",
      propertyCode: 110,
      name: "Work Day Preference",
      favorited: false,
      action: null,
      quantifier: null,
      bid: { type: "work-day-preference", days: [], dateScope: null },
      tiers: buildTestTierOptions(["T1"]),
      actions: ["add", "preview"],
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "", to: "" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.type(screen.getByPlaceholderText("Search Properties"), "Work Day");
    const dialog = await openPairingConfigDialog(user, "Work Day Preference");

    expect(within(dialog).getByText("Configure Work Day Preference")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Work Day Preference" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).queryByRole("button", { name: "Award" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Avoid" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: "Work Day Preference limit to event date" })).toHaveAttribute("aria-checked", "false");
    expect(within(dialog).queryByLabelText("BID Work Day Preference operator")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Rule Preview")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await selectPairingDialogTier(user, dialog, "Work Day Preference");
    await user.click(within(dialog).getByRole("button", { name: "Mon" }));
    await user.click(within(dialog).getByRole("button", { name: "Thu" }));
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText("Work Day Preference Mon check-in from"), { target: { value: "06:00" } });
    fireEvent.change(within(dialog).getByLabelText("Work Day Preference Mon check-in to"), { target: { value: "10:00" } });
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeEnabled();
    await user.click(within(dialog).getByRole("switch", { name: "Work Day Preference limit to event date" }));
    await user.click(within(dialog).getByRole("button", { name: "Open date picker for Work Day Preference event dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-03" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Selected dates do not match the selected work days.");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Open date picker for Work Day Preference event dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-02" }));

    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "award",
          propertyCode: 110,
          quantifier: null,
          tiers: expect.arrayContaining([
            expect.objectContaining({ active: true, label: "T1" }),
          ]),
          bid: {
            type: "work-day-preference",
            days: [
              { dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "10:00" },
              { dayOfWeek: "THU", checkInFrom: null, checkInTo: null },
            ],
            dateScope: { mode: "specific_dates", dates: ["2026-04-02", "2026-04-03"] },
          },
        }),
        expect.any(Object),
      );
    });
  });

  it("saves explicit credit priority for supported pairing credit bids", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const dialog = await openPairingConfigDialog(user, "Average Daily Block Time");
    const higherButton = within(dialog).getByRole("button", { name: "Higher" });
    const lowerButton = within(dialog).getByRole("button", { name: "Lower" });

    expect(within(dialog).getByText("CREDIT PRIORITY")).toBeInTheDocument();
    expect(higherButton).toHaveAttribute("aria-pressed", "false");
    expect(lowerButton).toHaveAttribute("aria-pressed", "false");

    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    await user.click(higherButton);
    expect(higherButton).toHaveAttribute("aria-pressed", "true");

    await user.click(higherButton);
    expect(higherButton).toHaveAttribute("aria-pressed", "false");

    await user.click(lowerButton);
    await selectPairingDialogBidOperator(user, dialog, "Average Daily Block Time", ">");
    await selectPairingDialogTier(user, dialog, "Average Daily Block Time");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 121,
          action: "award",
          bid: expect.objectContaining({
            type: "duration",
            value: "06:00",
            creditPriority: "lower",
          }),
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
    expect(screen.getByLabelText("Bid for existing Average Daily Block Time")).toHaveTextContent("Lower");
  });

  it("preserves credit priority when saving a configured pairing favorite", async () => {
    const user = userEvent.setup();
    const saveFavoriteSpy = vi.spyOn(pairingService, "saveConfiguredFavoriteProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const dialog = await openPairingConfigDialog(user, "Average Daily Block Time");

    await user.click(within(dialog).getByRole("button", { name: "Avoid" }));
    await user.click(within(dialog).getByRole("button", { name: "Higher" }));
    await selectPairingDialogBidOperator(user, dialog, "Average Daily Block Time", ">");
    await selectPairingDialogTier(user, dialog, "Average Daily Block Time");
    await user.click(within(dialog).getByRole("button", { name: "SAVE FAVORITE" }));

    await waitFor(() => {
      expect(saveFavoriteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 121,
          action: "avoid",
          bid: expect.objectContaining({
            type: "duration",
            value: "06:00",
            creditPriority: "higher",
          }),
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
  });

  it("navigates into the search pairings page from the pairing workbench", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", { name: "SEARCH PAIRINGS" }));

    expect(await screen.findByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(screen.getByTestId("pairing-search-current-rules-preview")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "T1" })).toHaveAttribute("aria-selected", "true");
    expect(pairingService.previewCurrentRules).toHaveBeenCalledWith(
      "T1",
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing-pairing-length-secondary",
          propertyCode: 131,
        }),
      ]),
      1,
      30,
      PAIRING_SEARCH_PERIOD,
    );
    expect(screen.queryByText("EXISTING PAIRING PROPERTIES")).not.toBeInTheDocument();
  });

  it("opens all visible pairings from the add pairing properties toolbar", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", { name: "ALL PAIRINGS" }));

    expect(await screen.findByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(screen.getByText("Showing all pairings available for this bid period.")).toBeInTheDocument();
    expect(screen.getByText("M4965")).toBeInTheDocument();
    expect(pairingService.previewAllPairings).toHaveBeenCalledWith(
      1,
      30,
      PAIRING_SEARCH_PERIOD,
      {},
    );
    expect(pairingService.previewCurrentRules).not.toHaveBeenCalled();
    expect(pairingService.previewCriteria).not.toHaveBeenCalled();
  });

  it("shows a message when searching current rules without active pairing properties", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.existingProperties = customData.rightPanel.existingProperties.map((property) => ({
      ...property,
      tiers: property.tiers.map((tier) => ({
        ...tier,
        active: false,
      })),
    }));
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await user.click(await screen.findByRole("button", { name: "SEARCH PAIRINGS" }));

    expect(await screen.findByText("Add at least one pairing property before searching pairings.")).toBeInTheDocument();
    expect(screen.getByText("EXISTING PAIRING PROPERTIES")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-search-panel")).not.toBeInTheDocument();
  });

  it("hides single-property preview from unconfigured all properties", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "ALL PROPERTIES" }));

    expect(screen.queryByRole("button", { name: "Preview Prefer Pairing Length" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Prefer Pairing Length" })).toBeInTheDocument();
  });

  it("opens single-property search preview from a favorite property eye action", async () => {
    const user = userEvent.setup();
    const patchFavoriteSpy = vi.spyOn(pairingService, "patchFavoriteProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    await user.click(screen.getByRole("button", { name: "Preview Prefer Pairing Length" }));

    expect(await screen.findByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(pairingService.previewSingleProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: 131,
        name: "Prefer Pairing Length",
      }),
      1,
      30,
      PAIRING_SEARCH_PERIOD,
    );

    await user.click(screen.getByRole("button", { name: "Edit search criteria Prefer Pairing Length" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Prefer Pairing Length" });
    const bidInput = within(configureDialog).getByLabelText("BID Prefer Pairing Length");

    await user.click(within(configureDialog).getByRole("button", { name: "Award" }));
    await user.clear(bidInput);
    await user.type(bidInput, "4");
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() =>
      expect(patchFavoriteSpy).toHaveBeenCalledWith(
        "10131",
        expect.objectContaining({
          propertyCode: 131,
          name: "Prefer Pairing Length",
          source: "favorite",
          favoriteKey: "10131",
          action: "award",
        }),
        pairingPageData.rightPanel.draftMeta,
      ),
    );
  });

  it("keeps a favorite Tx selection after returning from pairing preview", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    const favoriteT1 = screen.getByRole("button", {
      name: "Select T1 for favorite Prefer Pairing Length",
    });

    await user.click(favoriteT1);
    expect(favoriteT1).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Preview Prefer Pairing Length" }));
    await screen.findByTestId("pairing-search-panel");
    await user.click(screen.getByRole("button", { name: "Back to pairing workbench" }));

    const restoredFavoriteT1 = await screen.findByRole("button", {
      name: "Select T1 for favorite Prefer Pairing Length",
    });
    expect(restoredFavoriteT1).toHaveAttribute("aria-pressed", "true");
  });

  it("opens single-property search preview from an existing property eye action", async () => {
    const user = userEvent.setup();
    const patchExistingSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", {
      name: "Preview existing pairing property Prefer Pairing Type 2",
    }));

    expect(await screen.findByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(pairingService.previewSingleProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: 137,
        name: "Prefer Pairing Type",
      }),
      1,
      30,
      PAIRING_SEARCH_PERIOD,
    );

    await user.click(screen.getByRole("button", { name: "Edit search criteria Prefer Pairing Type" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Prefer Pairing Type" });

    await user.selectOptions(within(configureDialog).getByLabelText("BID Prefer Pairing Type"), "ODAN");
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() =>
      expect(patchExistingSpy).toHaveBeenCalledWith(
        "existing-pairing-type",
        expect.objectContaining({
          id: "existing-pairing-type",
          propertyCode: 137,
          name: "Prefer Pairing Type",
          bid: expect.objectContaining({
            value: "ODAN",
          }),
        }),
        pairingPageData.rightPanel.draftMeta,
      ),
    );
  });

  it("keeps existing bid read-only and configures available bids through the dialog before add", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    expect(screen.getByLabelText("Bid for existing Prefer Pairing Type")).toHaveTextContent("RedEye");
    expect(screen.getByLabelText("Bid for existing Prefer Pairing Type").tagName).toBe("DIV");
    expect(screen.getByLabelText("Bid for existing Prefer Pairing Type").className).not.toContain("truncate");
    expect(screen.getByText("COUNT")).toBeInTheDocument();
    expect(screen.getByText("ACTIONS")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Bid for existing Prefer Pairing Type" })).not.toBeInTheDocument();
    const deleteExistingButton = screen.getByRole("button", {
      name: "Delete existing pairing property Prefer Pairing Type 2",
    });
    const editExistingButton = screen.getByRole("button", {
      name: "Edit existing pairing property Prefer Pairing Type 2",
    });
    const previewExistingButton = screen.getByRole("button", {
      name: "Preview existing pairing property Prefer Pairing Type 2",
    });

    expect(deleteExistingButton.parentElement).toContainElement(editExistingButton);
    expect(deleteExistingButton.parentElement).toContainElement(previewExistingButton);
    expect(screen.getByTestId("pairing-property-actions-existing-pairing-type")).toContainElement(editExistingButton);
    expect(screen.getByTestId("pairing-property-actions-existing-pairing-type")).toContainElement(previewExistingButton);
    expect(screen.getByTestId("pairing-property-actions-existing-pairing-type")).toContainElement(deleteExistingButton);
    expect(screen.getByLabelText("Bid for existing Prefer Pairing Type").closest(".grid")).toHaveStyle({
      columnGap: "16px",
      gridTemplateColumns: "minmax(140px, 190px) minmax(240px, 1fr) 236px minmax(120px, 136px) minmax(84px, 92px)",
    });

    const existingTierToggle = screen.getByRole("button", {
      name: "Toggle existing T1 for Prefer Pairing Type",
    });
    await user.click(existingTierToggle);
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(existingTierToggle).toHaveAttribute("aria-pressed", "true");
    });

    await user.click(screen.getByRole("button", { name: "ALL PROPERTIES" }));
    expect(screen.queryByLabelText("Bid for available Prefer Pairing Length")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Bid for available Prefer Pairing Length" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit available pairing property Prefer Pairing Length" })).not.toBeInTheDocument();

    const addCallCountBeforeAdd = addPropertySpy.mock.calls.length;

    await goToAvailablePropertyPage(user, 137);
    const pairingTypeDialog = await openPairingConfigDialog(user, "Prefer Pairing Type");
    await user.selectOptions(within(pairingTypeDialog).getByLabelText("BID Prefer Pairing Type"), "RedEye");
    await user.click(within(pairingTypeDialog).getByRole("button", { name: "Toggle T6 for Prefer Pairing Type" }));
    await user.click(within(pairingTypeDialog).getByRole("button", { name: "Toggle T4 for Prefer Pairing Type" }));
    await user.click(within(pairingTypeDialog).getByRole("button", { name: "ADD BID" }));
    await waitFor(() => {
      expect(screen.getAllByText("Prefer Pairing Type")).toHaveLength(3);
    });

    await goToAvailablePropertyPage(user, 131);
    const pairingLengthDialog = await openPairingConfigDialog(user, "Prefer Pairing Length");
    await user.click(within(pairingLengthDialog).getByRole("button", { name: "Avoid" }));
    await selectPairingDialogBidOperator(user, pairingLengthDialog, "Prefer Pairing Length", "=");
    fireEvent.change(within(pairingLengthDialog).getByLabelText("BID Prefer Pairing Length"), {
      target: { value: "5" },
    });
    expect(within(pairingLengthDialog).getByLabelText("BID Prefer Pairing Length")).toHaveValue(5);
    expect(within(pairingLengthDialog).queryByRole("button", { name: "Increase BID Prefer Pairing Length" })).not.toBeInTheDocument();
    expect(within(pairingLengthDialog).queryByRole("button", { name: "Decrease BID Prefer Pairing Length" })).not.toBeInTheDocument();
    await selectPairingDialogTier(user, pairingLengthDialog, "Prefer Pairing Length");
    await user.click(within(pairingLengthDialog).getByRole("button", { name: "ADD BID" }));
    await waitFor(() => {
      expect(addPropertySpy.mock.calls.length).toBeGreaterThan(addCallCountBeforeAdd);
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 131,
          action: "avoid",
          bid: expect.objectContaining({
            value: 5,
          }),
        }),
        expect.objectContaining({
          ...pairingPageData.rightPanel.draftMeta,
          draftVersion: pairingPageData.rightPanel.draftMeta.draftVersion + 1,
        }),
      );
    });
    expect(screen.getAllByLabelText("Bid for existing Prefer Pairing Length")).toEqual(
      expect.arrayContaining([expect.objectContaining({ textContent: expect.stringContaining("Avoid · = 5") })]),
    );

    await user.click(
      screen.getAllByRole("button", {
        name: /Delete existing pairing property Prefer Pairing Type/,
      })[1],
    );
    await waitFor(() => {
      expect(screen.getAllByRole("button", {
        name: /Delete existing pairing property Prefer Pairing Type/,
      })).toHaveLength(1);
    });
  }, 10_000);

  it("renders long existing Pairing Preference bids as grouped readable summaries", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.existingProperties.push({
      id: "existing-pairing-number-summary",
      propertyCode: 102,
      name: PAIRING_PREFERENCE_NAME,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-occurrence-list",
        occurrences: [
          {
            occurrenceId: "4101:2026-06-05",
            originDate: "2026-06-05",
            pairingId: "4101",
            pairingNumber: "E4101",
          },
          {
            occurrenceId: "4103:2026-06-05",
            originDate: "2026-06-05",
            pairingId: "4103",
            pairingNumber: "E4103",
          },
          {
            occurrenceId: "4103:2026-06-08",
            originDate: "2026-06-08",
            pairingId: "4103",
            pairingNumber: "E4103",
          },
          {
            occurrenceId: "4103:2026-06-10",
            originDate: "2026-06-10",
            pairingId: "4103",
            pairingNumber: "E4103",
          },
          {
            occurrenceId: "4103:2026-06-12",
            originDate: "2026-06-12",
            pairingId: "4103",
            pairingNumber: "E4103",
          },
          {
            occurrenceId: "4103:2026-06-19",
            originDate: "2026-06-19",
            pairingId: "4103",
            pairingNumber: "E4103",
          },
          {
            occurrenceId: "4106:2026-06-02",
            originDate: "2026-06-02",
            pairingId: "4106",
            pairingNumber: "E4106",
          },
          {
            occurrenceId: "4108:2026-06-04",
            originDate: "2026-06-04",
            pairingId: "4108",
            pairingNumber: "E4108",
          },
        ],
      },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [],
      pairingNumber: "",
      pairingType: "Regular",
      effectiveDateRange: { from: "2026-06-01", to: "2026-06-30" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    const bid = screen.getByLabelText(`Bid for existing ${PAIRING_PREFERENCE_NAME}`);

    expect(bid).toHaveTextContent(`Award · ${PAIRING_PREFERENCE_NAME} · 8 selected`);
    expect(bid).toHaveTextContent("E4101");
    expect(bid).toHaveTextContent("Jun 05");
    expect(bid).toHaveTextContent("E4103");
    expect(bid).toHaveTextContent("Jun 08");
    expect(bid).toHaveTextContent("Jun 10");
    expect(bid).toHaveTextContent("+2 more");
    expect(bid).toHaveTextContent("+1 more pairings");
    expect(bid).not.toHaveTextContent("E4108");
    expect(bid).not.toHaveTextContent("Jun 12");

    await user.click(within(bid).getByRole("button", { name: "Show all 8 selected" }));

    expect(bid).toHaveTextContent("E4108");
    expect(bid).toHaveTextContent("Jun 12");
    expect(bid).toHaveTextContent("Jun 19");

    await user.click(within(bid).getByRole("button", { name: "Show less" }));

    expect(bid).not.toHaveTextContent("E4108");
    expect(bid).not.toHaveTextContent("Jun 12");
  });

  it("keeps add pairing property disabled until the immediate save completes", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.addCurrentDraftProperty).mockImplementationOnce(
      () =>
        new Promise<{ saved: true; propertyGroupKey: string; rowSeq: number }>((resolve) => {
          pendingSave.resolve = () => resolve({
            saved: true,
            propertyGroupKey: "pairing-property-key-pending-add",
            rowSeq: 7,
          });
        }),
    );

    renderPairingPage();

    await showAllPairingProperties(user);
    const addButton = await screen.findByRole("button", { name: "Add Prefer Duty Period" });

    await user.click(addButton);
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Duty Period" });
    const dialogAddButton = within(dialog).getByRole("button", { name: "ADD BID" });
    await selectPairingDialogTier(user, dialog, "Prefer Duty Period");
    await user.click(dialogAddButton);

    expect(addButton).toBeDisabled();
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADDING..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "CANCEL" })).toBeDisabled();
    expect(within(dialog).getByText("Configure Pairing Bid")).toBeInTheDocument();
    expect(within(dialog).getByText("Prefer Duty Period")).toBeInTheDocument();
    expect(pairingService.addCurrentDraftProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: 133,
        name: "Prefer Duty Period",
      }),
      pairingPageData.rightPanel.draftMeta,
    );

    if (!pendingSave.resolve) {
      throw new Error("Expected add pairing save to be pending.");
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(addButton).not.toBeDisabled();
      expect(screen.queryByRole("dialog", { name: "Configure Prefer Duty Period" })).not.toBeInTheDocument();
      expect(screen.getAllByText("Prefer Duty Period")).toHaveLength(3);
    });
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
  });

  it("automatically refreshes current tier counts after adding a pairing property", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
    });
    const pendingCounts = createPendingCurrentRulesCounts();

    vi.mocked(pairingService.countCurrentRules).mockClear();
    vi.mocked(pairingService.countCurrentRules).mockImplementationOnce(() => pendingCounts.promise);

    await addConfiguredPairingProperty(user, "Prefer Duty Period");

    await waitFor(() => {
      expect(pairingService.addCurrentDraftProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 133,
          name: "Prefer Duty Period",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledTimes(1);
    });

    const countCall = vi.mocked(pairingService.countCurrentRules).mock.calls[0];

    expect(countCall?.[0]).toBe("T1");
    expect(countCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pairing-property-key-added-1",
          propertyCode: 133,
          name: "Prefer Duty Period",
        }),
      ]),
    );
    expect(countCall?.[1]).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          id: "existing-available-duty-period-7",
        }),
      ]),
    );
    expect(countCall?.[2]).toEqual(PAIRING_SEARCH_PERIOD);
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Refreshing");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("Calculating...");
    expect(screen.getByTestId("pairing-pool-count-skeleton-pairing-property-key-added-1")).toBeInTheDocument();
    expect(screen.getByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).toBeInTheDocument();
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
    expect(screen.queryByText("Counts need refresh")).not.toBeInTheDocument();

    pendingCounts.resolve(buildCurrentRulesCountsResponse("T1"));

    await waitFor(() => {
      expect(screen.queryByTestId("pairing-pool-count-skeleton-pairing-property-key-added-1")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
  });

  it("adds an available Pairing Preference for the whole bid month from the single configure dialog", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    const configDialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    const dialogAddButton = within(configDialog).getByRole("button", { name: "ADD BID" });

    expect(dialogAddButton).toBeDisabled();
    expect(within(configDialog).getByRole("textbox", { name: "Search pairings" })).toHaveValue("");
    expect(screen.queryByRole("dialog", { name: "Choose pairing number occurrence" })).not.toBeInTheDocument();
    expect(within(configDialog).queryByRole("switch", { name: "Pairing Preference limit to run date" })).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("Select at least one pairing number.")).not.toBeInTheDocument();
    const tierOne = within(configDialog).getByRole("button", { name: `Toggle T1 for ${PAIRING_PREFERENCE_NAME}` });

    expect(tierOne).toHaveAttribute("aria-pressed", "false");
    expect(within(configDialog).getAllByText(/· REQUIRED/).length).toBeGreaterThanOrEqual(2);
    expect(within(configDialog).getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");

    await user.click(tierOne);

    await selectPairingNumberInDialog(user, configDialog);

    expect(pairingService.getPairingDetails).not.toHaveBeenCalled();
    expect(within(configDialog).queryByRole("switch", { name: "Pairing Preference limit to run date" }))
      .not.toBeInTheDocument();
    await user.click(dialogAddButton);

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          name: PAIRING_PREFERENCE_NAME,
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001"],
            pairingLabels: ["M4959"],
          },
          pairingNumber: "M4959",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
  });

  it("returns Pairing Preference to its clean initial state when the last pairing is removed", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    const configDialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    await selectPairingNumberInDialog(user, configDialog);

    await user.click(within(configDialog).getByRole("button", {
      name: "Remove pairing M4959",
    }));

    await waitFor(() => {
      expect(within(configDialog).queryByRole("switch", { name: "Pairing Preference limit to run date" })).not.toBeInTheDocument();
      expect(within(configDialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    });
    expect(within(configDialog).queryByText("Select at least one pairing number.")).not.toBeInTheDocument();
    expect(within(configDialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
  });

  it("starts Pairing Preference with no Tier and never renders run-date or fulfilment modifiers", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    const configDialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    const addButton = within(configDialog).getByRole("button", { name: "ADD BID" });
    const tierOne = within(configDialog).getByRole("button", {
      name: `Toggle T1 for ${PAIRING_PREFERENCE_NAME}`,
    });

    expect(tierOne).toHaveAttribute("aria-pressed", "false");
    expect(within(configDialog).getAllByText(/· REQUIRED/).length).toBeGreaterThanOrEqual(2);
    expect(addButton).toBeDisabled();

    await user.click(tierOne);
    await selectPairingNumberInDialog(user, configDialog);

    expect(within(configDialog).queryByText("LIMIT TO RUN DATE")).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("Minimum required")).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("Maximum required")).not.toBeInTheDocument();
    expect(addButton).not.toBeDisabled();
  });

  it("shows selected Pairing Preference labels while keeping stable ids for the saved values", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    mockPairingPickerRows([
      { pairingId: "496001", pairingNumber: "M4959", originDate: "2026-04-03", endDate: "2026-04-05" },
      { pairingId: "414601", pairingNumber: "V4146", originDate: "2026-04-08", endDate: "2026-04-09" },
    ]);

    renderPairingPage();

    const configDialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    await selectPairingDialogTier(user, configDialog, PAIRING_PREFERENCE_NAME);
    await selectPairingNumberInDialog(user, configDialog, "M4959");
    await selectPairingNumberInDialog(user, configDialog, "V4146");

    expect(within(configDialog).getAllByText("M4959").length).toBeGreaterThanOrEqual(2);
    expect(within(configDialog).getAllByText("V4146").length).toBeGreaterThanOrEqual(2);
    expect(within(configDialog).queryByText("496001")).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("414601")).not.toBeInTheDocument();

    await user.click(within(configDialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001", "414601"],
            pairingLabels: ["M4959", "V4146"],
          },
          pairingNumber: "M4959",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
  });

  it("saves only remaining selected Pairing Preference labels in whole-month mode", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    mockPairingPickerRows([
      { pairingId: "496001", pairingNumber: "M4959", originDate: "2026-04-03", endDate: "2026-04-05" },
      { pairingId: "414601", pairingNumber: "V4146", originDate: "2026-04-08", endDate: "2026-04-09" },
    ]);

    renderPairingPage();

    const configDialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    await selectPairingDialogTier(user, configDialog, PAIRING_PREFERENCE_NAME);
    await selectPairingNumberInDialog(user, configDialog, "M4959");
    await selectPairingNumberInDialog(user, configDialog, "V4146");

    const secondPairingButton = within(configDialog).getByRole("button", {
      name: "Remove pairing V4146",
    });

    await user.click(secondPairingButton);
    expect(within(configDialog).queryByRole("button", { name: "Remove pairing V4146" })).not.toBeInTheDocument();

    await user.click(within(configDialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001"],
            pairingLabels: ["M4959"],
          },
          pairingNumber: "M4959",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
  });

  it("adds Pairing Preference without run-date or fulfilment modifiers", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    const configDialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    await selectPairingDialogTier(user, configDialog, PAIRING_PREFERENCE_NAME);
    await selectPairingNumberInDialog(user, configDialog);

    expect(within(configDialog).queryByText("LIMIT TO RUN DATE")).not.toBeInTheDocument();
    expect(within(configDialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(pairingService.getPairingDetails).not.toHaveBeenCalled();
    await user.click(within(configDialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          name: PAIRING_PREFERENCE_NAME,
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001"],
            pairingLabels: ["M4959"],
          },
          pairingNumber: "M4959",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(screen.queryByRole("dialog", { name: "Choose pairing number occurrence" })).not.toBeInTheDocument();
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
  });

  it("shows an error message when adding a pairing property fails", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.addCurrentDraftProperty).mockRejectedValueOnce(new Error("add failed"));

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    vi.mocked(pairingService.countCurrentRules).mockClear();

    await addConfiguredPairingProperty(user, "Prefer Duty Period");

    expect(await screen.findByText("Unable to add pairing property.")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Configure Prefer Duty Period" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).not.toBeDisabled();
    expect(pairingService.countCurrentRules).not.toHaveBeenCalled();
  });

  it("blocks adding an exact duplicate condition in the same tier before calling the API", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await goToAvailablePropertyPage(user, 137);
    const addCallCountBeforeClick = addPropertySpy.mock.calls.length;

    const dialog = await openPairingConfigDialog(user, "Prefer Pairing Type");
    await selectPairingDialogTier(user, dialog, "Prefer Pairing Type", "T4");
    await user.selectOptions(within(dialog).getByLabelText("BID Prefer Pairing Type"), "RedEye");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    expect(await screen.findByText("This pairing condition already exists in T4.")).toBeInTheDocument();
    expect(addPropertySpy.mock.calls.length).toBe(addCallCountBeforeClick);
  });

  it("opens Any/Every Duty Duration with duration controls and no equals operator", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.type(screen.getByPlaceholderText("Search Properties"), "Duty Duration");
    const dialog = await openPairingConfigDialog(user, "Any/Every Duty Duration");

    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Any/Every Duty Duration" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Toggle T2 for Any/Every Duty Duration" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Any" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Every" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "=" })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("BID Any/Every Duty Duration")).toHaveAttribute("placeholder", "HH:MM");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
  });

  it("opens Airport Preference with default Award and Landing, but no default Tier or date scope", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.type(screen.getByPlaceholderText("Search Properties"), "Airport Preference");
    const dialog = await openPairingConfigDialog(user, "Airport Preference");

    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Airport Preference" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Toggle T2 for Airport Preference" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: /^Award$/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /^Avoid$/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: /^Landing$/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /^Layover$/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByLabelText("Airport Preference airports or cities")).toHaveAttribute("aria-disabled", "false");
    expect(within(dialog).getByRole("switch", { name: "Airport Preference limit to event date" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(dialog).queryByRole("button", { name: "Specific Dates" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: /^Layover$/ }));
    await user.click(within(dialog).getByLabelText("Airport Preference airports or cities"));
    expect(await screen.findByRole("option", { name: /YYZ · Toronto Pearson/i })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /YYZ · Toronto Pearson/i }));

    await user.click(within(dialog).getByLabelText("Airport Preference limit to event date"));
    expect(within(dialog).getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Date Range" })).toBeInTheDocument();

    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Minimum Required")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Maximum Required")).not.toBeInTheDocument();

    await user.click(within(dialog).getByLabelText("Airport Preference preferred layover hours"));
    expect(within(dialog).getByLabelText("Airport Preference preferred layover hours value")).toHaveValue("13");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
  });

  it("keeps saved Airport Preference values unchanged when editing an existing bid", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.existingProperties.push({
      id: "existing-airport-preference",
      propertyCode: 168,
      name: "Airport Preference",
      action: null,
      quantifier: null,
      bid: {
        type: "airport-preference",
        event: "layover",
        locations: [{ code: "YVR", kind: "airport" }],
        dateScope: { mode: "specific_dates", dates: ["2026-04-10"] },
        minimumLayoverDuration: null,
      },
      tiers: buildTestTierOptions(["T3"]),
      priorityOptions: [],
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "2026-04-01", to: "2026-04-30" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", {
      name: /Edit existing pairing property Airport Preference/,
    }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Airport Preference" });

    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Airport Preference" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Toggle T3 for Airport Preference" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: /^Award$/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: /^Avoid$/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: /^Landing$/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: /^Layover$/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByLabelText("Airport Preference airports or cities")).toHaveTextContent("YVR");
    expect(within(dialog).getByRole("switch", { name: "Airport Preference limit to event date" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
  });

  it("opens Time Between Flights with compact duration controls and any/every support", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);
    const template = customData.rightPanel.existingProperties.find((property) => property.propertyCode === 131);

    if (!template) {
      throw new Error("Expected an existing pairing length fixture.");
    }

    customData.rightPanel.existingProperties.push({
      id: "existing-sit-length",
      propertyCode: 129,
      name: "Time Between Flights",
      action: "award",
      quantifier: "any",
      bid: { type: "duration", value: "1:05", operator: ">" },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [...template.priorityOptions],
      pairingNumber: template.pairingNumber,
      pairingType: template.pairingType,
      effectiveDateRange: { ...template.effectiveDateRange },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", {
      name: /Edit existing pairing property Time Between Flights/,
    }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Time Between Flights" });

    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Time Between Flights" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: "Toggle T2 for Time Between Flights" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByText("MATCH")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: "Any" })).toHaveLength(1);
    expect(within(dialog).getAllByRole("button", { name: "Every" })).toHaveLength(1);
    expect(within(dialog).getByRole("option", { name: "=" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: ">" })).toBeInTheDocument();
    const durationInput = within(dialog).getByLabelText("Time Between Flights duration");
    expect(durationInput).toHaveAttribute("placeholder", "00:45 – 04:20");
    expect(durationInput).toHaveValue("01:05");
    expect(within(dialog).getByRole("button", { name: "UPDATE BID" })).toBeInTheDocument();
  });

  it("refetches Time Between Flights limits when reopened and preserves an unchanged existing value", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);
    const template = customData.rightPanel.existingProperties.find((property) => property.propertyCode === 131);

    if (!template) {
      throw new Error("Expected an existing pairing length fixture.");
    }

    customData.rightPanel.existingProperties.push({
      id: "existing-time-between-flights",
      propertyCode: 129,
      name: "Time Between Flights",
      action: "award",
      quantifier: "any",
      bid: { type: "duration", value: "01:05", operator: ">" },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [...template.priorityOptions],
      pairingNumber: template.pairingNumber,
      pairingType: template.pairingType,
      effectiveDateRange: { ...template.effectiveDateRange },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);
    vi.mocked(pairingService.getTimeBetweenFlightsBounds)
      .mockResolvedValueOnce({ minimumMinutes: 45, maximumMinutes: 260 })
      .mockResolvedValueOnce({ minimumMinutes: 75, maximumMinutes: 260 });

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    const editButton = screen.getByRole("button", {
      name: /Edit existing pairing property Time Between Flights/,
    });
    await user.click(editButton);

    let dialog = await screen.findByRole("dialog", { name: "Configure Time Between Flights" });
    expect(within(dialog).getByLabelText("Time Between Flights duration")).toHaveAttribute(
      "placeholder",
      "00:45 – 04:20",
    );
    await user.click(within(dialog).getByRole("button", {
      name: "Close configure dialog for Time Between Flights",
    }));
    await user.click(editButton);

    dialog = await screen.findByRole("dialog", { name: "Configure Time Between Flights" });
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Time Between Flights duration")).toHaveAttribute(
        "placeholder",
        "01:15 – 04:20",
      );
    });
    expect(within(dialog).getByRole("button", { name: "UPDATE BID" })).toBeEnabled();

    await user.clear(within(dialog).getByLabelText("Time Between Flights duration"));
    await user.type(within(dialog).getByLabelText("Time Between Flights duration"), "01:04");
    expect(within(dialog).getByRole("button", { name: "UPDATE BID" })).toBeDisabled();
  });

  it("shows a retry action when Time Between Flights limits cannot load", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);
    const template = customData.rightPanel.existingProperties.find((property) => property.propertyCode === 131);

    if (!template) {
      throw new Error("Expected an existing pairing length fixture.");
    }

    customData.rightPanel.existingProperties.push({
      id: "existing-time-between-flights-error",
      propertyCode: 129,
      name: "Time Between Flights",
      action: "award",
      quantifier: "any",
      bid: { type: "duration", value: "01:05", operator: ">" },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [...template.priorityOptions],
      pairingNumber: template.pairingNumber,
      pairingType: template.pairingType,
      effectiveDateRange: { ...template.effectiveDateRange },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);
    vi.mocked(pairingService.getTimeBetweenFlightsBounds)
      .mockRejectedValueOnce(new Error("configuration unavailable"))
      .mockResolvedValueOnce({ minimumMinutes: 45, maximumMinutes: 260 });

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", {
      name: /Edit existing pairing property Time Between Flights/,
    }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Time Between Flights" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Unable to load the Time Between Flights limits.",
    );

    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByLabelText("Time Between Flights duration")).toHaveAttribute(
      "placeholder",
      "00:45 – 04:20",
    );
  });

  it("opens Average Daily Block Time with duration controls and no equals operator", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.type(screen.getByPlaceholderText("Search Properties"), "Block Time");
    const dialog = await openPairingConfigDialog(user, "Average Daily Block Time");

    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Average Daily Block Time" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Toggle T2 for Average Daily Block Time" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dialog).queryByRole("option", { name: "=" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: ">" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "<" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("BID Average Daily Block Time")).toHaveAttribute("placeholder", "HH:MM");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
  });

  it("blocks adding a single-use property twice in the same tier even with a different bid", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await showAllPairingProperties(user);
    await user.click(screen.getByRole("button", { name: "Go to available properties page 2" }));

    const addCallCountBeforeClick = addPropertySpy.mock.calls.length;

    const dialog = await openPairingConfigDialog(user, "Maximum TAFB-Credit Ratio");
    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    fireEvent.change(within(dialog).getByLabelText("BID Maximum TAFB-Credit Ratio"), {
      target: { value: "30.00" },
    });
    await selectPairingDialogBidOperator(user, dialog, "Maximum TAFB-Credit Ratio", "=");
    await selectPairingDialogTier(user, dialog, "Maximum TAFB-Credit Ratio", "T6");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    expect(await screen.findByText("Maximum TAFB-Credit Ratio can only be used once in T6.")).toBeInTheDocument();
    expect(addPropertySpy.mock.calls.length).toBe(addCallCountBeforeClick);
  });

  it("keeps delete pairing property disabled until the immediate save completes", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.removeCurrentDraftProperty).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pendingSave.resolve = () => resolve({ saved: true, draftVersion: 1 });
        }),
    );

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const deleteButton = screen.getByRole("button", {
      name: /Delete existing pairing property Prefer Pairing Type/,
    });

    await user.click(deleteButton);

    expect(deleteButton).toBeDisabled();
    expect(screen.getByLabelText("Bid for existing Prefer Pairing Type")).toBeInTheDocument();
    expect(pairingService.removeCurrentDraftProperty).toHaveBeenCalledWith(
      "existing-pairing-type",
      pairingPageData.rightPanel.draftMeta,
    );

    if (!pendingSave.resolve) {
      throw new Error("Expected delete pairing save to be pending.");
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(screen.queryByLabelText("Bid for existing Prefer Pairing Type")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Pairing property deleted.")).toBeInTheDocument();
  });

  it("automatically refreshes current tier counts after deleting an existing pairing property", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "REFRESH" }));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
    });
    const pendingCounts = createPendingCurrentRulesCounts();

    vi.mocked(pairingService.countCurrentRules).mockClear();
    vi.mocked(pairingService.countCurrentRules).mockImplementationOnce(() => pendingCounts.promise);

    await user.click(screen.getByRole("button", {
      name: /Delete existing pairing property Prefer Pairing Type/,
    }));

    await waitFor(() => {
      expect(pairingService.removeCurrentDraftProperty).toHaveBeenCalledWith(
        "existing-pairing-type",
        pairingPageData.rightPanel.draftMeta,
      );
    });
    await waitFor(() => {
      expect(pairingService.countCurrentRules).toHaveBeenCalledTimes(1);
    });

    const countCall = vi.mocked(pairingService.countCurrentRules).mock.calls[0];

    expect(countCall?.[0]).toBe("T1");
    expect(countCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing-pairing-length-secondary",
        }),
      ]),
    );
    expect(countCall?.[1]).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          id: "existing-pairing-type",
        }),
      ]),
    );
    expect(countCall?.[2]).toEqual(PAIRING_SEARCH_PERIOD);
    expect(screen.getByTestId("pairing-pool-counts-rules")).toHaveTextContent("Refreshing");
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("Calculating...");
    expect(screen.getByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-pool-count-existing-pairing-length-secondary")).not.toBeInTheDocument();
    expect(await screen.findByText("Pairing property deleted.")).toBeInTheDocument();
    expect(screen.queryByText("Counts need refresh")).not.toBeInTheDocument();

    pendingCounts.resolve(buildCurrentRulesCountsResponse("T1"));

    await waitFor(() => {
      expect(screen.queryByTestId("pairing-pool-count-skeleton-existing-pairing-length-secondary")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("pairing-pool-counts-pairings")).toHaveTextContent("12 pairings");
  });

  it("shows an error message when deleting an existing pairing property fails", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.removeCurrentDraftProperty).mockRejectedValueOnce(new Error("delete failed"));

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    vi.mocked(pairingService.countCurrentRules).mockClear();

    await user.click(screen.getByRole("button", {
      name: /Delete existing pairing property Prefer Pairing Type/,
    }));

    expect(await screen.findByText("Unable to delete pairing property.")).toBeInTheDocument();
    expect(pairingService.countCurrentRules).not.toHaveBeenCalled();
  });

  it("keeps existing pairing tier actions disabled until the immediate save completes", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.patchCurrentDraftProperty).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pendingSave.resolve = () => resolve({
            saved: true,
            draftVersion: 1,
            propertyGroupKey: "existing-pairing-type",
            deleted: false,
            tiers: ["T3", "T4"],
          });
        }),
    );

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const tierToggle = screen.getByRole("button", {
      name: "Toggle existing T2 for Prefer Pairing Type",
    });
    const deleteButton = screen.getByRole("button", {
      name: /Delete existing pairing property Prefer Pairing Type/,
    });
    const addButton = screen.getByRole("button", { name: "Add Prefer Duty Period" });

    await user.click(tierToggle);

    expect(tierToggle).toBeDisabled();
    expect(deleteButton).toBeDisabled();
    expect(addButton).toBeDisabled();

    const savedPairingType = vi.mocked(pairingService.patchCurrentDraftProperty).mock.calls[0]?.[1];

    expect(savedPairingType?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T3", "T4"]);

    if (!pendingSave.resolve) {
      throw new Error("Expected existing tier save to be pending.");
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(tierToggle).not.toBeDisabled();
      expect(tierToggle).toHaveAttribute("aria-pressed", "false");
    });
    expect(await screen.findByText("Pairing property updated.")).toBeInTheDocument();
  });

  it("shows an error message when updating existing pairing tiers fails", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.patchCurrentDraftProperty).mockRejectedValueOnce(new Error("save failed"));

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const tierToggle = screen.getByRole("button", {
      name: "Toggle existing T2 for Prefer Pairing Type",
    });

    await user.click(tierToggle);

    expect(await screen.findByText("Unable to update pairing property.")).toBeInTheDocument();
    expect(tierToggle).not.toBeDisabled();
    expect(tierToggle).toHaveAttribute("aria-pressed", "true");
  });

  it("edits an existing pairing property through the configure dialog", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", {
      name: "Edit existing pairing property Prefer Pairing Length 4",
    }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Pairing Length" });

    await user.click(within(dialog).getByRole("button", { name: "Avoid" }));
    fireEvent.change(within(dialog).getByLabelText("BID Prefer Pairing Length"), {
      target: { value: "6" },
    });
    const pendingPatch = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.patchCurrentDraftProperty).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pendingPatch.resolve = () => resolve({
            saved: true,
            draftVersion: 1,
            propertyGroupKey: "existing-pairing-length",
            deleted: false,
            tiers: ["T4", "T5"],
          });
        }),
    );

    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "UPDATING..." })).toBeDisabled();

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "existing-pairing-length",
        expect.objectContaining({
          action: "avoid",
          bid: expect.objectContaining({ value: 6 }),
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });

    if (!pendingPatch.resolve) {
      throw new Error("Expected patch pairing save to be pending.");
    }

    pendingPatch.resolve();

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Configure Prefer Pairing Length" })).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Pairing property updated.")).toBeInTheDocument();
  });

  it("keeps closed-period existing pairing actions read-only without showing an updating state", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");

    vi.mocked(pairingService.getPageData).mockResolvedValue(buildClosedPeriodPairingPageData());

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    const editButton = screen.getByRole("button", {
      name: "Edit existing pairing property Prefer Pairing Length 4",
    });

    expect(editButton).toBeDisabled();
    await user.click(editButton);

    expect(screen.queryByRole("dialog", { name: "Configure Prefer Pairing Length" })).not.toBeInTheDocument();
    expect(screen.queryByText("UPDATING...")).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it("does not let requested existing pairing edits bypass a closed bid period", async () => {
    const onRequestedExistingPropertyHandled = vi.fn();
    const patchSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");

    vi.mocked(pairingService.getPageData).mockResolvedValue(buildClosedPeriodPairingPageData());

    renderPairingPage(false, {
      requestedExistingPropertyId: "existing-pairing-length",
      onRequestedExistingPropertyHandled,
    });

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    expect(onRequestedExistingPropertyHandled).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Bidding closed at May 08, 22:59.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Configure Prefer Pairing Length" })).not.toBeInTheDocument();
    expect(screen.queryByText("UPDATING...")).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it("reopens existing credit priority bids and allows clearing the selection", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.existingProperties.push({
      id: "existing-pairing-total-credit",
      propertyCode: 105,
      name: "Pairing Total Credit",
      action: "award",
      quantifier: null,
      bid: { type: "duration", value: "08:00", operator: ">", creditPriority: "lower" },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [],
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "2026-04-01", to: "2026-04-30" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", {
      name: /Edit existing pairing property Pairing Total Credit/,
    }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Pairing Total Credit" });
    const lowerButton = within(dialog).getByRole("button", { name: "Lower" });

    expect(lowerButton).toHaveAttribute("aria-pressed", "true");

    await user.click(lowerButton);
    expect(lowerButton).toHaveAttribute("aria-pressed", "false");
    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "existing-pairing-total-credit",
        expect.objectContaining({
          bid: {
            type: "duration",
            value: "08:00",
            operator: ">",
          },
        }),
        customData.rightPanel.draftMeta,
      );
    });
  });

  it("edits an existing Pairing Preference using selected Pairing IDs only", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(pairingService, "patchCurrentDraftProperty");
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.existingProperties.push({
      id: "existing-pairing-number",
      propertyCode: 102,
      name: PAIRING_PREFERENCE_NAME,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-preference",
        pairingIds: ["496001"],
        pairingLabels: ["M4959"],
      },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [],
      pairingNumber: "M4959",
      pairingType: "Regular",
      effectiveDateRange: { from: "2026-04-03", to: "2026-04-05" },
    });
    mockPairingPickerRows([
      { pairingId: "496001", pairingNumber: "M4959", originDate: "2026-04-03", endDate: "2026-04-05" },
      { pairingId: "414601", pairingNumber: "V4146", originDate: "2026-04-08", endDate: "2026-04-09" },
    ]);
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", {
      name: `Edit existing pairing property ${PAIRING_PREFERENCE_NAME} 7`,
    }));
    const dialog = await screen.findByRole("dialog", { name: `Configure ${PAIRING_PREFERENCE_NAME}` });

    expect(within(dialog).getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
    expect(screen.queryByRole("dialog", { name: "Choose pairing number occurrence" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: `Toggle T1 for ${PAIRING_PREFERENCE_NAME}` }))
      .toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getAllByText("M4959").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).queryByText("496001")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("LIMIT TO RUN DATE")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(pairingService.getPairingDetails).not.toHaveBeenCalled();
    await selectPairingNumberInDialog(user, dialog, "V4146");
    expect(within(dialog).getAllByText("V4146").length).toBeGreaterThanOrEqual(1);
    const updateButton = within(dialog).getByRole("button", { name: "UPDATE BID" });

    await waitFor(() => expect(updateButton).not.toBeDisabled());
    await user.click(updateButton);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "existing-pairing-number",
        expect.objectContaining({
          propertyCode: 102,
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001", "414601"],
            pairingLabels: ["M4959", "V4146"],
          },
        }),
        customData.rightPanel.draftMeta,
      );
    });
    expect(await screen.findByText("Pairing property updated.")).toBeInTheDocument();
  });

  it("keeps the Pairing Preference configure dialog bounded when many pairings are selected", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);
    const selectedOccurrences = Array.from({ length: 25 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");

      return {
        occurrenceId: `4960${day}:2026-04-${day}`,
        originDate: `2026-04-${day}`,
        pairingId: `4960${day}`,
        pairingNumber: "M4959",
      };
    });

    customData.rightPanel.existingProperties.push({
      id: "existing-pairing-number-long-runs",
      propertyCode: 102,
      name: PAIRING_PREFERENCE_NAME,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-preference",
        pairingIds: selectedOccurrences.map((occurrence) => occurrence.pairingId),
        pairingLabels: selectedOccurrences.map((occurrence) => occurrence.pairingId),
      },
      tiers: buildTestTierOptions(["T1"]),
      priorityOptions: [],
      pairingNumber: "M4959",
      pairingType: "Regular",
      effectiveDateRange: { from: "2026-04-01", to: "2026-04-25" },
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", {
      name: `Edit existing pairing property ${PAIRING_PREFERENCE_NAME} 7`,
    }));
    const dialog = await screen.findByRole("dialog", { name: `Configure ${PAIRING_PREFERENCE_NAME}` });

    expect(within(dialog).getByText("496001")).toBeInTheDocument();
    expect(within(dialog).getByText("496025")).toBeInTheDocument();
    expect(within(dialog).queryByRole("switch", { name: "Pairing Preference limit to run date" }))
      .not.toBeInTheDocument();
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "UPDATE BID" })).toBeInTheDocument();
  });

  it("opens rule expressions in a dialog without replacing the property list", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "VIEW RULES" });

    await user.click(screen.getByRole("button", { name: "VIEW RULES" }));

    const rulesDialog = screen.getByRole("dialog", { name: "VIEW RULES" });

    expect(within(rulesDialog).getByTestId("pairing-rule-expression")).toBeInTheDocument();
    expect(within(rulesDialog).getAllByText("AND").length).toBeGreaterThan(0);
    expect(screen.getByTestId("pairing-property-row-existing-pairing-length")).toBeInTheDocument();

    await user.click(within(rulesDialog).getByRole("button", { name: "Close pairing rules" }));

    expect(screen.queryByRole("dialog", { name: "VIEW RULES" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VIEW RULES" })).toBeInTheDocument();
  });

  it("renders long Pairing Preference rules as a grouped readable summary", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);

    customData.rightPanel.existingProperties = [
      buildLongPairingNumberExistingProperty(),
      ...customData.rightPanel.existingProperties,
    ];
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "VIEW RULES" });
    await user.click(screen.getByRole("button", { name: "VIEW RULES" }));

    const ruleExpression = screen.getByTestId("pairing-rule-expression");
    const pairingNumberCondition = within(ruleExpression).getByLabelText(
      `Rule condition ${PAIRING_PREFERENCE_NAME}, Award · 25 selected`,
    );

    expect(pairingNumberCondition).toHaveTextContent(PAIRING_PREFERENCE_NAME);
    expect(pairingNumberCondition).toHaveTextContent("Award · 25 selected");
    expect(pairingNumberCondition).toHaveTextContent("E4101");
    expect(pairingNumberCondition).toHaveTextContent("Jun 05");
    expect(pairingNumberCondition).toHaveTextContent("E4103");
    expect(pairingNumberCondition).toHaveTextContent("Jun 08");
    expect(pairingNumberCondition).toHaveTextContent("Jun 10");
    expect(pairingNumberCondition).toHaveTextContent("+2 more");
    expect(pairingNumberCondition).toHaveTextContent("+9 more pairings");
    expect(pairingNumberCondition).not.toHaveTextContent("2026-06-05; E4103");
    expect(pairingNumberCondition).not.toHaveTextContent("E4203");

    await user.click(within(pairingNumberCondition).getByRole("button", { name: "Show all 25 selected" }));

    expect(pairingNumberCondition).toHaveTextContent("E4203");
    expect(pairingNumberCondition).toHaveTextContent("Jun 01");

    await user.click(within(pairingNumberCondition).getByRole("button", { name: "Show less" }));

    expect(pairingNumberCondition).not.toHaveTextContent("E4203");
  });

  it("shows AA forced OR exceptions in the rule expression view", async () => {
    const user = userEvent.setup();
    const customData = structuredClone(pairingPageData);
    const pairingLength = customData.rightPanel.existingProperties.find((property) => property.propertyCode === 131);
    const layoverTemplate = customData.rightPanel.availableProperties.find((property) => property.propertyCode === 150);

    if (!pairingLength || !layoverTemplate) {
      throw new Error("Expected pairing length and layover test fixtures.");
    }

    pairingLength.bid = { type: "stepper", value: 1, min: 1, max: 7 };
    pairingLength.tiers = pairingLength.tiers.map((tier) => ({
      ...tier,
      active: tier.label === "T1",
    }));
    customData.rightPanel.existingProperties = [
      pairingLength,
      {
        id: "existing-layover-city",
        propertyCode: layoverTemplate.propertyCode,
        name: layoverTemplate.name,
        action: layoverTemplate.action,
        quantifier: layoverTemplate.quantifier,
        bid: { type: "tag-list", values: ["LAX", "SAN"] },
        tiers: layoverTemplate.tiers.map((tier) => ({
          ...tier,
          active: tier.label === "T1",
        })),
        priorityOptions: [...pairingLength.priorityOptions],
        pairingNumber: layoverTemplate.pairingNumber,
        pairingType: layoverTemplate.pairingType,
        effectiveDateRange: { ...layoverTemplate.effectiveDateRange },
      },
    ];
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await user.click(await screen.findByRole("button", { name: "VIEW RULES" }));

    expect(screen.getByTestId("pairing-rule-expression")).toBeInTheDocument();
    expect(screen.getByText("OR")).toBeInTheDocument();
    expect(screen.getByText("Prefer Pairing Length: 1")).toBeInTheDocument();
    expect(screen.getByText("Layover at City: Any · LAX, SAN")).toBeInTheDocument();
  });

  it("paginates available properties in batches of ten", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    expect(screen.queryByText("Minimum Avg Credit per Duty")).not.toBeInTheDocument();

    await showAllPairingProperties(user);
    await user.click(screen.getByRole("button", { name: "Go to available properties page 2" }));

    expect(screen.getByText("Minimum Avg Credit per Duty")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bid for available Prefer Pairing Length on Date")).not.toBeInTheDocument();
  });

  it("configures any-every quantifiers for layover rules before add", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await goToAvailablePropertyPage(user, 150);
    expect(screen.getByText("Layover at City")).toBeInTheDocument();

    const addCallCountBeforeAdd = addPropertySpy.mock.calls.length;

    const dialog = await openPairingConfigDialog(user, "Layover at City");
    expect(within(dialog).getByText("QUANTIFIER")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Avoid" }));
    await user.click(within(dialog).getByRole("button", { name: "Every" }));
    await selectAirportOptionsInDialog(user, dialog, "BID Layover at City", ["YYZ"]);
    await selectPairingDialogTier(user, dialog, "Layover at City");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));
    expect(screen.getByLabelText("Bid for existing Layover at City")).toHaveTextContent("Avoid · Every · YYZ");
    await waitFor(() => {
      expect(addPropertySpy.mock.calls.length).toBeGreaterThan(addCallCountBeforeAdd);
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 150,
          action: "avoid",
          quantifier: "every",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
  });

  it("uses implicit any semantics for landing city rules", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await showAllPairingProperties(user);
    await user.click(screen.getByRole("button", { name: "Go to available properties page 3" }));
    expect(screen.getByText("Prefer Landing at City")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bid for available Prefer Landing at City")).not.toBeInTheDocument();

    const addCallCountBeforeAdd = addPropertySpy.mock.calls.length;

    const dialog = await openPairingConfigDialog(user, "Prefer Landing at City");
    expect(within(dialog).queryByText("QUANTIFIER")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Award" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("BID Prefer Landing at City")).toBeInTheDocument();
    expect(pairingService.getReferenceOptions).toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    await selectAirportOptionsInDialog(user, dialog, "BID Prefer Landing at City", ["YVR"]);
    await selectPairingDialogTier(user, dialog, "Prefer Landing at City");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));
    await waitFor(() => {
      expect(addPropertySpy.mock.calls.length).toBeGreaterThan(addCallCountBeforeAdd);
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 155,
          quantifier: "any",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(screen.getByLabelText("Bid for existing Prefer Landing at City")).toHaveTextContent("Any · YVR");
  });

  it("saves a configured favorite from the add dialog without adding it to existing bids", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");
    const saveFavoriteSpy = vi.spyOn(pairingService, "saveConfiguredFavoriteProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await showAllPairingProperties(user);
    await user.click(screen.getByRole("button", { name: "Go to available properties page 2" }));
    const dialog = await openPairingConfigDialog(user, "Maximum TAFB-Credit Ratio");
    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    await user.type(within(dialog).getByLabelText("BID Maximum TAFB-Credit Ratio"), "25.78");
    await selectPairingDialogBidOperator(user, dialog, "Maximum TAFB-Credit Ratio", "=");
    await selectPairingDialogTier(user, dialog, "Maximum TAFB-Credit Ratio");
    await user.click(within(dialog).getByRole("button", { name: "SAVE FAVORITE" }));

    await waitFor(() => {
      expect(saveFavoriteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 138,
          name: "Maximum TAFB-Credit Ratio",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(addPropertySpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ propertyCode: 138 }),
      expect.anything(),
    );
    expect(await screen.findByText("Favorite saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    await user.type(screen.getByPlaceholderText("Search Properties"), "Maximum TAFB");
    expect(await screen.findByRole("button", { name: "Delete favorite Maximum TAFB-Credit Ratio" })).toBeInTheDocument();
  });

  it("saves a configured Pairing Preference favorite from the single configure dialog", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");
    const saveFavoriteSpy = vi.spyOn(pairingService, "saveConfiguredFavoriteProperty");

    renderPairingPage();

    const dialog = await openPairingConfigDialog(user, PAIRING_PREFERENCE_NAME);
    const favoriteButton = within(dialog).getByRole("button", { name: "SAVE FAVORITE" });

    expect(favoriteButton).toBeDisabled();

    await selectPairingNumberInDialog(user, dialog);
    expect(favoriteButton).toBeEnabled();
    await user.click(favoriteButton);

    await waitFor(() => {
      expect(saveFavoriteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          name: PAIRING_PREFERENCE_NAME,
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001"],
            pairingLabels: ["M4959"],
          },
          pairingNumber: "M4959",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(addPropertySpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ propertyCode: 102 }),
      expect.anything(),
    );
    expect(await screen.findByText("Favorite saved.")).toBeInTheDocument();
  });

  it("adds a Pairing Preference favorite with the tiers selected on its card", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");
    const customData = structuredClone(pairingPageData);
    const catalogProperty = customData.rightPanel.availableProperties.find((property) => property.propertyCode === 102);

    if (!catalogProperty) {
      throw new Error("Expected the Pairing Preference catalog property.");
    }

    customData.rightPanel.availableProperties.push({
      ...catalogProperty,
      id: "favorite-pairing-preference-102",
      favoriteKey: "favorite-pairing-preference-102",
      propertyId: 102,
      source: "favorite",
      favorited: true,
      action: "avoid",
      bid: {
        type: "pairing-preference",
        pairingIds: ["496001"],
        pairingLabels: ["M4959"],
      },
      tiers: buildTestTierOptions([]),
      pairingNumber: "M4959",
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce(customData);

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    await user.type(screen.getByPlaceholderText("Search Properties"), PAIRING_PREFERENCE_NAME);
    await user.click(await screen.findByRole("button", {
      name: `Select T2 for favorite ${PAIRING_PREFERENCE_NAME}`,
    }));
    await user.click(await screen.findByRole("button", { name: `Add ${PAIRING_PREFERENCE_NAME}` }));

    expect(screen.queryByRole("dialog", { name: `Configure ${PAIRING_PREFERENCE_NAME}` })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "favorite-pairing-preference-102",
          source: "favorite",
          propertyCode: 102,
          action: "avoid",
          bid: {
            type: "pairing-preference",
            pairingIds: ["496001"],
            pairingLabels: ["M4959"],
          },
          tiers: expect.arrayContaining([expect.objectContaining({ label: "T2", active: true })]),
        }),
        customData.rightPanel.draftMeta,
      );
    });
  });

  it("adds a configured favorite directly from the favorited tab", async () => {
    const user = userEvent.setup();
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    await user.click(await screen.findByRole("button", {
      name: "Select T1 for favorite Report Between",
    }));
    await user.click(await screen.findByRole("button", { name: "Add Report Between" }));

    expect(screen.queryByRole("dialog", { name: "Configure Report Between" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(addPropertySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 134,
          source: "favorite",
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
  });

  it("edits a configured favorite without changing its selected Tx or existing bids", async () => {
    const user = userEvent.setup();
    const patchFavoriteSpy = vi.spyOn(pairingService, "patchFavoriteProperty");
    const addPropertySpy = vi.spyOn(pairingService, "addCurrentDraftProperty");

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    const favoriteT1 = await screen.findByRole("button", {
      name: "Select T1 for favorite Prefer Pairing Length",
    });
    await user.click(favoriteT1);
    await user.click(screen.getByRole("button", { name: "Edit favorite Prefer Pairing Length" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Pairing Length" });
    expect(within(dialog).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("LIMIT TO PAIRING START DATE")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    await user.click(within(dialog).getByRole("button", { name: "UPDATE FAVORITE" }));

    await waitFor(() => {
      expect(patchFavoriteSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          propertyCode: 131,
        }),
        expect.any(Object),
      );
    });
    expect(addPropertySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Configure Prefer Pairing Length" })).not.toBeInTheDocument();
    expect(favoriteT1).toHaveAttribute("aria-pressed", "true");
  });

  it("offers persistent recovery when a pairing favorite was deleted in another session", async () => {
    const user = userEvent.setup();
    const reloadedPageData = structuredClone(pairingPageData);
    reloadedPageData.rightPanel.availableProperties =
      reloadedPageData.rightPanel.availableProperties.filter((property) => property.source !== "favorite");
    vi.mocked(pairingService.getPageData)
      .mockResolvedValueOnce(structuredClone(pairingPageData))
      .mockResolvedValueOnce(reloadedPageData);
    vi.mocked(pairingService.patchFavoriteProperty).mockRejectedValueOnce({
      response: { status: 404, data: { message: "Favorite not found." } },
    });

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    await user.click(screen.getByRole("button", { name: "Edit favorite Prefer Pairing Length" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Pairing Length" });
    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    await user.click(within(dialog).getByRole("button", { name: "UPDATE FAVORITE" }));

    const recoveryAlert = await screen.findByRole("alert");
    expect(recoveryAlert).toHaveTextContent("This favorite no longer exists.");
    expect(screen.queryByRole("dialog", { name: "Configure Prefer Pairing Length" })).not.toBeInTheDocument();
    await user.click(within(recoveryAlert).getByRole("button", { name: "Reload draft" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Edit favorite Prefer Pairing Length" })).not.toBeInTheDocument();
    });
  });

  it("keeps favorite tier selections and offers draft reload after a 409 add conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(pairingService.addCurrentDraftProperty).mockRejectedValueOnce({
      response: { status: 409, data: { message: "Draft version conflict." } },
    });

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    const favoriteT1 = await screen.findByRole("button", {
      name: "Select T1 for favorite Report Between",
    });
    await user.click(favoriteT1);
    await user.click(screen.getByRole("button", { name: "Add Report Between" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This bid changed in another request.",
    );
    expect(screen.getByRole("button", { name: "Reload draft" })).toBeInTheDocument();
    expect(favoriteT1).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Pairing property added.")).not.toBeInTheDocument();
  });

  it("removes a configured favorite only after inline confirmation", async () => {
    const user = userEvent.setup();

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    await user.click(screen.getByRole("button", { name: "FAVORITED PROPERTIES" }));
    await user.click(await screen.findByRole("button", { name: "Delete favorite Prefer Pairing Length" }));

    expect(screen.getByText("Remove this favorite?")).toBeInTheDocument();
    expect(pairingService.unfavoriteProperty).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(pairingService.unfavoriteProperty).toHaveBeenCalledWith(
        "10131",
        expect.objectContaining({
          periodCode: pairingPageData.rightPanel.draftMeta.periodCode,
        }),
      );
    });
    expect(await screen.findByText("Favorite removed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete favorite Prefer Pairing Length" })).not.toBeInTheDocument();
  });

  it("keeps the configured favorite save disabled until the save completes", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.saveConfiguredFavoriteProperty).mockImplementationOnce(
      (property) =>
        new Promise((resolve) => {
          pendingSave.resolve = () => resolve({
            saved: true,
            favoriteKey: "10138-pending",
            propertyId: property.propertyId ?? property.propertyCode,
            propertyCode: property.propertyCode,
            name: property.name,
            action: property.action,
            quantifier: property.quantifier,
            bid: property.bid,
          });
        }),
    );

    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });
    await showAllPairingProperties(user);
    await user.click(screen.getByRole("button", { name: "Go to available properties page 2" }));

    const dialog = await openPairingConfigDialog(user, "Maximum TAFB-Credit Ratio");
    const favoriteButton = within(dialog).getByRole("button", { name: "SAVE FAVORITE" });
    const addBidButton = within(dialog).getByRole("button", { name: "ADD BID" });

    await user.click(within(dialog).getByRole("button", { name: "Award" }));
    await user.type(within(dialog).getByLabelText("BID Maximum TAFB-Credit Ratio"), "25.78");
    await selectPairingDialogBidOperator(user, dialog, "Maximum TAFB-Credit Ratio", "=");
    await selectPairingDialogTier(user, dialog, "Maximum TAFB-Credit Ratio");
    await user.click(favoriteButton);

    expect(favoriteButton).toBeDisabled();
    expect(addBidButton).toBeDisabled();

    if (!pendingSave.resolve) {
      throw new Error("Expected favorite save to be pending.");
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Configure Maximum TAFB-Credit Ratio" })).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Favorite saved.")).toBeInTheDocument();
  });

  it("keeps the add-properties footer pinned to the workspace bottom layout", async () => {
    renderPairingPage();

    await screen.findByRole("button", { name: "SEARCH PAIRINGS" });

    expect(screen.getByTestId("pairing-add-properties-workspace").className).toContain("flex-1");
    expect(screen.getByTestId("pairing-add-properties-footer").className).toContain("mt-auto");
  });

  it("shows an explicit loading shell before the pairing draft resolves", () => {
    vi.mocked(pairingService.getPageData).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    vi.mocked(biddingCalendarService.getCurrentCalendar).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    renderPairingPage();

    expect(screen.getByRole("status", { name: "Loading current pairing draft..." })).toBeInTheDocument();
    expect(screen.getByTestId("pairing-page-loading")).toBeInTheDocument();
  });

  it("loads the pairing page data only once in StrictMode", async () => {
    const getPageSpy = vi.spyOn(pairingService, "getPageData");
    const getCalendarSpy = vi.spyOn(biddingCalendarService, "getCurrentCalendar");

    renderPairingPage(true);

    expect(await screen.findByRole("button", { name: "SEARCH PAIRINGS" })).toBeInTheDocument();

    await waitFor(() => {
      expect(getPageSpy).toHaveBeenCalledTimes(1);
      expect(getCalendarSpy).toHaveBeenCalledTimes(1);
    });
  });
});
