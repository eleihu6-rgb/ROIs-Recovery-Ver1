import { render, screen } from "@testing-library/react";
import { AwardMiniCalendar } from "@/shared/components/calendar";

describe("AwardMiniCalendar", () => {
  it("renders a full 6-week grid when the month spans six calendar rows", () => {
    render(<AwardMiniCalendar month={8} year={2026} highlightedDays={[31]} />);

    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
    expect(screen.getByRole("gridcell", { name: "Day 31 highlighted" })).toBeInTheDocument();
  });
});
