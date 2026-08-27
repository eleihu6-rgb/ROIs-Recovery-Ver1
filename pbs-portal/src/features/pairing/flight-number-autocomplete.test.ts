import { describe, expect, it, vi } from "vitest";
import { getFlightNumberAutocompleteConfig } from "@/features/pairing/flight-number-autocomplete";
import { pairingService } from "@/shared/services/pairing-service";

vi.mock("@/shared/services/pairing-service", () => ({
  pairingService: {
    searchFlightNumbers: vi.fn(),
  },
}));

describe("getFlightNumberAutocompleteConfig", () => {
  it("builds flight number autocomplete for Flight Number Preference", async () => {
    vi.mocked(pairingService.searchFlightNumbers).mockResolvedValue({
      query: "19",
      limit: 20,
      options: [
        {
          value: "1993",
          label: "1993",
        },
      ],
    });

    const config = getFlightNumberAutocompleteConfig(116);

    await expect(config?.search("19", { type: "recovery-charter-network" })).resolves.toEqual([
      {
        value: "1993",
        label: "1993",
      },
    ]);
    expect(config?.queryKey).toEqual(["pairing-search", "flight-numbers"]);
    expect(config?.allowCustomTokens).toBe(false);
    expect(pairingService.searchFlightNumbers).toHaveBeenCalledWith("19", 20, "recovery-charter-network");
  });

  it("does not attach flight number autocomplete to other properties", () => {
    expect(getFlightNumberAutocompleteConfig(115)).toBeUndefined();
  });
});
