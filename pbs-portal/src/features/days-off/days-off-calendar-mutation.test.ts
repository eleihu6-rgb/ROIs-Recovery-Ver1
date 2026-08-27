vi.mock("@/shared/services/days-off-service", () => ({
  daysOffService: {
    addCurrentDraftProperty: vi.fn(),
    patchCurrentDraftProperty: vi.fn(),
    removeCurrentDraftProperty: vi.fn(),
  },
}));

import { buildCalendarDraftFromDaysOffPageData } from "@/features/days-off/days-off-calendar-prefer-off";
import { saveDaysOffCalendarAction } from "@/features/days-off/days-off-calendar-mutation";
import type { RuleBidExistingProperty, RuleBidPageData, RuleBidRightPanelData } from "@/features/rule-bids/types";
import { daysOffService } from "@/shared/services/days-off-service";

const LINEHOLDER_TIER_KEYS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

const draftMeta: RuleBidRightPanelData["draftMeta"] = {
  draftKey: "2",
  bidId: 2,
  periodId: 9,
  periodCode: "Apr 2026",
  draftVersion: 1,
  bidContext: "Current",
  remarks: "",
};

const buildTierOptions = (activeTiers: string[]) =>
  LINEHOLDER_TIER_KEYS.map((tier) => ({
    key: tier.toLowerCase(),
    label: tier,
    active: activeTiers.includes(tier),
  }));

const buildPreferOffProperty = (
  id: string,
  values: string[],
  activeTiers: string[],
): RuleBidExistingProperty => ({
  id,
  propertyCode: 201,
  name: "Prefer Off",
  bid: {
    type: "tag-list",
    values,
    suggestions: [],
  },
  tiers: buildTierOptions(activeTiers),
  allOrNothing: false,
  minimumN: null,
});

const buildPageData = (existingProperties: RuleBidExistingProperty[]): RuleBidPageData => ({
  rightPanel: {
    draftMeta,
    existingTitle: "EXISTING DAYS OFF PROPERTIES",
    addButtonLabel: "ADD BID",
    addSectionTitle: "ADD DAYS OFF PROPERTIES",
    allPropertiesLabel: "ALL PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED PROPERTIES",
    searchPlaceholder: "Search Properties",
    existingProperties,
    availableProperties: [],
  },
});

describe("saveDaysOffCalendarAction", () => {
  beforeEach(() => {
    vi.mocked(daysOffService.addCurrentDraftProperty).mockResolvedValue({
      saved: true,
      propertyGroupKey: "prefer-off-new",
      rowSeq: 2,
      draftVersion: 2,
    });
    vi.mocked(daysOffService.patchCurrentDraftProperty).mockResolvedValue({
      saved: true,
      propertyGroupKey: "prefer-off-1",
      draftVersion: 2,
      tiers: ["T1", "T2"],
    });
    vi.mocked(daysOffService.removeCurrentDraftProperty).mockResolvedValue({
      saved: true,
      draftVersion: 2,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips service calls when the calendar-managed Prefer Off property is unchanged", async () => {
    const pageData = buildPageData([
      buildPreferOffProperty("prefer-off-1", ["2026-04-05"], ["T1"]),
    ]);

    const result = await saveDaysOffCalendarAction({
      pageData,
      currentDraft: buildCalendarDraftFromDaysOffPageData(pageData),
      blockedTiersByDate: new Map(),
      action: {
        type: "date",
        isoDates: ["2026-04-05"],
        selectedTiers: ["T1"],
      },
    });

    expect(daysOffService.addCurrentDraftProperty).not.toHaveBeenCalled();
    expect(daysOffService.patchCurrentDraftProperty).not.toHaveBeenCalled();
    expect(daysOffService.removeCurrentDraftProperty).not.toHaveBeenCalled();
    expect(result.patchedPageData.rightPanel.existingProperties).toHaveLength(1);
  });

  it("patches an existing calendar-managed Prefer Off property with lightweight tier/date changes", async () => {
    const pageData = buildPageData([
      buildPreferOffProperty("prefer-off-1", ["2026-04-05"], ["T1"]),
    ]);

    const result = await saveDaysOffCalendarAction({
      pageData,
      currentDraft: buildCalendarDraftFromDaysOffPageData(pageData),
      blockedTiersByDate: new Map(),
      action: {
        type: "date",
        isoDates: ["2026-04-05"],
        selectedTiers: ["T1", "T2"],
      },
    });

    expect(daysOffService.patchCurrentDraftProperty).toHaveBeenCalledTimes(1);
    expect(daysOffService.patchCurrentDraftProperty).toHaveBeenCalledWith(
      "prefer-off-1",
      expect.objectContaining({
        id: "prefer-off-1",
        propertyCode: 201,
        allOrNothing: true,
        minimumN: null,
        maximumN: null,
        bid: {
          type: "tag-list",
          values: ["2026-04-05"],
          suggestions: [],
        },
      }),
      expect.objectContaining({ draftVersion: 1 }),
    );
    expect(result.patchedDraft.draft.draftVersion).toBe(2);
    expect(result.patchedDraft.draft.tiers).toEqual([
      { tier: "T1", dates: ["2026-04-05"] },
      { tier: "T2", dates: ["2026-04-05"] },
    ]);
  });

  it("removes extra calendar-managed Prefer Off properties when the target grouping shrinks", async () => {
    const pageData = buildPageData([
      buildPreferOffProperty("prefer-off-1", ["2026-04-05"], ["T1"]),
      buildPreferOffProperty("prefer-off-2", ["2026-04-06"], ["T2"]),
    ]);

    const result = await saveDaysOffCalendarAction({
      pageData,
      currentDraft: buildCalendarDraftFromDaysOffPageData(pageData),
      blockedTiersByDate: new Map(),
      action: {
        type: "date",
        isoDates: ["2026-04-06"],
        selectedTiers: [],
      },
    });

    expect(daysOffService.patchCurrentDraftProperty).not.toHaveBeenCalled();
    expect(daysOffService.removeCurrentDraftProperty).toHaveBeenCalledWith(
      "prefer-off-2",
      expect.objectContaining({ draftVersion: 1 }),
    );
    expect(result.patchedPageData.rightPanel.existingProperties.map((property) => property.id)).toEqual([
      "prefer-off-1",
    ]);
  });
});
