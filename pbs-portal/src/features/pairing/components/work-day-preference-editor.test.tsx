import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { WorkDayPreferenceEditor } from "@/features/pairing/components/work-day-preference-editor";
import type { WorkDayPreferenceBid } from "@/features/pairing/types";

const WorkDayPreferenceEditorHarness = ({
  disableEventDateScope = false,
  initialValue,
}: {
  disableEventDateScope?: boolean;
  initialValue?: WorkDayPreferenceBid;
}) => {
  const [value, setValue] = useState<WorkDayPreferenceBid>(initialValue ?? {
    type: "work-day-preference",
    days: [],
    dateScope: null,
  });
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <WorkDayPreferenceEditor
        ariaLabel="Work Day Preference"
        disableEventDateScope={disableEventDateScope}
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        value={value}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output aria-label="Work Day Preference validity">{String(isValid)}</output>
    </>
  );
};

describe("WorkDayPreferenceEditor", () => {
  it("keeps weekday multi-select and check-in windows while hiding absolute dates in Standing", async () => {
    const user = userEvent.setup();

    render(<WorkDayPreferenceEditorHarness disableEventDateScope />);

    expect(screen.queryByRole("switch", {
      name: "Work Day Preference limit to event date",
    })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Wed" }));
    await user.click(screen.getByRole("button", { name: "Fri" }));

    expect(screen.getByRole("button", { name: "Wed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Fri" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Work Day Preference Wed check-in from")).toBeEnabled();
    expect(screen.getByLabelText("Work Day Preference Fri check-in from")).toBeEnabled();
  });

  it("allows selected weekdays with optional check-in windows", async () => {
    const user = userEvent.setup();
    render(<WorkDayPreferenceEditorHarness />);

    expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("false");
    expect(screen.getByRole("switch", { name: "Work Day Preference limit to event date" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Mon" }));

    expect(screen.getByLabelText("Work Day Preference Mon check-in from")).toHaveValue("");
    expect(screen.getByLabelText("Work Day Preference Mon check-in to")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));

    fireEvent.change(screen.getByLabelText("Work Day Preference Mon check-in from"), { target: { value: "06:00" } });
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));

    fireEvent.change(screen.getByLabelText("Work Day Preference Mon check-in to"), { target: { value: "10:00" } });
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));
  });

  it("keeps independent weekday windows, rejects equal endpoints, and permits overnight windows", async () => {
    const user = userEvent.setup();
    render(<WorkDayPreferenceEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Mon" }));
    await user.click(screen.getByRole("button", { name: "Wed" }));

    const mondayFrom = screen.getByLabelText("Work Day Preference Mon check-in from");
    const mondayTo = screen.getByLabelText("Work Day Preference Mon check-in to");
    fireEvent.change(mondayFrom, { target: { value: "22:00" } });
    fireEvent.change(mondayTo, { target: { value: "22:00" } });
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("false"));

    fireEvent.change(mondayTo, { target: { value: "04:00" } });
    expect(screen.getByLabelText("Work Day Preference Wed check-in from")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));

    await user.click(screen.getByRole("button", { name: "Mon" }));
    expect(screen.queryByLabelText("Work Day Preference Mon check-in from")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Work Day Preference Wed check-in from")).toHaveValue("");
  });

  it("does not mark missing optional times invalid and rejects equal endpoints after touch", async () => {
    const user = userEvent.setup();
    render(<WorkDayPreferenceEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Thu" }));
    const fromInput = screen.getByLabelText("Work Day Preference Thu check-in from");
    const toInput = screen.getByLabelText("Work Day Preference Thu check-in to");

    expect(fromInput).toHaveAttribute("aria-invalid", "false");
    expect(toInput).toHaveAttribute("aria-invalid", "false");

    await user.click(fromInput);
    await user.tab();
    expect(fromInput).toHaveAttribute("aria-invalid", "false");
    expect(toInput).toHaveAttribute("aria-invalid", "false");

    fireEvent.change(fromInput, { target: { value: "15:00" } });
    fireEvent.change(toInput, { target: { value: "15:00" } });
    fireEvent.blur(toInput);
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("false"));
    expect(fromInput).toHaveAttribute("aria-invalid", "true");
    expect(toInput).toHaveAttribute("aria-invalid", "true");
  });

  it("uses the shared optional event-date scope and rehydrates a date range", async () => {
    const user = userEvent.setup();
    render(
      <WorkDayPreferenceEditorHarness
        initialValue={{
          type: "work-day-preference",
          days: [{ dayOfWeek: "TUE", checkInFrom: "06:00", checkInTo: "10:00" }],
          dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-08" },
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Date Range" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2026-06-03")).toBeInTheDocument();
    expect(screen.getByText("2026-06-08")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Selected dates do not match the selected work days.");
    expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("false");

    await user.click(screen.getByRole("switch", { name: "Work Day Preference limit to event date" }));
    expect(screen.queryByRole("button", { name: "Date Range" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));
  });

  it("rejects specific dates with no selected work-day intersection and recovers when a matching day is selected", async () => {
    const user = userEvent.setup();
    render(
      <WorkDayPreferenceEditorHarness
        initialValue={{
          type: "work-day-preference",
          days: [{ dayOfWeek: "TUE", checkInFrom: "15:35", checkInTo: "19:35" }],
          dateScope: { mode: "specific_dates", dates: ["2026-07-01"] },
        }}
      />,
    );

    const dateScopeGroup = screen.getByRole("group", { name: "Work Day Preference event date scope" });
    const alert = screen.getByRole("alert");

    expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("false");
    expect(alert).toHaveTextContent("Selected dates do not match the selected work days.");
    expect(dateScopeGroup).toHaveAttribute("aria-describedby", alert.id);

    await user.click(screen.getByRole("button", { name: "Tue" }));
    await user.click(screen.getByRole("button", { name: "Wed" }));
    fireEvent.change(screen.getByLabelText("Work Day Preference Wed check-in from"), { target: { value: "15:35" } });
    fireEvent.change(screen.getByLabelText("Work Day Preference Wed check-in to"), { target: { value: "19:35" } });

    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(dateScopeGroup).not.toHaveAttribute("aria-describedby");
  });

  it("accepts specific dates when at least one date matches a selected work day", async () => {
    render(
      <WorkDayPreferenceEditorHarness
        initialValue={{
          type: "work-day-preference",
          days: [{ dayOfWeek: "TUE", checkInFrom: "15:35", checkInTo: "19:35" }],
          dateScope: { mode: "specific_dates", dates: ["2026-06-30", "2026-07-01"] },
        }}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires a short date range to contain at least one selected work day", async () => {
    const { unmount } = render(
      <WorkDayPreferenceEditorHarness
        initialValue={{
          type: "work-day-preference",
          days: [{ dayOfWeek: "TUE", checkInFrom: "15:35", checkInTo: "19:35" }],
          dateScope: { mode: "date_range", from: "2026-07-01", to: "2026-07-05" },
        }}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("false"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    unmount();
    render(
      <WorkDayPreferenceEditorHarness
        initialValue={{
          type: "work-day-preference",
          days: [{ dayOfWeek: "TUE", checkInFrom: "15:35", checkInTo: "19:35" }],
          dateScope: { mode: "date_range", from: "2026-07-01", to: "2026-07-07" },
        }}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Work Day Preference validity")).toHaveTextContent("true"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
