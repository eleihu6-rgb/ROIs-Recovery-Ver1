import { render, screen } from "@testing-library/react";
import { DashboardLeftPanel } from "@/features/dashboard/components/dashboard-left-panel";
import type { DashboardUserPanelData } from "@/features/dashboard/types";

describe("DashboardLeftPanel", () => {
  it("renders bid period and user info without the removed bid metrics row", () => {
    const data: DashboardUserPanelData = {
      name: "Alex Crew",
      email: "alex.crew@example.com",
      bidInfoTitle: "BID INFORMATION-LOCAL TIME",
      bidInfoRows: [
        { label: "BID START", value: "Apr 01, 00:00" },
        { label: "BID END", value: "Apr 08, 23:59" },
        { label: "REMAINING", value: "6 DAYS 11 HRS 59 MINS", highlight: true },
      ],
      userInfoTitle: "USER INFORMATION",
      userInfoGrid: {
        headers: [
          ["BASE", "FLEET", "POSITION"],
          ["SENIORITY", "LANGUAGE", "EXISTING CREDIT"],
          ["TRAINING MONTH", "LAST LOGIN", ""],
        ],
        values: [
          ["YVR", "737\n7M8", "FA"],
          ["646", "EN 5\nFR", "75.5"],
          ["-", "Apr 01, 19:30", ""],
        ],
      },
    };

    render(<DashboardLeftPanel data={data} />);

    expect(screen.queryByText(/TARGETED LINE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TOTAL BIDDER/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TARGETED RESERVE/i)).not.toBeInTheDocument();
    expect(screen.getByText("EXISTING CREDIT")).toBeInTheDocument();
    expect(screen.getByText("TRAINING MONTH")).toBeInTheDocument();
    expect(screen.getByText("LAST LOGIN")).toBeInTheDocument();
    expect(screen.getByText(/737\s+7M8/)).toBeInTheDocument();
    expect(screen.getByText(/EN 5\s+FR/)).toBeInTheDocument();
    expect(screen.queryByText("STATUS")).not.toBeInTheDocument();
    expect(screen.queryByText("147")).not.toBeInTheDocument();
    expect(screen.getByText("Apr 01, 19:30")).toBeInTheDocument();
    expect(screen.queryByText("12:25")).not.toBeInTheDocument();
  });
});
