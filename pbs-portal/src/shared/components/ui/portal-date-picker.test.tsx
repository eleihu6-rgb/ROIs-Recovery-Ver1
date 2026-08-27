import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalDatePicker } from "@/shared/components/ui/portal-date-picker";

describe("PortalDatePicker", () => {
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

  const StatefulDatePicker = ({
    ariaLabel = "Prefer Off date",
    defaultMonth = "2026-06",
    onValueChange = vi.fn(),
  }: {
    ariaLabel?: string;
    defaultMonth?: string;
    onValueChange?: (value: string) => void;
  }) => {
    const [value, setValue] = useState("");

    return (
      <PortalDatePicker
        ariaLabel={ariaLabel}
        defaultMonth={defaultMonth}
        value={value}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          onValueChange(nextValue);
        }}
      />
    );
  };

  it("uses a text input with an English ISO placeholder", () => {
    const handleChange = vi.fn();

    render(<StatefulDatePicker onValueChange={handleChange} />);

    const input = screen.getByLabelText("Prefer Off date");

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("placeholder", "YYYY-MM-DD");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).not.toHaveAttribute("type", "date");
  });

  it("accepts manual ISO date typing", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<StatefulDatePicker onValueChange={handleChange} />);

    await user.type(screen.getByLabelText("Prefer Off date"), "2026-06-20");

    expect(handleChange).toHaveBeenLastCalledWith("2026-06-20");
  });

  it("opens an English calendar and returns the selected ISO date", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PortalDatePicker
        ariaLabel="Prefer Off date"
        defaultMonth="2026-06"
        value=""
        onValueChange={handleChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open date picker for Prefer Off date" }));

    expect(screen.getByText("JUN 2026")).toBeInTheDocument();
    expect(screen.getByText("SUN")).toBeInTheDocument();
    expect(screen.getByText("MON")).toBeInTheDocument();

    await user.click(screen.getByRole("gridcell", { name: "Select Jun 15, 2026" }));

    expect(handleChange).toHaveBeenCalledWith("2026-06-15");
    await waitFor(() => {
      expect(screen.queryByText("JUN 2026")).not.toBeInTheDocument();
    });
  });

  it("uses the current value month when opening the calendar", async () => {
    const user = userEvent.setup();

    render(
      <PortalDatePicker
        ariaLabel="Range from"
        defaultMonth="2026-06"
        value="2026-07-04"
        onValueChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open date picker for Range from" }));

    expect(screen.getByText("JUL 2026")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Select Jul 4, 2026" })).toHaveAttribute("aria-pressed", "true");
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();

    render(
      <PortalDatePicker
        ariaLabel="Reserve date"
        defaultMonth="2026-06"
        value=""
        onValueChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open date picker for Reserve date" }));
    expect(screen.getByText("JUN 2026")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("Reserve date"), { key: "Escape" });

    expect(screen.queryByText("JUN 2026")).not.toBeInTheDocument();
  });

  it("scales the body portaled calendar to match a transformed page canvas", async () => {
    const user = userEvent.setup();
    setViewport({ height: 700, width: 800 });

    render(
      <PortalDatePicker
        ariaLabel="Scaled date"
        defaultMonth="2026-08"
        value=""
        onValueChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Scaled date");
    const anchor = input.parentElement;

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

    await user.click(screen.getByRole("button", { name: "Open date picker for Scaled date" }));

    const popover = await screen.findByTestId("portal-date-picker-popover");

    await waitFor(() => {
      expect(popover).toHaveStyle({
        left: "100px",
        top: "335px",
        transform: "scale(0.5)",
        transformOrigin: "top left",
      });
    });
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();

    render(
      <PortalDatePicker
        ariaLabel="Disabled date"
        defaultMonth="2026-06"
        disabled
        value=""
        onValueChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open date picker for Disabled date" }));

    expect(screen.queryByText("JUN 2026")).not.toBeInTheDocument();
  });
});
