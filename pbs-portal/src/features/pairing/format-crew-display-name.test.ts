import { describe, expect, it } from "vitest";
import { formatCrewDisplayName } from "@/features/pairing/format-crew-display-name";

describe("formatCrewDisplayName", () => {
  it("inserts spaces into concatenated PascalCase names", () => {
    expect(formatCrewDisplayName("ZacharyAndrewCreighton")).toBe("Zachary Andrew Creighton");
    expect(formatCrewDisplayName("WingNamJennaChan")).toBe("Wing Nam Jenna Chan");
    expect(formatCrewDisplayName("Wing NamJennaChan")).toBe("Wing Nam Jenna Chan");
  });

  it("leaves names that already contain spaces unchanged", () => {
    expect(formatCrewDisplayName("Diana Crew")).toBe("Diana Crew");
    expect(formatCrewDisplayName("Carolyn Susan Ann Alves")).toBe("Carolyn Susan Ann Alves");
  });
});
