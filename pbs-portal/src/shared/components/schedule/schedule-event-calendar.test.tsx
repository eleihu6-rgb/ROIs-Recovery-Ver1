import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleEventCalendar } from "@/shared/components/schedule/schedule-event-calendar";
import type { ScheduleCalendarCell, ScheduleCalendarEvent } from "@/shared/components/schedule/types";

const calendarCells: ScheduleCalendarCell[] = [
  { day: "01", isoDate: "2026-04-01" },
  { day: "02", isoDate: "2026-04-02" },
  { day: "03", isoDate: "2026-04-03" },
  { day: "04", isoDate: "2026-04-04" },
  { day: "05", isoDate: "2026-04-05" },
  { day: "06", isoDate: "2026-04-06" },
  { day: "07", isoDate: "2026-04-07" },
];

const calendarEvents: ScheduleCalendarEvent[] = [
  {
    row: 1,
    colStart: 5,
    colSpan: 1,
    top: 24,
    label: "Off",
    tone: "green",
  },
];

const selectableCalendarEvents: ScheduleCalendarEvent[] = [
  {
    row: 1,
    colStart: 6,
    colSpan: 2,
    top: 24,
    label: "M4959",
    tone: "blue",
    ariaLabel: "View pairing bid M4959",
    selectable: true,
    sourceEvent: {
      id: "pairing-bid-m4959",
      type: "pairing_bid",
      tier: "T1",
      label: "M4959",
      startDate: "2026-04-06",
      endDate: "2026-04-07",
      readonly: true,
      metadata: {
        pairingNumber: "M4959",
        pairingId: "4959001",
        originDate: "2026-04-06",
        occurrenceMode: "specific_date",
      },
    },
  },
];

