import { describe, expect, it, vi } from "vitest";
import { getCrewIdAutocompleteConfig } from "@/features/pairing/crew-id-autocomplete";
import { pairingService } from "@/shared/services/pairing-service";

vi.mock("@/shared/services/pairing-service", () => ({
  pairingService: {
    searchCrewIds: vi.fn(),
  },
}));

describe("getCrewIdAutocompleteConfig", () => {
  it("builds crew id autocomplete for Any/Every Leg With Employee Number", async () => {
    vi.mocked(pairingService.searchCrewIds).mockResolvedValue({
      query: "PET",
      limit: 20,
      options: [
        {
          value: "5510",
          label: "5510 - Peter Adams",
          crewId: "5510",
          firstName: "Peter",
          lastName: "Adams",
        },
      ],
    });

    const config = getCrewIdAutocompleteConfig(115);

    await expect(config?.search("pet")).resolves.toEqual([
      {
        value: "5510",
        label: "5510 - Peter Adams",
        crewId: "5510",
        firstName: "Peter",
        lastName: "Adams",
      },
    ]);
    expect(config?.queryKey).toEqual(["pairing-search", "crew-ids"]);
    expect(pairingService.searchCrewIds).toHaveBeenCalledWith("pet", 20);
  });

  it("does not attach crew autocomplete to other properties", () => {
    expect(getCrewIdAutocompleteConfig(116)).toBeUndefined();
  });
});
