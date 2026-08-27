import { render, screen } from "@testing-library/react";
import { ReserveRightPanel } from "@/features/reserve/components/reserve-right-panel";
import { reserveCalendarData } from "@/features/reserve/mock";

describe("ReserveRightPanel", () => {
  it("renders the reference reserve heatmap block between the action button and month calendar", () => {
    render(<ReserveRightPanel data={reserveCalendarData} />);

    expect(screen.getByTestId("reserve-heatmap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TIER-01" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TIER-07" })).toBeInTheDocument();
    expect(screen.getAllByTestId("reserve-heatmap-row")).toHaveLength(reserveCalendarData.tierRows.length);
    expect(screen.queryByText("Bid 1")).not.toBeInTheDocument();
  });
});