describe("ScheduleEventCalendar", () => {
  it("keeps active day off cells free of the purple selected ring", async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(
      <ScheduleEventCalendar
        activeDates={["2026-04-05"]}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        onToggleDate={handleToggle}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    const activeDateButton = screen.getByRole("button", { name: "Toggle day off for 2026-04-05" });

    expect(activeDateButton).toHaveAttribute("aria-pressed", "true");
    expect(activeDateButton.className).not.toContain("ring-2");
    expect(activeDateButton.className).not.toContain("ring-[#706cd5]");

    await user.click(activeDateButton);

    expect(handleToggle).toHaveBeenCalledWith("2026-04-05", {
      type: "cell",
      row: 1,
      col: 5,
    });
  });

  it("calls the weekday action when weekday headers are enabled", async () => {
    const user = userEvent.setup();
    const handleSelectWeekday = vi.fn();

    render(
      <ScheduleEventCalendar
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        onSelectWeekday={handleSelectWeekday}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add day off bids for SAT" }));

    expect(handleSelectWeekday).toHaveBeenCalledWith(6, "SAT", { type: "weekday", col: 7 });
  });

  it("renders days off capacity without intercepting editable date actions", async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(
      <ScheduleEventCalendar
        calendarCells={[
          ...calendarCells.slice(0, 4),
          {
            ...calendarCells[4]!,
            metricBadges: [{
              type: "days_off",
              label: "DO",
              numerator: 23,
              denominator: 33,
              ariaLabel: "DO days off requests for 2026-04-05: 23 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
            }],
          },
          {
            ...calendarCells[5]!,
            metricBadges: [{
              type: "days_off",
              label: "DO",
              numerator: 33,
              denominator: 33,
              ariaLabel: "DO days off requests for 2026-04-06: 33 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
            }],
          },
          {
            ...calendarCells[6]!,
            metricBadges: [{
              type: "days_off",
              label: "DO",
              numerator: 39,
              denominator: 33,
              ariaLabel: "DO days off requests for 2026-04-07: 39 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
            }],
          },
        ]}
        calendarEvents={calendarEvents}
        onToggleDate={handleToggle}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    const capacityBadge = screen.getByText("DO 23/33");
    const fullCapacityBadge = screen.getByText("DO 33/33");
    const overCapacityBadge = screen.getByText("DO 39/33");
    const capacityBadgeGroup = capacityBadge.closest('[data-testid="schedule-calendar-metric-badge-group"]');
    const capacityBadgeCell = capacityBadge.closest("article");

    expect(capacityBadge).toBeInTheDocument();
    expect(capacityBadgeGroup).not.toBeNull();
    expect(capacityBadgeGroup?.className).toContain("gap-0");
    expect(capacityBadgeGroup?.className).toContain("overflow-hidden");
    expect(capacityBadgeGroup?.className).toContain("rounded-sm");
    expect(capacityBadgeGroup?.className).not.toContain("scale-150");
    expect(capacityBadgeGroup?.className).not.toContain("gap-0.5");
    expect(capacityBadge.className).toContain("pointer-events-none");
    expect(capacityBadge.className).toContain("h-3");
    expect(capacityBadge.className).toContain("min-w-16");
    expect(capacityBadge.className).toContain("whitespace-nowrap");
    expect(capacityBadge.className).toContain("[font-size:var(--text-3xs,0.5625rem)]");
    expect(capacityBadge.className).not.toContain("scale-[0.8]");
    expect(capacityBadge.className).toContain("bg-[#3DC0A9]");
    expect(fullCapacityBadge.className).toContain("bg-[#F5B507]");
    expect(overCapacityBadge.className).toContain("bg-[#D94C4C]");
    expect(capacityBadge).toHaveAttribute(
      "aria-label",
      "DO days off requests for 2026-04-05: 23 of 33 · Crew 120 · Pairing demand 69 · Reserve demand 8 · Pre-assigned days off 10",
    );
    expect(capacityBadge).not.toHaveAttribute("title");
    expect(capacityBadgeCell).not.toBeNull();
    const capacityZoom = within(capacityBadgeCell as HTMLElement).getByTestId("schedule-calendar-metric-badge-zoom");
    const capacityZoomRow = within(capacityBadgeCell as HTMLElement).getByTestId("schedule-calendar-metric-badge-zoom-row");

    expect(capacityZoom).toHaveAttribute("aria-hidden", "true");
    expect(capacityZoom.className).toContain("hidden");
    expect(capacityZoom.className).toContain("group-hover/schedule-cell:flex");
    expect(capacityZoomRow).toHaveAttribute("data-metric-label", "DO 23/33");
    expect(capacityZoomRow.className).toContain("h-5");
    expect(capacityZoomRow.className).toContain("min-w-24");
    expect(capacityZoomRow.className).toContain("text-xs");
    expect(capacityZoomRow.className).toContain("font-normal");
    expect(capacityZoomRow.className).not.toContain("font-bold");
    expect(capacityZoomRow.className).toContain("before:content-[attr(data-metric-label)]");

    await user.click(screen.getByRole("button", { name: "Toggle day off for 2026-04-05" }));

    expect(handleToggle).toHaveBeenCalledWith("2026-04-05", {
      type: "cell",
      row: 1,
      col: 5,
    });
  });

  it("renders reserve metric badges with the same capacity thresholds", () => {
    render(
      <ScheduleEventCalendar
        calendarCells={[
          ...calendarCells.slice(0, 4),
          {
            ...calendarCells[4]!,
            metricBadges: [{
              type: "reserve",
              label: "RES",
              numerator: 12,
              denominator: 33,
              ariaLabel: "RES reserve coverage for 2026-04-05: need 12; off 33",
            }],
          },
          {
            ...calendarCells[5]!,
            metricBadges: [{
              type: "reserve",
              label: "RES",
              numerator: 33,
              denominator: 33,
              ariaLabel: "RES reserve coverage for 2026-04-06: need 33; off 33",
            }],
          },
          {
            ...calendarCells[6]!,
            metricBadges: [{
              type: "reserve",
              label: "RES",
              numerator: 39,
              denominator: 33,
              ariaLabel: "RES reserve coverage for 2026-04-07: need 39; off 33",
            }],
          },
        ]}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    const coveredBadge = screen.getByText("RES 12/33");
    const exactBadge = screen.getByText("RES 33/33");
    const shortBadge = screen.getByText("RES 39/33");

    expect(coveredBadge).toHaveAttribute(
      "aria-label",
      "RES reserve coverage for 2026-04-05: need 12; off 33",
    );
    expect(coveredBadge.className).toContain("bg-[#3DC0A9]");
    expect(exactBadge.className).toContain("bg-[#F5B507]");
    expect(shortBadge.className).toContain("bg-[#D94C4C]");
  });

  it("stacks days off and reserve metric badges on the same date", () => {
    render(
      <ScheduleEventCalendar
        calendarCells={[
          ...calendarCells.slice(0, 4),
          {
            ...calendarCells[4]!,
            metricBadges: [
              {
                type: "days_off",
                label: "DO",
                numerator: 23,
                denominator: 33,
                ariaLabel: "DO days off requests for 2026-04-05: 23 of 33",
              },
              {
                type: "reserve",
                label: "RES",
                numerator: 12,
                denominator: 33,
                ariaLabel: "RES reserve coverage for 2026-04-05: need 12; off 33",
              },
            ],
          },
          ...calendarCells.slice(5),
        ]}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByText("DO 23/33")).toBeInTheDocument();
    expect(screen.getByText("RES 12/33")).toBeInTheDocument();
    const metricBadgeGroup = screen.getByTestId("schedule-calendar-metric-badge-group");

    expect(metricBadgeGroup).toHaveAttribute("data-metric-badge-count", "2");
    expect(metricBadgeGroup.className).toContain("gap-0");
    expect(metricBadgeGroup.className).toContain("overflow-hidden");
    expect(screen.getByText("DO 23/33").parentElement).toBe(metricBadgeGroup);
    expect(screen.getByText("RES 12/33").parentElement).toBe(metricBadgeGroup);
    const zoom = screen.getByTestId("schedule-calendar-metric-badge-zoom");
    const zoomRows = screen.getAllByTestId("schedule-calendar-metric-badge-zoom-row");

    expect(zoom.className).toContain("hidden");
    expect(zoom.className).toContain("group-hover/schedule-cell:flex");
    expect(zoomRows).toHaveLength(2);
    expect(zoomRows[0]).toHaveAttribute("data-metric-label", "DO 23/33");
    expect(zoomRows[1]).toHaveAttribute("data-metric-label", "RES 12/33");
  });

  it("calls the event select handler for selectable calendar events", async () => {
    const user = userEvent.setup();
    const handleEventSelect = vi.fn();

    render(
      <ScheduleEventCalendar
        calendarCells={calendarCells}
        calendarEvents={selectableCalendarEvents}
        onEventSelect={handleEventSelect}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View pairing bid M4959" }));

    expect(handleEventSelect).toHaveBeenCalledWith(selectableCalendarEvents[0]);
  });

  it("keeps selectable calendar events read-only when no select handler is provided", () => {
    render(
      <ScheduleEventCalendar
        calendarCells={calendarCells}
        calendarEvents={selectableCalendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.queryByRole("button", { name: "View pairing bid M4959" })).not.toBeInTheDocument();
    expect(screen.getByText("M4959")).toBeInTheDocument();
  });

  it("keeps editable calendar controls visually aligned with the read-only calendar", () => {
    render(
      <ScheduleEventCalendar
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        onSelectWeekday={vi.fn()}
        onToggleDate={vi.fn()}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    const weekdayButton = screen.getByRole("button", { name: "Add day off bids for SUN" });
    const dateButton = screen.getByRole("button", { name: "Toggle day off for 2026-04-01" });
    const dateCell = dateButton.closest("article");

    expect(weekdayButton.className).toContain("bg-transparent");
    expect(weekdayButton.className).toContain("p-0");
    expect(weekdayButton.className).toContain("font-normal");
    expect(weekdayButton.className).toContain("leading-[18px]");
    expect(weekdayButton.className).not.toContain("px-2");
    expect(weekdayButton.className).not.toContain("py-1");
    expect(weekdayButton.className).not.toContain("hover:bg");
    expect(weekdayButton.className).not.toContain("font-medium");

    expect(dateCell).not.toBeNull();
    expect(dateCell?.className).toContain("relative border border-[#EBEBEB] bg-white px-1 pt-1");
    expect(dateCell).toHaveStyle({ height: "103px" });
    expect(dateButton.className).toContain("absolute inset-0");
    expect(dateButton.className).toContain("appearance-none");
    expect(dateButton.className).not.toContain("ring-2");
  });

  it("supports a taller calendar cell height for full-height award layouts", () => {
    render(
      <ScheduleEventCalendar
        calendarCellHeight={127}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        calendarHeight={635}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    const dateCell = screen.getByText("01").closest("article");

    expect(dateCell).toHaveStyle({ height: "127px" });
  });

  it("positions a date action popover inside the matching calendar cell", () => {
    render(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "cell", row: 2, col: 4 },
          tierLabel: "T1",
          description: "2026-04-15",
          confirmLabel: "ADD BID",
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    const popover = screen.getByTestId("schedule-action-popover");

    expect(popover).toHaveStyle({
      left: "clamp(8px, calc(50% - 130px), calc(100% - 268px))",
      top: "95px",
      transform: "translateY(-100%)",
    });
  });

  it("positions weekday action popovers above the matching weekday label", () => {
    const { rerender } = render(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "weekday", col: 4 },
          tierLabel: "T1",
          description: "All WEDNESDAY dates in APR 2026",
          confirmLabel: "ADD ALL",
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByTestId("schedule-action-popover")).toHaveStyle({
      left: "clamp(8px, calc(50% - 130px), calc(100% - 268px))",
      top: "-38px",
      transform: "translateY(-100%)",
    });

    rerender(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "weekday", col: 1 },
          tierLabel: "T1",
          description: "All SUNDAY dates in APR 2026",
          confirmLabel: "ADD ALL",
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByTestId("schedule-action-popover")).toHaveStyle({
      left: "clamp(8px, calc(7.143% - 130px), calc(100% - 268px))",
      top: "-38px",
      transform: "translateY(-100%)",
    });

    rerender(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "weekday", col: 7 },
          tierLabel: "T1",
          description: "All SATURDAY dates in APR 2026",
          confirmLabel: "ADD ALL",
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByTestId("schedule-action-popover")).toHaveStyle({
      left: "clamp(8px, calc(92.857% - 130px), calc(100% - 268px))",
      top: "-38px",
      transform: "translateY(-100%)",
    });
  });

  it("opens first-row cell action popovers below the first row to avoid covering the selected date", () => {
    render(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "cell", row: 1, col: 6 },
          tierLabel: "PAIRING BID",
          description: "2026-04-03",
          confirmLabel: "ADD BID",
          width: 380,
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByTestId("schedule-action-popover")).toHaveStyle({
      left: "clamp(8px, calc(78.571% - 190px), calc(100% - 388px))",
      top: "111px",
    });
    expect(screen.getByTestId("schedule-action-popover")).not.toHaveStyle({
      transform: "translateY(-100%)",
    });
  });

  it("keeps wide edge-cell action popovers inside the calendar width", () => {
    const { rerender } = render(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "cell", row: 2, col: 1 },
          tierLabel: "T1",
          description: "2026-04-12",
          confirmLabel: "ADD BID",
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByTestId("schedule-action-popover")).toHaveStyle({
      left: "clamp(8px, calc(7.143% - 130px), calc(100% - 268px))",
      transform: "translateY(-100%)",
    });

    rerender(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "cell", row: 2, col: 6 },
          tierLabel: "PAIRING BID",
          description: "2026-04-10",
          confirmLabel: "ADD BID",
          width: 380,
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    expect(screen.getByTestId("schedule-action-popover")).toHaveStyle({
      left: "clamp(8px, calc(78.571% - 190px), calc(100% - 388px))",
      transform: "translateY(-100%)",
    });
  });

  it("uses an outside dismiss layer for action popovers without intercepting popover actions", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "cell", row: 2, col: 4 },
          tierLabel: "T1",
          description: "2026-04-15",
          confirmLabel: "ADD BID",
          onCancel: handleCancel,
          onConfirm: handleConfirm,
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleCancel).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("schedule-action-popover-dismiss"));

    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("swallows outside action popover clicks while cancel is disabled", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    render(
      <ScheduleEventCalendar
        actionPopover={{
          anchor: { type: "cell", row: 2, col: 4 },
          tierLabel: "T1",
          description: "2026-04-15",
          confirmLabel: "SAVING...",
          cancelDisabled: true,
          onCancel: handleCancel,
          onConfirm: vi.fn(),
        }}
        calendarCells={calendarCells}
        calendarEvents={calendarEvents}
        weekdayLabels={["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]}
      />,
    );

    await user.click(screen.getByTestId("schedule-action-popover-dismiss"));

    expect(handleCancel).not.toHaveBeenCalled();
  });
});
