import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { PbsPreferOffConfig } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { PreferOffEditor } from "@/features/days-off/components/prefer-off-editor";
import {
  createPreferOffEditorValue,
  getPreferOffEditorResult,
  type PreferOffEditorValue,
} from "@/features/days-off/components/prefer-off-editor-value";
import type { RuleBidAvailableProperty } from "@/features/rule-bids/types";

const preferOffConfig: PbsPreferOffConfig = {
  weekdays: [
    { code: "MON", name: "Monday", order: 1, isoDay: 1 },
    { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
    { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
    { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
  ],
  weekend: {
    available: true,
    startDayCode: "SAT",
    startDayName: "Saturday",
    startTime: "00:00",
    endDayCode: "SUN",
    endDayName: "Sunday",
    endTime: "24:00",
  },
};

const emptyProperty: RuleBidAvailableProperty = {
  id: "available-201",
  propertyCode: 201,
  name: "Prefer Off",
  favorited: false,
  bid: { type: "tag-list", values: [], suggestions: [] },
  tiers: [{ key: "t1", label: "T1", active: true }],
};

test("createPreferOffEditorValue defaults a new bid to Specific Dates and ignores legacy flexible quantity fields", () => {
  const empty = createPreferOffEditorValue(emptyProperty, preferOffConfig);
  const legacy = createPreferOffEditorValue({
    ...emptyProperty,
    bid: { type: "tag-list", values: ["Monday"], suggestions: [] },
    allOrNothing: false,
    minimumN: 2,
    maximumN: null,
  }, preferOffConfig);

  expect(empty.mode).toBe("specific_dates");
  expect(legacy.mode).toBe("days_of_week");
  expect(legacy.weekdays).toEqual(["Monday"]);
});

test("getPreferOffEditorResult forces one selected period to All and rejects overnight time windows", () => {
  const single: PreferOffEditorValue = {
    mode: "specific_dates",
    specificDates: ["2026-04-10"],
    rangeFrom: "",
    rangeTo: "",
    weekdays: [],
    timeWindowEnabled: false,
    timeFrom: "18:00",
    timeTo: "23:59",
  };
  const overnight = { ...single, timeWindowEnabled: true, timeFrom: "23:00", timeTo: "02:00" };

  expect(getPreferOffEditorResult(single, "2026-04-01", "2026-04-30", preferOffConfig)).toMatchObject({
    allOrNothing: true,
    minimumN: null,
    maximumN: null,
    isValid: true,
  });
  expect(getPreferOffEditorResult(
    overnight,
    "2026-04-01",
    "2026-04-30",
    preferOffConfig,
  ).isValid).toBe(false);
});

test("PreferOffEditor hides fulfilment controls for multiple selected periods", async () => {
  const user = userEvent.setup();
  const initialValue: PreferOffEditorValue = {
    mode: "days_of_week",
    specificDates: [],
    rangeFrom: "",
    rangeTo: "",
    weekdays: ["Monday"],
    timeWindowEnabled: false,
    timeFrom: "18:00",
    timeTo: "23:59",
  };
  const Harness = () => {
    const [value, setValue] = useState(initialValue);
    return (
      <PreferOffEditor
        periodCode="Apr 2026"
        periodEndDate="2026-04-30"
        periodStartDate="2026-04-01"
        preferOffConfig={preferOffConfig}
        value={value}
        onChange={setValue}
      />
    );
  };

  render(<Harness />);

  expect(screen.queryByText("FULFILMENT")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Flexible quantity" })).not.toBeInTheDocument();
  expect(screen.queryByText("Minimum required")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Friday" }));

  expect(screen.queryByText("FULFILMENT")).not.toBeInTheDocument();
  expect(screen.queryByText("Maximum required")).not.toBeInTheDocument();
});

test("PreferOffEditor disables Weekend mode when F8 dictionary configuration is incomplete", () => {
  const value = createPreferOffEditorValue(emptyProperty, preferOffConfig);

  render(
    <PreferOffEditor
      periodCode="Apr 2026"
      periodEndDate="2026-04-30"
      periodStartDate="2026-04-01"
      preferOffConfig={{ ...preferOffConfig, weekend: { available: false } }}
      value={value}
      onChange={() => undefined}
    />,
  );

  expect(screen.getByRole("button", { name: "Weekends" })).toBeDisabled();
});

test("PreferOffEditor shows a period count for Current and a recurring label for Standing weekends", () => {
  const weekendValue: PreferOffEditorValue = {
    mode: "weekends",
    specificDates: [],
    rangeFrom: "",
    rangeTo: "",
    weekdays: [],
    timeWindowEnabled: false,
    timeFrom: "18:00",
    timeTo: "23:59",
  };
  const { rerender } = render(
    <PreferOffEditor
      periodCode="Apr 2026"
      periodEndDate="2026-04-30"
      periodStartDate="2026-04-01"
      preferOffConfig={preferOffConfig}
      value={weekendValue}
      onChange={() => undefined}
    />,
  );

  expect(screen.getByText((_, element) =>
    element?.tagName === "SPAN" && element.textContent === "4 weekends")).toBeInTheDocument();

  rerender(
    <PreferOffEditor
      dialogContext="standing"
      periodCode="STANDING"
      preferOffConfig={preferOffConfig}
      value={weekendValue}
      onChange={() => undefined}
    />,
  );

  expect(screen.getByText("Every weekend")).toBeInTheDocument();
  expect(screen.queryByText("0 weekends")).not.toBeInTheDocument();
});

test("PreferOffEditor hides absolute dates but keeps recurring modes and time windows in Standing", async () => {
  const user = userEvent.setup();
  const initialValue: PreferOffEditorValue = {
    mode: "days_of_week",
    specificDates: [],
    rangeFrom: "",
    rangeTo: "",
    weekdays: ["Monday"],
    timeWindowEnabled: false,
    timeFrom: "08:00",
    timeTo: "18:00",
  };
  const Harness = () => {
    const [value, setValue] = useState(initialValue);

    return (
      <PreferOffEditor
        dialogContext="standing"
        periodCode="STANDING"
        preferOffConfig={preferOffConfig}
        value={value}
        onChange={setValue}
      />
    );
  };

  render(<Harness />);

  expect(screen.queryByRole("button", { name: "Specific Dates" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Date Range" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Days of Week" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Weekends" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Friday" }));
  expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Friday" })).toHaveAttribute("aria-pressed", "true");

  await user.click(screen.getByRole("switch", { name: "Prefer Off time window" }));
  expect(screen.getByLabelText("Prefer Off time from")).toBeEnabled();
  expect(screen.getByLabelText("Prefer Off time to")).toBeEnabled();
});

test("PreferOffEditor clears hidden mode and time-window fields when switching controls", async () => {
  const user = userEvent.setup();
  const initialValue: PreferOffEditorValue = {
    mode: "specific_dates",
    specificDates: ["2026-04-10"],
    rangeFrom: "2026-04-01",
    rangeTo: "2026-04-03",
    weekdays: ["Monday"],
    timeWindowEnabled: true,
    timeFrom: "08:00",
    timeTo: "18:00",
  };
  const Harness = () => {
    const [value, setValue] = useState(initialValue);
    return (
      <>
        <PreferOffEditor
          periodCode="Apr 2026"
          periodEndDate="2026-04-30"
          periodStartDate="2026-04-01"
          preferOffConfig={preferOffConfig}
          value={value}
          onChange={setValue}
        />
        <output aria-label="Prefer Off editor value">{JSON.stringify(value)}</output>
      </>
    );
  };

  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Date Range" }));

  expect(screen.getByLabelText("Prefer Off editor value")).toHaveTextContent('"specificDates":[]');
  expect(screen.getByLabelText("Prefer Off editor value")).toHaveTextContent('"weekdays":[]');

  await user.click(screen.getByRole("switch", { name: "Prefer Off time window" }));

  expect(screen.queryByLabelText("Prefer Off time from")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Prefer Off editor value")).toHaveTextContent('"timeWindowEnabled":false');
  expect(screen.getByLabelText("Prefer Off editor value")).toHaveTextContent('"timeFrom":"18:00"');
  expect(screen.getByLabelText("Prefer Off editor value")).toHaveTextContent('"timeTo":"23:59"');
});
