import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  RedeyePreferenceEditor,
  isRedeyePreferenceBidValueValid,
} from "@/features/pairing/components/redeye-preference-editor";
import type { PairingBidAction, PairingBidValue, RedeyePreferenceBid } from "@/features/pairing/types";

const RedeyePreferenceEditorHarness = () => {
  const [value, setValue] = useState<RedeyePreferenceBid>({
    type: "redeye-preference",
    dateScope: null,
  });
  const [action, setAction] = useState<PairingBidAction | null>("avoid");
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <RedeyePreferenceEditor
        action={action}
        actionOptions={["award", "avoid"]}
        ariaLabel="Redeye Preference"
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        redeyeConfig={{
          available: true,
          startTime: "03:30",
          endTime: "05:30",
          crossesMidnight: false,
          version: "03:30|05:30",
        }}
        value={value}
        onActionChange={setAction}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output data-testid="redeye-preference-payload">
        {JSON.stringify({ action, value, isValid })}
      </output>
    </>
  );
};

describe("RedeyePreferenceEditor", () => {
  it("shows the company definition and keeps the flight-date limit off by default", () => {
    render(<RedeyePreferenceEditorHarness />);

    expect(screen.getByRole("note", { name: "Redeye Preference redeye definition" })).toHaveTextContent(
      "03:30–05:30 local time",
    );
    expect(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"action":"avoid"');
    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"dateScope":null');
    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"isValid":true');
  });

  it("selects multiple flight dates and clears them when disabling the limit", async () => {
    const user = userEvent.setup();

    render(<RedeyePreferenceEditorHarness />);

    await user.click(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" }));
    expect(screen.getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"isValid":false');

    await user.click(screen.getByRole("button", { name: "Open date picker for Redeye Preference flight dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-18" }));

    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent(
      '"dateScope":{"mode":"specific_dates","dates":["2026-06-03","2026-06-18"]}',
    );
    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"isValid":true');

    await user.click(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" }));

    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"dateScope":null');
    expect(screen.getByTestId("redeye-preference-payload")).toHaveTextContent('"isValid":true');
  });

  it.each([
    [{ type: "redeye-preference", dateScope: null } satisfies PairingBidValue, true],
    [{ type: "flag" } satisfies PairingBidValue, false],
    [{ type: "redeye-preference", dateScope: { mode: "specific_dates", dates: [] } } satisfies PairingBidValue, false],
    [{ type: "redeye-preference", dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] } } satisfies PairingBidValue, true],
    [{ type: "redeye-preference", dateScope: { mode: "date_range", from: "2026-06-18", to: "2026-06-03" } } satisfies PairingBidValue, false],
    [{ type: "redeye-preference", dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" } } satisfies PairingBidValue, true],
  ])("validates its dedicated bid payload", (bid, expected) => {
    expect(isRedeyePreferenceBidValueValid(bid)).toBe(expected);
  });
});
