import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  MonthEndCarryoverEditor,
  isMonthEndCarryoverBidValueValid,
} from "@/features/pairing/components/month-end-carryover-editor";
import type {
  MonthEndCarryoverBid,
  PairingBidAction,
  PairingBidOperator,
  PairingBidValue,
} from "@/features/pairing/types";

type MonthEndCarryoverEditorHarnessProps = {
  initialOperator?: PairingBidOperator | null;
  initialValue?: MonthEndCarryoverBid;
};

const MonthEndCarryoverEditorHarness = ({
  initialOperator = null,
  initialValue = { type: "month-end-carryover", operator: ">", days: null },
}: MonthEndCarryoverEditorHarnessProps) => {
  const [action, setAction] = useState<PairingBidAction | null>("award");
  const [operator, setOperator] = useState<PairingBidOperator | null>(initialOperator);
  const [value, setValue] = useState<MonthEndCarryoverBid>(initialValue);
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <MonthEndCarryoverEditor
        action={action}
        actionOptions={["award", "avoid"]}
        ariaLabel="Month-End Carryover"
        operator={operator}
        value={value}
        onActionChange={setAction}
        onChange={setValue}
        onOperatorChange={setOperator}
        onValidityChange={setIsValid}
      />
      <output data-testid="month-end-carryover-payload">
        {JSON.stringify({ action, operator, value, isValid })}
      </output>
    </>
  );
};

describe("MonthEndCarryoverEditor", () => {
  it("requires an explicit comparison and days value without showing a 1-5 placeholder", async () => {
    const user = userEvent.setup();

    render(<MonthEndCarryoverEditorHarness />);

    expect(screen.getByText("PREFERENCE")).toBeInTheDocument();
    expect(screen.getByText("CARRY-OUT DAYS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Avoid" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "Month-End Carryover operator" })).toHaveValue("");
    const daysInput = screen.getByRole("spinbutton", { name: "Month-End Carryover carry-out days" });

    expect(daysInput).toHaveAttribute("placeholder", "Enter");
    expect(screen.queryByDisplayValue("1-5")).not.toBeInTheDocument();
    expect(screen.getByTestId("month-end-carryover-payload")).toHaveTextContent('"isValid":false');

    await user.selectOptions(screen.getByRole("combobox", { name: "Month-End Carryover operator" }), ">");
    await user.type(daysInput, "6");

    expect(screen.getByTestId("month-end-carryover-payload")).toHaveTextContent('"operator":">"');
    expect(screen.getByTestId("month-end-carryover-payload")).toHaveTextContent(
      '"value":{"type":"month-end-carryover","operator":">","days":6}',
    );
    expect(screen.getByTestId("month-end-carryover-payload")).toHaveTextContent('"isValid":true');
  });

  it("uses separate from/to values for Between mode", async () => {
    const user = userEvent.setup();

    render(<MonthEndCarryoverEditorHarness />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Month-End Carryover operator" }), "Between");
    await user.type(screen.getByRole("spinbutton", { name: "Month-End Carryover carry-out from days" }), "2");
    await user.type(screen.getByRole("spinbutton", { name: "Month-End Carryover carry-out to days" }), "4");

    expect(screen.getByTestId("month-end-carryover-payload")).toHaveTextContent(
      '"value":{"type":"month-end-carryover","operator":"Between","from":2,"to":4}',
    );
    expect(screen.getByTestId("month-end-carryover-payload")).toHaveTextContent('"isValid":true');
  });

  it.each([
    [{ type: "month-end-carryover", operator: ">", days: 6 } satisfies PairingBidValue, true],
    [{ type: "month-end-carryover", operator: ">", days: null } satisfies PairingBidValue, false],
    [{ type: "month-end-carryover", operator: "Between", from: 2, to: 4 } satisfies PairingBidValue, true],
    [{ type: "month-end-carryover", operator: "Between", from: 4, to: 2 } satisfies PairingBidValue, false],
    [{ type: "stepper", value: 3, min: 1, max: 7 } satisfies PairingBidValue, false],
  ])("validates its dedicated bid payload", (bid, expected) => {
    expect(isMonthEndCarryoverBidValueValid(bid)).toBe(expected);
  });
});
