import { render, screen } from "@testing-library/react";

import { TierSelectionTitle } from "@/shared/components/tiers";

describe("TierSelectionTitle", () => {
  it("marks required tier selection without changing after selection state changes", () => {
    const { rerender } = render(<TierSelectionTitle required />);

    expect(screen.getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");

    rerender(<TierSelectionTitle required />);

    expect(screen.getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
  });

  it("omits the required marker for optional tier selection", () => {
    render(<TierSelectionTitle />);

    expect(screen.getByText("APPLY TO TIERS")).toBeInTheDocument();
    expect(screen.queryByText("REQUIRED")).not.toBeInTheDocument();
  });

  it("renders a real legend for fieldset labels", () => {
    render(
      <fieldset>
        <TierSelectionTitle as="legend" required />
      </fieldset>,
    );

    expect(screen.getByText("APPLY TO TIERS").tagName).toBe("LEGEND");
  });
});
