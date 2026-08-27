import { buildPairingReferenceAutocompleteConfig } from "@/features/pairing/pairing-reference-autocomplete";

const labels = {
  placeholder: "Type airport or city code",
  emptyLabel: "No matching airport or city",
  errorLabel: "Unable to load airport and city options",
  loadingLabel: "Loading airport and city options...",
};

describe("pairing reference autocomplete", () => {
  it("builds airport autocomplete options from loaded reference data", async () => {
    const config = buildPairingReferenceAutocompleteConfig({
      propertyCode: 101,
      options: {
        airports: [
          { code: "DFW", name: "DALLAS-FORT WORTH INTL", icao: null, abbr: null, city: "DFW" },
          { code: "LAX", name: "LOS ANGELES INTL", icao: null, abbr: null, city: "LAX" },
        ],
        cities: [{ code: "DFW" }, { code: "LAX" }],
      },
      ...labels,
    });

    await expect(config?.search("dal")).resolves.toEqual([
      { value: "DFW", label: "DALLAS-FORT WORTH INTL · DFW" },
    ]);
  });

  it("builds city autocomplete options only for city properties", async () => {
    const config = buildPairingReferenceAutocompleteConfig({
      propertyCode: 150,
      options: {
        airports: [{ code: "DFW", name: "DALLAS-FORT WORTH INTL", icao: null, abbr: null, city: "DFW" }],
        cities: [{ code: "DFW" }, { code: "YTO" }],
      },
      ...labels,
    });

    await expect(config?.search("yt")).resolves.toEqual([
      { value: "YTO", label: "YTO" },
    ]);
  });

  it("does not attach reference autocomplete to unrelated properties", () => {
    expect(buildPairingReferenceAutocompleteConfig({
      propertyCode: 131,
      options: { airports: [], cities: [] },
      ...labels,
    })).toBeUndefined();
  });
});
