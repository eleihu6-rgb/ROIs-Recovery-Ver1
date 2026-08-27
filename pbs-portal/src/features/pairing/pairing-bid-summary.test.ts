import { describe, expect, it } from "vitest";

import { formatPairingBidValue } from "@/features/pairing/pairing-bid-summary";

describe("formatPairingBidValue", () => {
  it("formats Work Day Preference optional check-in windows", () => {
    expect(formatPairingBidValue({
      type: "work-day-preference",
      days: [
        { dayOfWeek: "MON", checkInFrom: null, checkInTo: null },
        { dayOfWeek: "WED", checkInFrom: "06:00", checkInTo: null },
        { dayOfWeek: "FRI", checkInFrom: null, checkInTo: "10:00" },
        { dayOfWeek: "SUN", checkInFrom: "12:00", checkInTo: "16:00" },
      ],
      dateScope: null,
    })).toBe("Mon · Wed after 06:00 · Fri before 10:00 · Sun 12:00-16:00");
  });
});
