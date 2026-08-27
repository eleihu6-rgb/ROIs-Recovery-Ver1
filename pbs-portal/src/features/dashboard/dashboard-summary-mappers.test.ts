import { buildDashboardMessagePanelData } from "@/features/dashboard/dashboard-summary-mappers";

describe("buildDashboardMessagePanelData", () => {
  it("maps pre-assigned duties into display-ready message center data", () => {
    const data = buildDashboardMessagePanelData({
      title: "MESSAGE CENTER",
      baseLineAverage: null,
      preAssignments: {
        totalDuties: 2,
        daysTouched: 3,
        categories: [{ code: "PAIRING", label: "Pairing", count: 1 }],
        details: [{
          id: "pairing:9001",
          type: "pairing",
          code: "PAIRING",
          label: "T4501",
          startDate: "2026-06-01",
          endDate: "2026-06-02",
          timeText: "06:00-15:00",
        }],
      },
      fleetItems: [{ fleet: "737", subFleet: null, pairingCount: 24 }],
      messages: [],
    });

    expect(data.preAssignments).toEqual({
      totalDuties: 2,
      daysTouched: 3,
      categories: [{ code: "PAIRING", label: "Pairing", count: 1 }],
      details: [{
        id: "pairing:9001",
        type: "pairing",
        code: "PAIRING",
        label: "T4501",
        dateText: "Jun 01 - Jun 02",
        timeText: "06:00-15:00",
      }],
    });
    expect(data.items).toEqual([{ fleet: "737", subFleet: "-", pairingCount: 24 }]);
  });

  it("uses product copy for missing fleet values", () => {
    const data = buildDashboardMessagePanelData({
      title: "MESSAGE CENTER",
      baseLineAverage: null,
      preAssignments: {
        totalDuties: 0,
        daysTouched: 0,
        categories: [],
        details: [],
      },
      fleetItems: [{ fleet: "", subFleet: null, pairingCount: 1 }],
      messages: [],
    });

    expect(data.items).toEqual([{ fleet: "Other fleet", subFleet: "-", pairingCount: 1 }]);
  });

  it("uses stable empty pre-assignment data when the field is absent", () => {
    const legacyMessageCenter = {
      title: "MESSAGE CENTER",
      baseLineAverage: null,
      fleetItems: [],
      messages: [],
    } as unknown as Parameters<typeof buildDashboardMessagePanelData>[0];
    const data = buildDashboardMessagePanelData(legacyMessageCenter);

    expect(data.preAssignments).toEqual({
      totalDuties: 0,
      daysTouched: 0,
      categories: [],
      details: [],
    });
  });
});
