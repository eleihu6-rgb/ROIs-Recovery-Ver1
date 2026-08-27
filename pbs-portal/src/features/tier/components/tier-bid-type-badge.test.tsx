import { render, screen } from "@testing-library/react";
import { TierBidTypeBadge } from "@/features/tier/components/tier-bid-type-badge";

describe("TierBidTypeBadge", () => {
  it("displays the internal Line bid type as Roster", () => {
    render(<TierBidTypeBadge bidType="Line" />);

    expect(screen.getByText("Roster", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Line", { exact: true })).not.toBeInTheDocument();
  });
});
