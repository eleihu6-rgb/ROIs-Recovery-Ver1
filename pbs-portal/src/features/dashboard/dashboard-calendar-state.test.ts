import type { PbsBiddingCalendarEvent } from "../../../../packages/contracts/pbs-bidding-calendar.js";
import type { CalendarDraftResponse } from "@/features/dashboard/dashboard-calendar-state";
import {
  buildDayOffTiersByDate,
  buildPairingBlockedTiersByDate,
  buildPairingDayOffBlockedTiers,
  applyDatesToSelectedTiers,
  canSaveCalendarAction,
} from "@/features/dashboard/dashboard-calendar-state";

const buildDraft = (): CalendarDraftResponse => ({
  draft: {
    periodCode: "Apr 2026",
    draftVersion: 1,
    bidContext: "Current",
    tiers: [
      {
        tier: "T1",
        dates: ["2026-04-05"],
      },
    ],
  },
});

describe("dashboard calendar state helpers", () => {
  it("skips blocked day-off additions while keeping removable existing dates", () => {
    const blockedTiersByDate = new Map([
      ["2026-04-06", new Set(["T2"])],
    ]);
    const action = {
      type: "date" as const,
      isoDates: ["2026-04-05", "2026-04-06"],
      selectedTiers: ["T2"],
    };

    expect(applyDatesToSelectedTiers(
      buildDraft().draft.tiers,
      action.isoDates,
      action.selectedTiers,
      blockedTiersByDate,
    )).toEqual([
      {
        tier: "T2",
        dates: ["2026-04-05"],
      },
    ]);
    expect(canSaveCalendarAction(action, buildDraft(), blockedTiersByDate)).toBe(true);
  });

  it("derives pairing and day-off blocked tiers by covered date", () => {
    const events: PbsBiddingCalendarEvent[] = [
      {
        id: "pairing-bid-1",
        type: "pairing_bid",
        tier: "T2",
        label: "C4101",
        startDate: "2026-04-08",
        endDate: "2026-04-10",
        tone: "blue",
        source: "pbs_bid_group",
        readonly: true,
      },
      {
        id: "day-off-1",
        type: "prefer_off_bid",
        tier: "T3",
        label: "Off",
        startDate: "2026-04-09",
        endDate: "2026-04-09",
        tone: "green",
        source: "pbs_bid_group",
        readonly: false,
      },
    ];

    expect(buildPairingBlockedTiersByDate(events).get("2026-04-09")).toEqual(new Set(["T2"]));
    expect(
      buildPairingDayOffBlockedTiers(
        [
          {
            occurrenceId: "C4101:2026-04-08",
            pairingNumber: "C4101",
            pairingId: "410101",
            originDate: "2026-04-08",
            startDate: "2026-04-08",
            endDate: "2026-04-10",
            label: "C4101 · 2026-04-08",
          },
        ],
        ["C4101:2026-04-08"],
        buildDayOffTiersByDate(events),
      ),
    ).toEqual(new Set(["T3"]));
  });
});
