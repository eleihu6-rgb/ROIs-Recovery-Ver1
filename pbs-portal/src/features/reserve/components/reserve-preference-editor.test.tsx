import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  isReservePreferenceValueComplete,
  ReservePreferenceEditor,
  type ReservePreferenceValue,
} from "@/features/reserve/components/reserve-preference-editor";

const buildValue = (
  dateScope: ReservePreferenceValue["dateScope"] = { mode: "whole_month" },
): ReservePreferenceValue => ({
  type: "reserve-call-type-date-scope",
  callType: "PRAM",
  options: ["CRAM", "CRPM", "PRAM"],
  dateScope,
});

const EditorHarness = ({
  initialValue,
  periodCode = "May 2026",
  periodEndDate = "2026-05-31",
  periodStartDate = "2026-05-01",
}: {
  initialValue: ReservePreferenceValue;
  periodCode?: string;
  periodEndDate?: string;
  periodStartDate?: string;
}) => {
  const [value, setValue] = useState(initialValue);

  return (
    <>
      <ReservePreferenceEditor
        ariaLabel="Reserve Preference"
        disabled={false}
        periodCode={periodCode}
        periodEndDate={periodEndDate}
        periodStartDate={periodStartDate}
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
};

describe("ReservePreferenceEditor", () => {
  it("keeps the three non-date scopes complete without changing their payload shape", () => {
    expect(isReservePreferenceValueComplete(
      buildValue({ mode: "whole_month" }),
      "2026-05-01",
      "2026-05-31",
    )).toBe(true);
    expect(isReservePreferenceValueComplete(
      buildValue({ mode: "first_half" }),
      "2026-05-01",
      "2026-05-31",
    )).toBe(true);
    expect(isReservePreferenceValueComplete(
      buildValue({ mode: "second_half" }),
      "2026-05-01",
      "2026-05-31",
    )).toBe(true);
  });

  it("uses one range picker and keeps date-only strings in the ReserveDateScope payload", async () => {
    const user = userEvent.setup();

    render(<EditorHarness initialValue={buildValue({ mode: "date_range", from: "", to: "" })} />);

    expect(screen.getByText("Start date")).toBeInTheDocument();
    expect(screen.getByText("End date")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open date picker for Reserve Preference date range" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Open date picker for Reserve Preference date range" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-05-03" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-05-15" }));

    expect(screen.getByTestId("value")).toHaveTextContent(
      '"dateScope":{"mode":"date_range","from":"2026-05-03","to":"2026-05-15"}',
    );
  });

  it("preserves and reports a saved out-of-period date instead of filtering it", () => {
    const value = buildValue({ mode: "specific_dates", dates: ["2026-04-30", "2026-05-02"] });

    render(<EditorHarness initialValue={value} />);

    expect(screen.getByText("2026-04-30")).toBeInTheDocument();
    expect(screen.getByText("2026-05-02")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Saved dates outside this bid period: 2026-04-30");
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(value));
    expect(isReservePreferenceValueComplete(value, "2026-05-01", "2026-05-31")).toBe(false);
  });

  it("blocks completion when the bid period is unavailable", () => {
    const value = buildValue();

    render(<EditorHarness initialValue={value} periodCode="" periodEndDate="" periodStartDate="" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Bid period is unavailable");
    expect(isReservePreferenceValueComplete(value, "", "")).toBe(false);
  });

  it("blocks completion when no reserve call types are configured for the crew type", () => {
    const value: ReservePreferenceValue = {
      ...buildValue(),
      callType: "",
      options: [],
    };

    render(<EditorHarness initialValue={value} />);

    expect(screen.getByRole("combobox", { name: "Reserve Preference short-call type" })).toBeDisabled();
    expect(screen.getByText("No reserve call types are configured for your crew type.")).toBeInTheDocument();
    expect(isReservePreferenceValueComplete(value, "2026-05-01", "2026-05-31")).toBe(false);
  });
});
