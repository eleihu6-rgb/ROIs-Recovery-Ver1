import { render, screen } from "@testing-library/react";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import { CurrentPeriodStatus } from "@/shared/components/current-period-status";

const buildPeriod = (overrides: Partial<PbsCurrentPeriod> = {}): PbsCurrentPeriod => ({
  id: 42,
  rosterPeriodId: 42,
  rosterPeriodKey: "2026RP10",
  periodCode: "Oct 2026",
  filiale: "F8",
  status: "OPEN",
  computedStage: "OPEN",
  bidOpenAt: "2026-09-04T04:00:00.000Z",
  bidCloseAt: "2026-09-14T03:59:00.000Z",
  base: "YYZ",
  zoneId: "America/Toronto",
  timezoneLabel: "YYZ Local Time",
  rpStartLocal: "2026-10-01",
  rpEndLocal: "2026-10-31",
  canEditBid: true,
  readOnlyReason: null,
  ...overrides,
});

describe("CurrentPeriodStatus", () => {
  it("formats open current-period windows in the base timezone", () => {
    render(<CurrentPeriodStatus currentPeriod={buildPeriod()} />);

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("Bidding open for Oct 2026");
    expect(status).toHaveTextContent("Open Sep 04, 00:00 · Close Sep 13, 23:59 · YYZ Local Time");
  });

  it("ignores raw ISO read-only reasons for not-open periods when structured times are available", () => {
    render(
      <CurrentPeriodStatus
        currentPeriod={buildPeriod({
          computedStage: "NOT_OPEN",
          canEditBid: false,
          readOnlyReason: "Bidding opens at 2026-09-04T04:00:00.000Z.",
        })}
      />,
    );

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("Bidding not open for Oct 2026");
    expect(status).toHaveTextContent("Bidding opens at Sep 04, 00:00 · YYZ Local Time");
    expect(status).not.toHaveTextContent(/\.000Z|T04:00:00\.000Z/);
  });

  it("ignores raw ISO read-only reasons for closed periods when structured times are available", () => {
    render(
      <CurrentPeriodStatus
        currentPeriod={buildPeriod({
          computedStage: "CLOSED",
          canEditBid: false,
          readOnlyReason: "Bidding closed at 2026-09-14T03:59:00.000Z.",
        })}
      />,
    );

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("Bidding closed for Oct 2026");
    expect(status).toHaveTextContent("Bidding closed at Sep 13, 23:59 · YYZ Local Time");
    expect(status).not.toHaveTextContent(/\.000Z|T03:59:00\.000Z/);
  });
});
