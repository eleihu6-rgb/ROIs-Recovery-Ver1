import { describe, expect, it } from "vitest";
import {
  buildPairingPreferencePickerFilters,
  buildPairingPreferencePeriodBounds,
  countActivePairingPreferencePickerFilters,
  EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
  validatePairingPreferencePickerFilters,
} from "@/features/pairing/components/pairing-preference-picker-filters";

describe("pairing preference picker filters", () => {
  it("maps valid date, time, days, station, layover, credit, and attribute filters", () => {
    const draft = {
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      originDateFrom: "2026-07-01",
      originDateTo: "2026-07-31",
      checkInFrom: "03:30",
      checkInTo: "08:15",
      checkOutFrom: "14:00",
      checkOutTo: "22:30",
      daysMin: "2",
      daysMax: "4",
      routeStations: [" yvr ", "YYZ"],
      layoverStations: ["yhz"],
      layoverCountMin: "0",
      layoverCountMax: "2",
      creditMin: "04:30",
      creditMax: "12:15",
      hasRedeye: true,
      hasDeadhead: true,
    };

    expect(validatePairingPreferencePickerFilters(draft)).toBe("");
    expect(buildPairingPreferencePickerFilters(draft)).toEqual({
      originDateFrom: "2026-07-01",
      originDateTo: "2026-07-31",
      timeFrom: "03:30",
      timeTo: "08:15",
      releaseTimeFrom: "14:00",
      releaseTimeTo: "22:30",
      durationDaysMin: 2,
      durationDaysMax: 4,
      airports: ["YVR", "YYZ"],
      layoverAirports: ["YHZ"],
      layoverCountMin: 0,
      layoverCountMax: 2,
      creditMinutesMin: 270,
      creditMinutesMax: 735,
      hasRedeye: true,
      hasDeadhead: true,
    });
  });

  it("rejects malformed or reversed ranges before sending a request", () => {
    expect(validatePairingPreferencePickerFilters({
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      checkInFrom: "25:00",
    })).toBe("Check-in and check-out times must use HH:MM.");

    expect(validatePairingPreferencePickerFilters({
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      daysMin: "4",
      daysMax: "2",
    })).toBe("Pairing days Min cannot exceed Max.");

    expect(validatePairingPreferencePickerFilters({
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      layoverCountMin: "3",
      layoverCountMax: "1",
    })).toBe("Layover count Min cannot exceed Max.");

    expect(validatePairingPreferencePickerFilters({
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      creditMin: "12:30",
      creditMax: "04:15",
    })).toBe("Credit Min cannot exceed Max.");
  });

  it("preserves an overnight check-in range", () => {
    const draft = {
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      checkInFrom: "22:00",
      checkInTo: "08:00",
    };

    expect(validatePairingPreferencePickerFilters(draft)).toBe("");
    expect(buildPairingPreferencePickerFilters(draft)).toMatchObject({
      timeFrom: "22:00",
      timeTo: "08:00",
    });
  });

  it("builds the bid-period date bounds and rejects dates outside them", () => {
    const bounds = buildPairingPreferencePeriodBounds("Jun 2026");

    expect(bounds).toEqual({ min: "2026-06-01", max: "2026-06-30" });
    expect(validatePairingPreferencePickerFilters({
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      originDateFrom: "2026-05-31",
    }, bounds)).toBe("Pairing start dates must stay within the current bid period.");
    expect(buildPairingPreferencePeriodBounds("Feb 2028")).toEqual({
      min: "2028-02-01",
      max: "2028-02-29",
    });
  });

  it("counts active filter dimensions", () => {
    expect(countActivePairingPreferencePickerFilters({
      ...EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT,
      originDateFrom: "2026-06-01",
      checkInFrom: "22:00",
      checkOutTo: "08:00",
      daysMin: "2",
      routeStations: ["YVR"],
      layoverStations: ["YHZ"],
      layoverCountMax: "0",
      creditMin: "04:30",
      hasRedeye: true,
      hasDeadhead: true,
    })).toBe(10);
  });
});
