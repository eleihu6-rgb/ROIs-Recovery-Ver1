import { render, screen, within } from "@testing-library/react";
import { MonthGridCalendar } from "@/shared/components/calendar";

describe("MonthGridCalendar", () => {
  it("renders a full 6-week grid for months that span six calendar rows", () => {
    render(
      <MonthGridCalendar
        year={2026}
        month={8}
        entries={{
          "2026-08-01": { value: "12" },
          "2026-08-31": { value: "7", highlighted: true },
        }}
      />,
    );

    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(42);
    expect(screen.getByText("SUN")).toBeInTheDocument();
    expect(screen.getByText("SAT")).toBeInTheDocument();

    const firstCell = cells[0];
    expect(firstCell).toHaveAttribute("data-iso-date", "2026-07-26");
    expect(within(firstCell).getByText("JUL")).toBeInTheDocument();
    expect(within(firstCell).getByText("26")).toBeInTheDocument();

    const augustFirstCell = screen.getByRole("gridcell", { name: "2026-08-01" });
    expect(within(augustFirstCell).getByText("AUG")).toBeInTheDocument();
    expect(within(augustFirstCell).getByText("12")).toBeInTheDocument();

    const septemberFirstCell = screen.getByRole("gridcell", { name: "2026-09-01" });
    expect(within(septemberFirstCell).getByText("SEP")).toBeInTheDocument();
    expect(within(septemberFirstCell).getByText("01")).toBeInTheDocument();
  });

  it("marks selected, highlighted, and today dates independently", () => {
    render(
      <MonthGridCalendar
        year={2024}
        month={5}
        selectedDate="2024-05-10"
        todayDate="2024-05-15"
        entries={{
          "2024-05-10": { value: "5" },
          "2024-05-15": { value: "7", highlighted: true },
        }}
      />,
    );

    const selectedCell = screen.getByRole("gridcell", { name: "2024-05-10" });
    const highlightedCell = screen.getByRole("gridcell", { name: "2024-05-15" });

    expect(selectedCell).toHaveAttribute("data-selected", "true");
    expect(selectedCell).toHaveAttribute("data-highlighted", "false");
    expect(highlightedCell).toHaveAttribute("data-highlighted", "true");
    expect(highlightedCell).toHaveAttribute("data-today", "true");
    expect(within(highlightedCell).getByText("15")).toBeInTheDocument();
    expect(within(highlightedCell).getByText("7")).toBeInTheDocument();
  });
});
