import { buildDashboardUserPanelData } from "@/features/dashboard/dashboard-user-panel-profile";

describe("buildDashboardUserPanelData", () => {
  it("maps stable dashboard profile fields without mock user information", () => {
    const data = buildDashboardUserPanelData({
      sessionUser: { id: "u-1", name: "Session Crew", employeeNo: "F8001" },
      profile: {
        id: "1",
        employeeNo: "F8001",
        name: "Alex Crew",
        email: "alex.crew@example.com",
        base: "YVR",
        rank: "FA",
        division: "C",
        fleet: null,
        languages: null,
        seniorityLabel: null,
        statusLabel: null,
        existingCreditLabel: null,
        trainingMonthLabel: null,
        lastLoginLabel: null,
      },
    });

    expect(data.name).toBe("Alex Crew");
    expect(data.email).toBe("alex.crew@example.com");
    expect(data.userInfoGrid.headers.flat()).not.toContain("STATUS");
    expect(data.userInfoGrid.values).toEqual([
      ["YVR", "-", "FA"],
      ["-", "-", "-"],
      ["-", "-", ""],
    ]);
    expect(data.userInfoGrid.values.flat()).not.toContain("LAX");
  });

  it("uses session name and dash fallbacks while profile is unavailable", () => {
    const data = buildDashboardUserPanelData({
      sessionUser: { id: "u-2", name: "Casey Crew", employeeNo: "F8002" },
      profile: null,
    });

    expect(data.name).toBe("Casey Crew");
    expect(data.email).toBe("-");
    expect(data.userInfoGrid.values).toEqual([
      ["-", "-", "-"],
      ["-", "-", "-"],
      ["-", "-", ""],
    ]);
  });

  it("maps live profile arrays and labels into the dashboard panel model", () => {
    const data = buildDashboardUserPanelData({
      sessionUser: { id: "u-3", name: "Session Crew", employeeNo: "F8003" },
      profile: {
        id: "3",
        employeeNo: "F8003",
        name: "Live Crew",
        email: "live.crew@example.com",
        base: "YYZ",
        rank: "FA",
        division: "C",
        fleet: ["737", "7M8"],
        languages: ["EN 5", "FR"],
        seniorityLabel: "646",
        statusLabel: null,
        existingCreditLabel: "75.5",
        trainingMonthLabel: null,
        lastLoginLabel: "Apr 01, 19:30",
      },
      bidPackage: {
        periodCode: "Apr 2026",
        rosterPeriodId: 4,
        rpEndLocal: "2026-04-30",
        rpStartLocal: "2026-04-01",
        businessNow: "2026-04-02T12:00:00.000Z",
        timezoneLabel: "YVR Local Time",
        bidStartAt: "2026-04-01T07:00:00.000Z",
        bidCloseAt: "2026-04-09T06:59:00.000Z",
        bidStartLabel: "Apr 01, 00:00",
        bidCloseLabel: "Apr 08, 23:59",
        remainingLabel: "6 DAYS 11 HRS 59 MINS",
        computedStage: "OPEN",
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
    });

    expect(data.name).toBe("Live Crew");
    expect(data.bidInfoRows.map((row) => row.value)).toEqual([
      "Apr 01, 00:00",
      "Apr 08, 23:59",
      "6 DAYS 11 HRS",
    ]);
    expect("bidMetricBlock" in data).toBe(false);
    expect(data.userInfoGrid.headers).toEqual([
      ["BASE", "FLEET", "POSITION"],
      ["SENIORITY", "LANGUAGE", "EXISTING CREDIT"],
      ["TRAINING MONTH", "LAST LOGIN", ""],
    ]);
    expect(data.userInfoGrid.headers.flat().some((header) => header.includes("\n"))).toBe(false);
    expect(data.userInfoGrid.values).toEqual([
      ["YYZ", "737\n7M8", "FA"],
      ["646", "EN 5\nFR", "75.5"],
      ["-", "Apr 01, 19:30", ""],
    ]);
  });

  it("keeps remaining labels coarse when only minutes remain", () => {
    const data = buildDashboardUserPanelData({
      bidPackage: {
        periodCode: "Apr 2026",
        rosterPeriodId: 4,
        rpEndLocal: "2026-04-30",
        rpStartLocal: "2026-04-01",
        businessNow: "2026-04-08T23:07:00.000Z",
        timezoneLabel: "YVR Local Time",
        bidStartAt: "2026-04-01T07:00:00.000Z",
        bidCloseAt: "2026-04-09T06:59:00.000Z",
        bidStartLabel: "Apr 01, 00:00",
        bidCloseLabel: "Apr 08, 23:59",
        remainingLabel: "52 MINS",
        computedStage: "OPEN",
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
    });

    expect(data.bidInfoRows.find((row) => row.label === "REMAINING")?.value).toBe("LESS THAN 1 HR");
  });

  it("preserves non-countdown remaining status labels", () => {
    const data = buildDashboardUserPanelData({
      bidPackage: {
        periodCode: "Apr 2026",
        rosterPeriodId: 4,
        rpEndLocal: "2026-04-30",
        rpStartLocal: "2026-04-01",
        businessNow: "2026-04-09T07:00:00.000Z",
        timezoneLabel: "YVR Local Time",
        bidStartAt: "2026-04-01T07:00:00.000Z",
        bidCloseAt: "2026-04-09T06:59:00.000Z",
        bidStartLabel: "Apr 01, 00:00",
        bidCloseLabel: "Apr 08, 23:59",
        remainingLabel: "Closed",
        computedStage: "CLOSED",
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
    });

    expect(data.bidInfoRows.find((row) => row.label === "REMAINING")?.value).toBe("Closed");
  });
});
