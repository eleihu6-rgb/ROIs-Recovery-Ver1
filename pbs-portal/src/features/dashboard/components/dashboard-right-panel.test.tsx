import { render, screen } from "@testing-library/react";
import { DashboardRightPanel } from "@/features/dashboard/components/dashboard-right-panel";

describe("DashboardRightPanel", () => {
  it("renders pre-assigned duties as a focused message center summary", () => {
    render(<DashboardRightPanel data={{
      title: "MESSAGE CENTER",
      baseLineAverage: "-",
      preAssignments: {
        totalDuties: 8,
        daysTouched: 8,
        categories: [
          { code: "PAIRING", label: "Pairing", count: 6 },
          { code: "DAYS_OFF", label: "Days Off", count: 1 },
          { code: "UNAVAILABLE", label: "Unavailable", count: 1 },
        ],
        details: [
          {
            id: "pairing:9001",
            type: "pairing",
            code: "PAIRING",
            label: "T4501",
            dateText: "Feb 05",
            timeText: "06:00-15:00",
          },
          {
            id: "ground:do",
            type: "ground",
            code: "DO",
            label: "Days Off",
            dateText: "Feb 10",
            timeText: "00:00-23:59",
          },
          {
            id: "ground:vac",
            type: "ground",
            code: "VAC",
            label: "Unavailable",
            dateText: "Feb 10",
            timeText: null,
          },
          {
            id: "pairing:9002",
            type: "pairing",
            code: "PAIRING",
            label: "T4502",
            dateText: "Feb 11",
            timeText: "07:00-16:00",
          },
          {
            id: "pairing:9003",
            type: "pairing",
            code: "PAIRING",
            label: "T4503",
            dateText: "Feb 12",
            timeText: "08:00-17:00",
          },
          {
            id: "pairing:9004",
            type: "pairing",
            code: "PAIRING",
            label: "T4504",
            dateText: "Feb 13",
            timeText: "09:00-18:00",
          },
          {
            id: "pairing:9005",
            type: "pairing",
            code: "PAIRING",
            label: "T4505",
            dateText: "Feb 14",
            timeText: "10:00-19:00",
          },
          {
            id: "pairing:9006",
            type: "pairing",
            code: "PAIRING",
            label: "T4506",
            dateText: "Feb 15",
            timeText: "11:00-20:00",
          },
        ],
      },
      items: [{ fleet: "737", subFleet: "-", pairingCount: 24 }],
    }} />);

    expect(screen.getByText("MESSAGE CENTER")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pre-assigned Duties" })).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("8 days")).toBeInTheDocument();
    expect(screen.getAllByText("Pairing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Days Off").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pairing")[0]).toHaveClass("border-[#4FCFED]");
    expect(screen.getAllByText("Pairing")[0]).toHaveClass("bg-[#4FCFED]");
    expect(screen.getAllByText("Pairing")[0]).toHaveClass("text-white");
    expect(screen.getAllByText("Days Off")[0]).toHaveClass("border-[#3DC0A9]");
    expect(screen.getAllByText("Days Off")[0]).toHaveClass("bg-[#3DC0A9]");
    expect(screen.getAllByText("Days Off")[0]).toHaveClass("text-white");
    expect(screen.getAllByText("Unavailable")[0]).toHaveClass("border-[#F5B507]");
    expect(screen.getAllByText("Unavailable")[0]).toHaveClass("bg-[#F5B507]");
    expect(screen.getAllByText("Unavailable")[0]).toHaveClass("text-white");
    expect(screen.getAllByText("Days off")[0]).toHaveClass("border-[#3DC0A9]");
    expect(screen.getAllByText("Days off")[0]).toHaveClass("bg-[#3DC0A9]");
    expect(screen.getAllByText("Days off")[0]).toHaveClass("text-white");
    expect(screen.getByText("T4501")).toBeInTheDocument();
    expect(screen.getByText("Feb 05")).toBeInTheDocument();
    expect(screen.getByText("06:00-15:00")).toBeInTheDocument();
    expect(screen.getByText("Full day")).toBeInTheDocument();
    expect(screen.getByText("Duty Details")).toBeInTheDocument();
    expect(screen.getByText("T4506")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pre-assigned duty details" })).toHaveClass("max-h-96");
    expect(screen.getByRole("list", { name: "Pre-assigned duty details" })).toHaveClass("overflow-y-auto");
    expect(screen.queryByText("Bid Package")).not.toBeInTheDocument();
    expect(screen.queryByText("All sub-fleets")).not.toBeInTheDocument();
    expect(screen.queryByText("24 pairings")).not.toBeInTheDocument();
    expect(screen.queryByText("BASE LINE AVERAGE: -")).not.toBeInTheDocument();
    expect(screen.queryByText("78:16")).not.toBeInTheDocument();
  });

  it("renders a useful empty state when no pre-assigned duties exist", () => {
    render(<DashboardRightPanel data={{
      title: "MESSAGE CENTER",
      baseLineAverage: "-",
      preAssignments: {
        totalDuties: 0,
        daysTouched: 0,
        categories: [],
        details: [],
      },
      items: [],
    }} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("0 days")).toBeInTheDocument();
    expect(screen.getByText("No pre-assigned duties for this period.")).toBeInTheDocument();
    expect(screen.queryByText("No bid package information available.")).not.toBeInTheDocument();
    expect(screen.queryByText("78:16")).not.toBeInTheDocument();
  });
});
