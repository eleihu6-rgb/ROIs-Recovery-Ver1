import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  PairingLengthEditor,
  isPairingLengthBidValueValid,
} from "@/features/pairing/components/pairing-length-editor";
import type { PairingBidAction, PairingBidValue, PairingLengthBid } from "@/features/pairing/types";

const EMPTY_PAIRING_LENGTH_BID: PairingLengthBid = {
  type: "pairing-length-preference",
  minDays: null,
  maxDays: null,
  dateScope: null,
  min: 1,
  max: 7,
};

const PairingLengthEditorHarness = () => {
  const [value, setValue] = useState<PairingLengthBid>(EMPTY_PAIRING_LENGTH_BID);
  const [action, setAction] = useState<PairingBidAction | null>("award");
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <PairingLengthEditor
        action={action}
        actionOptions={["award", "avoid"]}
        ariaLabel="Pairing Length"
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        value={value}
        onActionChange={setAction}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output data-testid="pairing-length-payload">
        {JSON.stringify({ action, value, isValid })}
      </output>
    </>
  );
};

describe("PairingLengthEditor", () => {
  it("builds a pairing length preference with multiple specific pairing start dates", async () => {
    const user = userEvent.setup();

    render(<PairingLengthEditorHarness />);

    expect(screen.getByRole("button", { name: "Award" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: "LIMIT TO PAIRING START DATE" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("PAIRING LENGTH")).not.toBeInTheDocument();

    await user.type(screen.getByRole("spinbutton", { name: "Pairing Length minimum days" }), "1");
    await user.type(screen.getByRole("spinbutton", { name: "Pairing Length maximum days" }), "3");
    await user.click(screen.getByRole("button", { name: "Avoid" }));
    await user.click(screen.getByRole("switch", { name: "LIMIT TO PAIRING START DATE" }));
    expect(screen.getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Date Range" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Open date picker for Pairing Length pairing start dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-18" }));

    expect(screen.getByTestId("pairing-length-payload")).toHaveTextContent(JSON.stringify({
      action: "avoid",
      value: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
        min: 1,
        max: 7,
      },
      isValid: true,
    }));
  });

  it("switches the pairing start-date limit to a date range and clears specific dates", async () => {
    const user = userEvent.setup();

    render(<PairingLengthEditorHarness />);

    await user.type(screen.getByRole("spinbutton", { name: "Pairing Length minimum days" }), "1");
    await user.type(screen.getByRole("spinbutton", { name: "Pairing Length maximum days" }), "3");
    await user.click(screen.getByRole("switch", { name: "LIMIT TO PAIRING START DATE" }));
    await user.click(screen.getByRole("button", { name: "Open date picker for Pairing Length pairing start dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));
    await user.click(screen.getByRole("button", { name: "Date Range" }));

    expect(screen.getByTestId("pairing-length-payload")).toHaveTextContent(
      '"dateScope":{"mode":"date_range","from":"","to":""}',
    );

    await user.click(screen.getByRole("button", { name: "Open date picker for Pairing Length pairing start date range" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-10" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-20" }));

    expect(screen.getByTestId("pairing-length-payload")).toHaveTextContent(
      '"dateScope":{"mode":"date_range","from":"2026-06-10","to":"2026-06-20"}',
    );
  });

  it("rehydrates legacy stepper-range values as min and max days", () => {
    render(
      <PairingLengthEditor
        action="award"
        actionOptions={["award", "avoid"]}
        ariaLabel="Pairing Length"
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        value={{ type: "stepper-range", from: 2, to: 4, min: 1, max: 7 }}
        onActionChange={vi.fn()}
        onChange={vi.fn()}
        onValidityChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("spinbutton", { name: "Pairing Length minimum days" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "Pairing Length maximum days" })).toHaveValue(4);
    expect(screen.queryByText("Between")).not.toBeInTheDocument();
  });

  it.each([
    [{ type: "stepper", value: 3, min: 1, max: 7 } satisfies PairingBidValue],
    [{ type: "stepper-range", from: 1, to: 3, min: 1, max: 7 } satisfies PairingBidValue],
    [EMPTY_PAIRING_LENGTH_BID],
  ])("validates legacy and new pairing length payloads", (bid) => {
    expect(isPairingLengthBidValueValid(bid)).toBe(bid !== EMPTY_PAIRING_LENGTH_BID);
  });
});
