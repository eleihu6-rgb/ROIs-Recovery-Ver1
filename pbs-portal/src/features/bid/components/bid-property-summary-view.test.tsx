import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BidPropertySummaryView } from "@/features/bid/components/bid-property-summary-view";
import { buildBidPropertySummary } from "@/features/bid/bid-property-summary";

describe("BidPropertySummaryView", () => {
  it("shows three values by default and expands all selected values without bubbling", () => {
    const summary = buildBidPropertySummary("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: Array.from(
          { length: 15 },
          (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`,
        ),
      },
    });

    render(
      <BidPropertySummaryView
        ariaLabel="Prefer Off bid summary"
        summary={summary}
      />,
    );

    expect(screen.getByText("Prefer off on 15 selected dates")).toBeInTheDocument();
    expect(screen.getByText(/Jul 1, 2026, Jul 2, 2026, Jul 3, 2026/)).toBeInTheDocument();
    expect(screen.getByText(", +12 more")).toBeInTheDocument();
    expect(screen.queryByText(/Jul 15, 2026/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all 15 selected" }));

    expect(screen.getByText(/Jul 15, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));

    expect(screen.queryByText(/Jul 15, 2026/)).not.toBeInTheDocument();
  });
});
