import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TimeBetweenFlightsEditor } from "@/features/pairing/components/time-between-flights-editor";

describe("TimeBetweenFlightsEditor", () => {
  it("uses the shared preference sections and preserves HH:MM normalization", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onOperatorChange = vi.fn();
    const onQuantifierChange = vi.fn();
    const onValidityChange = vi.fn();

    render(
      <TimeBetweenFlightsEditor
        action="award"
        actionOptions={["award", "avoid"]}
        ariaLabel="Time Between Flights"
        maximumMinutes={260}
        minimumMinutes={45}
        operator=">"
        quantifier="any"
        quantifierOptions={["any", "every"]}
        value={{ type: "duration", value: "", operator: ">" }}
        onActionChange={vi.fn()}
        onChange={onChange}
        onOperatorChange={onOperatorChange}
        onQuantifierChange={onQuantifierChange}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByText("PREFERENCE")).toBeInTheDocument();
    expect(screen.getByText("MATCH")).toBeInTheDocument();
    expect(screen.getByText("TIME BETWEEN FLIGHTS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Any" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("hours : min")).toHaveClass("z-20");

    await user.click(screen.getByRole("button", { name: "Every" }));
    expect(onQuantifierChange).toHaveBeenCalledWith("every");

    const durationInput = screen.getByRole("textbox", { name: "Time Between Flights duration" });
    await user.type(durationInput, "0045-2405");

    expect(durationInput).toHaveValue("00:45");
    expect(onChange).toHaveBeenLastCalledWith({ type: "duration", value: "00:45", operator: ">" });
    expect(onValidityChange).toHaveBeenLastCalledWith(true);

    await user.selectOptions(screen.getByRole("combobox", { name: "Time Between Flights operator" }), "=");

    expect(onOperatorChange).toHaveBeenCalledWith("=");
    expect(onChange).toHaveBeenLastCalledWith({ type: "duration", value: "00:45", operator: "=" });
  });

  it("keeps invalid durations in the input and reports the dynamic bounds", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();

    render(
      <TimeBetweenFlightsEditor
        action="avoid"
        actionOptions={["award", "avoid"]}
        ariaLabel="Time Between Flights"
        maximumMinutes={260}
        minimumMinutes={45}
        operator=">"
        quantifier="every"
        quantifierOptions={["any", "every"]}
        value={{ type: "duration", value: "", operator: ">" }}
        onActionChange={vi.fn()}
        onChange={vi.fn()}
        onOperatorChange={vi.fn()}
        onQuantifierChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    const durationInput = screen.getByRole("textbox", { name: "Time Between Flights duration" });
    await user.type(durationInput, "0044");

    expect(durationInput).toHaveValue("00:44");
    expect(durationInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter 00:45 to 04:20.")).toBeInTheDocument();
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });
});
