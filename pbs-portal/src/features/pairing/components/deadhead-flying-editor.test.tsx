import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  DeadheadFlyingEditor,
  isDeadheadFlyingBidValueValid,
} from "@/features/pairing/components/deadhead-flying-editor";
import type {
  DeadheadFlyingBid,
  PairingBidAction,
  PairingBidValue,
} from "@/features/pairing/types";

const DeadheadFlyingEditorHarness = ({
  initialValue = { type: "deadhead-flying", mode: "any-deadhead", dateScope: null },
}: { initialValue?: DeadheadFlyingBid }) => {
  const [action, setAction] = useState<PairingBidAction | null>("award");
  const [value, setValue] = useState<DeadheadFlyingBid>(initialValue);
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <DeadheadFlyingEditor
        action={action}
        actionOptions={["award", "avoid"]}
        ariaLabel="Deadhead Flying"
        periodCode="Jul 2026"
        periodEndDate="2026-07-31"
        periodStartDate="2026-07-01"
        value={value}
        onActionChange={setAction}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output data-testid="deadhead-flying-payload">
        {JSON.stringify({ action, value, isValid })}
      </output>
    </>
  );
};

describe("DeadheadFlyingEditor", () => {
  it("shows only the two fixed modes and defaults to Any deadhead", () => {
    render(<DeadheadFlyingEditorHarness />);

    expect(screen.getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Any deadhead" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Deadhead-only duty" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("combobox", { name: /deadhead flying/i })).not.toBeInTheDocument();
    expect(screen.queryByText("DEADHEAD LEGS")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" })).not.toBeChecked();
    expect(screen.getByTestId("deadhead-flying-payload")).toHaveTextContent('"isValid":true');
  });

  it("switches to Deadhead-only duty without changing the date scope", async () => {
    const user = userEvent.setup();
    render(<DeadheadFlyingEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Deadhead-only duty" }));

    expect(screen.getByTestId("deadhead-flying-payload")).toHaveTextContent(
      '"value":{"type":"deadhead-flying","mode":"deadhead-only-duty","dateScope":null}',
    );
  });

  it("supports multiple flight dates and date ranges", async () => {
    const user = userEvent.setup();
    render(<DeadheadFlyingEditorHarness />);

    await user.click(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" }));
    expect(screen.getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("deadhead-flying-payload")).toHaveTextContent('"isValid":false');

    await user.click(screen.getByRole("button", { name: "Date Range" }));
    expect(screen.getByTestId("deadhead-flying-payload")).toHaveTextContent(
      '"dateScope":{"mode":"date_range","from":"","to":""}',
    );
  });

  it.each([
    [{ type: "deadhead-flying", mode: "any-deadhead", dateScope: null } satisfies PairingBidValue, true],
    [{
      type: "deadhead-flying",
      mode: "deadhead-only-duty",
      dateScope: { mode: "specific_dates", dates: ["2026-07-03", "2026-07-08"] },
    } satisfies PairingBidValue, true],
    [{
      type: "deadhead-flying",
      mode: "any-deadhead",
      dateScope: { mode: "specific_dates", dates: [] },
    } satisfies PairingBidValue, false],
    [{
      type: "deadhead-flying",
      mode: "any-deadhead",
      dateScope: { mode: "date_range", from: "2026-07-08", to: "2026-07-03" },
    } satisfies PairingBidValue, false],
    [{ type: "stepper", value: 2, min: 0, max: 8, operator: ">" } satisfies PairingBidValue, false],
  ])("validates the strict deadhead flying payload", (bid, expected) => {
    expect(isDeadheadFlyingBidValueValid(bid)).toBe(expected);
  });
});
