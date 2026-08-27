import type { ScheduleCalendarEvent } from "@/shared/components/schedule/types";
import {
  buildPairingDetailRows,
  buildPairingDetailTargets,
  formatPairingNumbersForLabel,
  loadPairingDetailResults,
} from "@/features/dashboard/pairing-calendar-detail";
import { pairingService } from "@/shared/services/pairing-service";

const buildPairingEvent = (): ScheduleCalendarEvent => ({
  row: 2,
  colStart: 4,
  colSpan: 3,
  top: 24,
  label: "C4101 +1",
  tone: "blue",
  sourceEvent: {
    id: "pairing-bid-merged",
    type: "pairing_bid",
    tier: "T2",
    label: "C4101 +1",
    startDate: "2026-04-08",
    endDate: "2026-04-10",
    readonly: true,
    metadata: {
      occurrenceMode: "specific_date",
      pairingNumbers: "C4101,C4102",
      pairingBidEntries: [
        "group-1|C4101|410101|2026-04-08|2026-04-08|2026-04-10",
        "group-2|C4102|410201|2026-04-08|2026-04-08|2026-04-08",
      ].join("; "),
    },
  },
});

describe("pairing calendar detail helpers", () => {
  it("builds detail targets from merged pairing bid entries", () => {
    expect(buildPairingDetailTargets(buildPairingEvent())).toEqual([
      {
        pairingId: "410101",
        pairingNumber: "C4101",
        originDate: "2026-04-08",
      },
      {
        pairingId: "410201",
        pairingNumber: "C4102",
        originDate: "2026-04-08",
      },
    ]);
  });

  it("renders compact rows from pairing bid entries without table-only assumptions", () => {
    expect(buildPairingDetailRows(buildPairingEvent())).toEqual([
      {
        rowKey: "group-1:C4101:2026-04-08:2026-04-08:2026-04-10:0",
        propertyGroupKey: "group-1",
        pairingNumber: "C4101",
        internalId: "410101",
        tier: "T2",
        originDate: "20260408",
        startDate: "20260408",
        endDate: "20260410",
        mode: "Specific Date",
      },
      {
        rowKey: "group-2:C4102:2026-04-08:2026-04-08:2026-04-08:1",
        propertyGroupKey: "group-2",
        pairingNumber: "C4102",
        internalId: "410201",
        tier: "T2",
        originDate: "20260408",
        startDate: "20260408",
        endDate: "20260408",
        mode: "Specific Date",
      },
    ]);
    expect(formatPairingNumbersForLabel(buildPairingEvent())).toBe("C4101, C4102");
  });

  it("loads pairing details through the dedicated detail endpoint", async () => {
    const getPairingDetailsSpy = vi.spyOn(pairingService, "getPairingDetails").mockResolvedValue({
      results: [
        {
          id: "410101",
          pairingId: "410101",
          pairingNumber: "C4101",
          base: "YYZ",
          originDate: "2026-04-08",
          endDate: "2026-04-09",
          endDateLabel: "Apr 9, 2026",
          reportTime: "0630",
          releaseTime: "1545",
          durationDays: 2,
          routeLabel: "YYZ-YVR",
          priorityLabel: "P3",
          prioritySequence: "02",
          totalBlock: "0550",
          totalCredit: "550",
          totalPay: "550",
          activeDates: ["2026-04-08"],
          legs: [],
        },
      ],
    });
    const previewCriteriaSpy = vi.spyOn(pairingService, "previewCriteria");
    const period = { rosterPeriodId: 4, periodCode: "Apr 2026" };
    const results = await loadPairingDetailResults(buildPairingDetailTargets(buildPairingEvent()), period);

    expect(getPairingDetailsSpy).toHaveBeenCalledWith(period, [
      {
        pairingId: "410101",
        originDate: "2026-04-08",
      },
      {
        pairingId: "410201",
        originDate: "2026-04-08",
      },
    ]);
    expect(previewCriteriaSpy).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});
