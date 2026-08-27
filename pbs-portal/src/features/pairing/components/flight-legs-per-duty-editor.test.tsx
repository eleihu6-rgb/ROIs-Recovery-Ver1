import { render, screen } from "@testing-library/react";

import { FlightLegsPerDutyEditor } from "@/features/pairing/components/flight-legs-per-duty-editor";

describe("FlightLegsPerDutyEditor", () => {
  it("rehydrates an existing rule instead of applying the new-bid blank legs state", () => {
    const onValidityChange = vi.fn();

    render(
      <FlightLegsPerDutyEditor
        action="avoid"
        actionOptions={["award", "avoid"]}
        ariaLabel="Flight Legs per Duty"
        isNew={false}
        numericBounds={{ min: 1, max: 8 }}
        operator=">"
        periodCode="2025-12"
        periodEndDate="2025-12-31"
        periodStartDate="2025-12-01"
        quantifier="every"
        quantifierOptions={["any", "every"]}
        value={{ type: "flight-legs-per-duty", operator: ">", legs: 4, dateScope: null }}
        onActionChange={vi.fn()}
        onChange={vi.fn()}
        onOperatorChange={vi.fn()}
        onQuantifierChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Avoid" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Every duty" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "Flight Legs per Duty operator" })).toHaveValue(">");
    expect(screen.getByText("PREFERENCE")).toBeInTheDocument();
    expect(screen.getByText("DUTY MATCH")).toBeInTheDocument();
    expect(screen.getByText("LEGS PER DUTY")).toBeInTheDocument();
    const legsInput = screen.getByRole("spinbutton", { name: "Flight Legs per Duty legs per duty" });

    expect(legsInput).toHaveValue(4);
    expect(legsInput).toHaveClass("focus-visible:z-10", "focus-visible:border-2", "focus-visible:border-[#7471d6]", "focus-visible:ring-0");
    expect(legsInput.parentElement).toHaveClass("focus-within:z-10");
    expect(screen.getByText("legs", { exact: true })).toHaveClass("z-20");
    expect(screen.queryByText("Avoid pairings with every duty having more than 4 legs.")).not.toBeInTheDocument();
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it("rehydrates inclusive Between values and the shared multiple event-date scope", () => {
    const onValidityChange = vi.fn();

    render(
      <FlightLegsPerDutyEditor
        action="award"
        actionOptions={["award", "avoid"]}
        ariaLabel="Flight Legs per Duty"
        isNew={false}
        numericBounds={{ min: 1, max: 8 }}
        operator="Between"
        periodCode="Apr 2026"
        periodEndDate="2026-04-30"
        periodStartDate="2026-04-01"
        quantifier="any"
        quantifierOptions={["any", "every"]}
        value={{
          type: "flight-legs-per-duty",
          operator: "Between",
          from: 2,
          to: 4,
          dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-10"] },
        }}
        onActionChange={vi.fn()}
        onChange={vi.fn()}
        onOperatorChange={vi.fn()}
        onQuantifierChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Flight Legs per Duty operator" })).toHaveValue("Between");
    expect(screen.getByRole("spinbutton", { name: "Flight Legs per Duty from legs" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "Flight Legs per Duty to legs" })).toHaveValue(4);
    expect(screen.getByRole("switch", { name: "Flight Legs per Duty limit to event date" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });
});
