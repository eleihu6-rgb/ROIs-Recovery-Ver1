import { describe, expect, it } from "vitest";
import { buildExistingPairingBidSummary } from "@/features/pairing/pairing-existing-bid-summary";
import type { PairingExistingProperty } from "@/features/pairing/types";

const buildProperty = (
  overrides: Partial<PairingExistingProperty>,
): PairingExistingProperty => ({
  id: "existing-pairing-number",
  propertyCode: 102,
  name: "Pairing Number",
  action: "award",
  quantifier: null,
  bid: {
    type: "pairing-occurrence-list",
    occurrences: [],
  },
  tiers: [{ key: "t1", label: "T1", active: true }],
  priorityOptions: [],
  pairingNumber: "",
  pairingType: "",
  effectiveDateRange: { from: "", to: "" },
  ...overrides,
});

describe("buildExistingPairingBidSummary", () => {
  it("groups pairing occurrence bids by pairing number with friendly dates", () => {
    const summary = buildExistingPairingBidSummary(buildProperty({
      bid: {
        type: "pairing-occurrence-list",
        occurrences: [
          {
            occurrenceId: "496001:2026-06-05",
            originDate: "2026-06-05",
            pairingId: "496001",
            pairingNumber: "E4101",
          },
          {
            occurrenceId: "496002:2026-06-10",
            originDate: "2026-06-10",
            pairingId: "496002",
            pairingNumber: "E4103",
          },
          {
            occurrenceId: "496003:2026-06-08",
            originDate: "2026-06-08",
            pairingId: "496003",
            pairingNumber: "E4103",
          },
        ],
      },
    }));

    expect(summary).toMatchObject({
      kind: "grouped-list",
      headline: "Award · Pairing Number · 3 selected",
      totalItemCount: 3,
    });

    if (summary.kind !== "grouped-list") {
      throw new Error("Expected grouped summary.");
    }

    expect(summary.groups).toEqual([
      {
        key: "E4101",
        label: "E4101",
        values: ["Jun 05"],
        rawValues: ["2026-06-05"],
      },
      {
        key: "E4103",
        label: "E4103",
        values: ["Jun 08", "Jun 10"],
        rawValues: ["2026-06-08", "2026-06-10"],
      },
    ]);
  });

  it("parses legacy pairing-id labels and preserves unmatched labels", () => {
    const summary = buildExistingPairingBidSummary(buildProperty({
      bid: {
        type: "pairing-id-list",
        pairingIds: ["10964", "11003", "raw-id"],
        pairingLabels: [
          "E4101 on 2026-06-05",
          "E4103 on 2026-06-08",
          "Legacy Pairing Label",
        ],
      },
    }));

    expect(summary.kind).toBe("grouped-list");

    if (summary.kind !== "grouped-list") {
      throw new Error("Expected grouped summary.");
    }

    expect(summary.headline).toBe("Award · Pairing Number · 3 selected");
    expect(summary.groups).toEqual([
      {
        key: "E4101",
        label: "E4101",
        values: ["Jun 05"],
        rawValues: ["2026-06-05"],
      },
      {
        key: "E4103",
        label: "E4103",
        values: ["Jun 08"],
        rawValues: ["2026-06-08"],
      },
      {
        key: "Legacy Pairing Label",
        label: "Legacy Pairing Label",
        values: [],
        rawValues: [],
      },
    ]);
  });

  it("keeps short bid summaries as text", () => {
    const summary = buildExistingPairingBidSummary(buildProperty({
      propertyCode: 105,
      name: "Pairing Total Credit",
      bid: { type: "duration", value: "08:00" },
    }));

    expect(summary).toEqual({
      kind: "text",
      value: "Award · 08:00",
      title: "Award · 08:00",
    });
  });

  it("uses natural Pairing Length summaries with consistent day grammar", () => {
    expect(buildExistingPairingBidSummary(buildProperty({
      propertyCode: 112,
      name: "Pairing Length",
      bid: {
        type: "pairing-length-preference",
        minDays: null,
        maxDays: 1,
        dateScope: null,
      },
    }))).toEqual({
      kind: "text",
      value: "Award pairings up to 1 day long",
      title: "Award pairings up to 1 day long",
    });

    expect(buildExistingPairingBidSummary(buildProperty({
      action: "avoid",
      propertyCode: 112,
      name: "Pairing Length",
      bid: {
        type: "pairing-length-preference",
        minDays: 2,
        maxDays: 4,
        dateScope: {
          mode: "specific_dates",
          dates: ["2026-07-02", "2026-07-05"],
        },
      },
    }))).toEqual({
      kind: "text",
      value: "Avoid pairings 2–4 days long starting on Jul 2, 2026 or Jul 5, 2026",
      title: "Avoid pairings 2–4 days long starting on Jul 2, 2026 or Jul 5, 2026",
    });
  });

  it("summarizes Pairing Preference with selected pairing labels only", () => {
    const summary = buildExistingPairingBidSummary(buildProperty({
      name: "Pairing Preference",
      bid: {
        type: "pairing-preference",
        pairingIds: ["496001", "496002"],
        pairingLabels: ["PR141", "PR142"],
      },
    }));

    expect(summary).toEqual({
      kind: "text",
      value: "Award pairings PR141 ×1, PR142 ×1",
      title: "Award pairings PR141 ×1, PR142 ×1",
    });
  });

  it("summarizes Work Day Preference weekday-only windows", () => {
    const summary = buildExistingPairingBidSummary(buildProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "THU", checkInFrom: null, checkInTo: null }],
        dateScope: null,
      },
    }));

    expect(summary).toEqual({
      kind: "text",
      value: "Award pairings checking in on Thursday",
      title: "Award pairings checking in on Thursday",
    });
  });

  it("collapses distinct Pairing IDs with the same label into one counted label", () => {
    const pairingIds = Array.from({ length: 13 }, (_, index) => String(98938 + index));
    const summary = buildExistingPairingBidSummary(buildProperty({
      name: "Pairing Preference",
      bid: {
        type: "pairing-preference",
        pairingIds,
        pairingLabels: pairingIds.map(() => "V4507"),
      },
    }));

    expect(summary).toEqual({
      kind: "text",
      value: "Award pairings V4507 ×13",
      title: "Award pairings V4507 ×13",
    });
    expect(summary.title).not.toContain(pairingIds[0]!);
  });
});
