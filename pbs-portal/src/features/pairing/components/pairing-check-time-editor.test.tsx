import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { PairingCheckTimeEditor } from "@/features/pairing/components/pairing-check-time-editor";
import type { PairingBidValue } from "@/features/pairing/types";

const PairingCheckTimeEditorHarness = () => {
  const [value, setValue] = useState<PairingBidValue>({
    type: "pairing-check-time",
    timeType: "check_in",
    operator: "Between",
    from: "",
    to: "",
    dateScope: null,
  });
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <PairingCheckTimeEditor
        ariaLabel="Pairing Check-In / Check-Out Time"
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        value={value}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output aria-label="Pairing Check-In / Check-Out Time validity">{String(isValid)}</output>
      <output aria-label="Pairing Check-In / Check-Out Time value">{JSON.stringify(value)}</output>
    </>
  );
};

describe("PairingCheckTimeEditor", () => {
  it("groups quick time ranges in a lightly styled strip below the main time inputs", () => {
    render(<PairingCheckTimeEditorHarness />);

    expect(screen.getByRole("group", {
      name: "Pairing Check-In / Check-Out Time quick time ranges",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AM 03:00–11:00" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reports invalid until a complete time value is selected", async () => {
    const user = userEvent.setup();

    render(<PairingCheckTimeEditorHarness />);

    expect(screen.getByRole("button", { name: "Check-In" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time operator")).toHaveValue("Between");
    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "PM 14:00–22:00" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("true"),
    );
  });

  it("uses the optional event-date switch and supports multiple specific dates", async () => {
    const user = userEvent.setup();

    render(<PairingCheckTimeEditorHarness />);

    await user.click(screen.getByRole("button", { name: "AM 03:00–11:00" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("true"),
    );

    const dateLimit = screen.getByRole("switch", {
      name: "Pairing Check-In / Check-Out Time limit to event date",
    });
    expect(dateLimit).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: "Specific Dates" })).not.toBeInTheDocument();

    await user.click(dateLimit);

    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("false");
    expect(screen.getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", {
      name: "Open date picker for Pairing Check-In / Check-Out Time event dates",
    }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-05" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("true"),
    );
    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time value"))
      .toHaveTextContent('"dateScope":{"mode":"specific_dates","dates":["2026-06-03","2026-06-05"]}');

    await user.click(dateLimit);

    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time value")).toHaveTextContent('"dateScope":null');
  });

  it("switches the event-date limit to a date range", async () => {
    const user = userEvent.setup();

    render(<PairingCheckTimeEditorHarness />);

    await user.click(screen.getByRole("button", { name: "AM 03:00–11:00" }));
    await user.click(screen.getByRole("switch", {
      name: "Pairing Check-In / Check-Out Time limit to event date",
    }));
    await user.click(screen.getByRole("button", { name: "Date Range" }));

    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", {
      name: "Open date picker for Pairing Check-In / Check-Out Time event date range",
    }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-10" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-20" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Pairing Check-In / Check-Out Time validity")).toHaveTextContent("true"),
    );
    expect(screen.getByLabelText("Pairing Check-In / Check-Out Time value"))
      .toHaveTextContent('"dateScope":{"mode":"date_range","from":"2026-06-10","to":"2026-06-20"}');
  });
});
