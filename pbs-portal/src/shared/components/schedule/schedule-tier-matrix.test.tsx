import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleTierMatrix } from "@/shared/components/schedule";
import type { ScheduleTierRow } from "@/shared/components/schedule";

const rows: ScheduleTierRow[] = [
  { label: "T1", cells: ["blue", "green", "yellow"], active: true },
  { label: "T2", cells: ["empty", "blue", "empty"] },
];

describe("ScheduleTierMatrix", () => {
  it("renders day labels, row cells, and emits tier selection from side buttons", async () => {
    const user = userEvent.setup();
    const handleSelectTier = vi.fn();

    render(
      <ScheduleTierMatrix
        dayLabels={["01", "02", "03"]}
        rows={rows}
        activeTierLabel="T1"
        onSelectTier={handleSelectTier}
      />,
    );

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "T1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "T2" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("listitem", { name: /day/i })).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: "T2" }));
    expect(handleSelectTier).toHaveBeenCalledWith("T2");
    await user.click(screen.getByRole("button", { name: "T1" }));
    expect(handleSelectTier).toHaveBeenCalledWith("");
  });

  it("keeps every tier label aligned with its heatmap row", () => {
    render(
      <ScheduleTierMatrix
        dayLabels={["01", "02", "03"]}
        rows={rows}
        activeTierLabel="T2"
        onSelectTier={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /T[12]/ })).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Tier matrix rows" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "T1 heatmap" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "T2 heatmap" })).toBeInTheDocument();

    const dayLabelRow = screen.getByText("01").closest("ol");
    const firstHeatmapRow = screen.getByRole("button", { name: "T1" }).closest("li");

    expect(dayLabelRow).toHaveStyle({
      columnGap: "2px",
      gridTemplateColumns: "70px repeat(3, minmax(0, 1fr))",
    });
    expect(firstHeatmapRow).toHaveStyle({
      columnGap: "2px",
      gridTemplateColumns: "70px minmax(0, 1fr)",
    });
  });
});
