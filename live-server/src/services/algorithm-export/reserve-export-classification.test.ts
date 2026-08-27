import { describe, expect, it } from "vitest";

import { classifyReserveDateScope } from "./reserve-export-classification.js";

describe("classifyReserveDateScope", () => {
  it("maps whole-month and range-like scopes to standard LINE_RULES date scopes", () => {
    expect(classifyReserveDateScope({ mode: "whole_month" }, "2026-06-01", "2026-06-30")).toEqual({
      target: "line_rules",
      dateScope: { mode: "whole_month" },
    });
    expect(classifyReserveDateScope({
      mode: "date_range",
      from: "2026-06-03",
      to: "2026-06-18",
    }, "2026-06-01", "2026-06-30")).toEqual({
      target: "line_rules",
      dateScope: {
        mode: "date_range",
        start: "2026-06-03",
        end: "2026-06-18",
      },
    });
    expect(classifyReserveDateScope({ mode: "first_half" }, "2026-06-01", "2026-06-30")).toEqual({
      target: "line_rules",
      dateScope: {
        mode: "date_range",
        start: "2026-06-01",
        end: "2026-06-15",
      },
    });
    expect(classifyReserveDateScope({ mode: "second_half" }, "2028-02-01", "2028-02-29")).toEqual({
      target: "line_rules",
      dateScope: {
        mode: "date_range",
        start: "2028-02-16",
        end: "2028-02-29",
      },
    });
  });

  it("routes specific dates exclusively to RESERVE_SCORE", () => {
    expect(classifyReserveDateScope({
      mode: "specific_dates",
      dates: ["2026-06-03"],
    }, "2026-06-01", "2026-06-30")).toEqual({ target: "reserve_score" });
  });

  it("rejects invalid periods and date ranges instead of silently exporting bad data", () => {
    expect(() => classifyReserveDateScope({ mode: "whole_month" }, "bad-period", "2026-06-30"))
      .toThrow("Invalid roster period range");
    expect(() => classifyReserveDateScope({
      mode: "date_range",
      from: "2026-06-18",
      to: "2026-06-03",
    }, "2026-06-01", "2026-06-30")).toThrow("Invalid reserve date range");
  });
});
