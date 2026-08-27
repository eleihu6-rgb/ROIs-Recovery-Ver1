import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PreferOffCalendarPicker } from "@/features/days-off/components/prefer-off-calendar-picker";

describe("PreferOffCalendarPicker", () => {
  const setViewport = ({ height, width }: { height: number; width: number }) => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
  };

  it("keeps default density unchanged and exposes compact and filter triggers", () => {
    const { rerender } = render(
      <PreferOffCalendarPicker
        mode="range"
        openLabel="Open density calendar"
        periodCode="Jun 2026"
        rangeFrom="2026-06-01"
        rangeTo="2026-06-10"
        onRangeChange={vi.fn()}
      />,
    );

    let anchor = screen.getByRole("button", { name: "Open density calendar" }).parentElement;
    expect(anchor).toHaveAttribute("data-density", "default");
    expect(anchor).toHaveClass("min-h-10");
    expect(anchor).not.toHaveClass("h-9");

    rerender(
      <PreferOffCalendarPicker
        density="default"
        mode="range"
        openLabel="Open density calendar"
        periodCode="Jun 2026"
        rangeFrom="2026-06-01"
        rangeTo="2026-06-10"
        onRangeChange={vi.fn()}
      />,
    );

    anchor = screen.getByRole("button", { name: "Open density calendar" }).parentElement;
    expect(anchor).toHaveAttribute("data-density", "default");
    expect(anchor).toHaveClass("min-h-10");

    rerender(
      <PreferOffCalendarPicker
        density="compact"
        mode="range"
        openLabel="Open density calendar"
        periodCode="Jun 2026"
        rangeFrom="2026-06-01"
        rangeTo="2026-06-10"
        onRangeChange={vi.fn()}
      />,
    );

    anchor = screen.getByRole("button", { name: "Open density calendar" }).parentElement;
    expect(anchor).toHaveAttribute("data-density", "compact");
    expect(anchor).toHaveClass("h-[25px]", "gap-1", "px-1.5");
    expect(anchor).not.toHaveClass("min-h-10");

    rerender(
      <PreferOffCalendarPicker
        density="filter"
        mode="range"
        openLabel="Open density calendar"
        periodCode="Jun 2026"
        rangeFrom="2026-06-01"
        rangeTo="2026-06-10"
        onRangeChange={vi.fn()}
      />,
    );

    anchor = screen.getByRole("button", { name: "Open density calendar" }).parentElement;
    expect(anchor).toHaveAttribute("data-density", "filter");
    expect(anchor).toHaveClass("h-8", "gap-1.5", "rounded-md", "px-2");
    expect(anchor).not.toHaveClass("h-[25px]");
  });

  it("scales the body portaled calendar to match a transformed anchor", async () => {
    const user = userEvent.setup();
    setViewport({ height: 700, width: 800 });

    render(
      <PreferOffCalendarPicker
        mode="range"
        openLabel="Open scaled Prefer Off calendar"
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        rangeFrom=""
        rangeTo=""
        onRangeChange={vi.fn()}
      />,
    );

    const openButton = screen.getByRole("button", { name: "Open scaled Prefer Off calendar" });
    const anchor = openButton.parentElement;

    expect(anchor).not.toBeNull();

    Object.defineProperty(anchor, "offsetWidth", {
      configurable: true,
      value: 300,
    });
    anchor!.getBoundingClientRect = vi.fn(() => ({
      bottom: 540,
      height: 40,
      left: 100,
      right: 250,
      top: 500,
      width: 150,
      x: 100,
      y: 500,
      toJSON: () => ({}),
    }));

    await user.click(openButton);

    const popover = await screen.findByTestId("prefer-off-calendar-popover");

    await waitFor(() => {
      expect(popover).toHaveStyle({
        left: "100px",
        maxHeight: "344px",
        top: "325px",
        transform: "scale(0.5)",
        transformOrigin: "top left",
      });
    });
  });

  it.each(["default", "compact"] as const)("closes the %s range calendar after selecting the end date", async (density) => {
    const user = userEvent.setup();

    const RangeHarness = () => {
      const [range, setRange] = useState({ from: "", to: "" });

      return (
        <PreferOffCalendarPicker
          density={density}
          mode="range"
          openLabel="Open Prefer Off range calendar"
          periodCode="Jun 2026"
          periodEndDate="2026-06-30"
          periodStartDate="2026-06-01"
          rangeFrom={range.from}
          rangeTo={range.to}
          onRangeChange={(from, to) => setRange({ from, to })}
        />
      );
    };

    render(<RangeHarness />);

    await user.click(screen.getByRole("button", { name: "Open Prefer Off range calendar" }));
    await user.click(await screen.findByRole("gridcell", { name: "Select 2026-06-04" }));

    expect(screen.getByTestId("prefer-off-calendar-popover")).toBeInTheDocument();

    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-06" }));

    await waitFor(() => {
      expect(screen.queryByTestId("prefer-off-calendar-popover")).not.toBeInTheDocument();
    });
  });
});
