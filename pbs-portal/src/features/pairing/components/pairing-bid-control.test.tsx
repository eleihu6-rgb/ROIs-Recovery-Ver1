import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AppProviders } from "@/app/providers/app-providers";
import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import type { PairingBidValue } from "@/features/pairing/types";
import { queryClient } from "@/shared/query/query-client";
import { pbsUserService } from "@/shared/services/pbs-user-service";

vi.mock("@/shared/services/pbs-user-service", () => ({
  pbsUserService: {
    searchCrewOptions: vi.fn(),
  },
}));

describe("PairingBidControl", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(pbsUserService.searchCrewOptions).mockReset();
    queryClient.clear();
  });

  it("renders structured bid summaries in read-only mode", () => {
    render(
      <div className="space-y-3">
        <PairingBidControl
          ariaLabel="Prefer Pairing Length on Date summary"
          bid={{ type: "stepper-date", value: 2, date: "2025-12-24", min: 1, max: 7 }}
          readOnly
        />
        <PairingBidControl
          ariaLabel="Report Between on Date summary"
          bid={{ type: "time-range-date", from: "18:30", to: "23:30", date: "2025-12-25" }}
          readOnly
        />
        <PairingBidControl
          ariaLabel="Layover at City on Date summary"
          bid={{ type: "tag-list-date", values: ["ATL", "YYZ"], date: "2025-12-24" }}
          readOnly
        />
        <PairingBidControl
          ariaLabel="Credit Per Time Away From Base summary"
          bid={{ type: "percent-or-duration", unit: "percent", value: "75", operator: ">" }}
          readOnly
        />
        <PairingBidControl
          ariaLabel="Airport Preference summary"
          bid={{
            type: "airport-preference",
            event: "layover",
            locations: [{ code: "YYZ", kind: "airport" }],
            dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
            minimumLayoverDuration: "12:00",
          }}
          readOnly
        />
      </div>,
    );

    expect(screen.getByLabelText("Prefer Pairing Length on Date summary")).toHaveTextContent("2 on 2025-12-24");
    expect(screen.getByLabelText("Report Between on Date summary")).toHaveTextContent(
      "Between 18:30 - 23:30 on 2025-12-25",
    );
    expect(screen.getByLabelText("Layover at City on Date summary")).toHaveTextContent("ATL, YYZ on 2025-12-24");
    expect(screen.getByLabelText("Credit Per Time Away From Base summary")).toHaveTextContent("> 75%");
    expect(screen.getByLabelText("Airport Preference summary")).toHaveTextContent(
      "Layover YYZ · Date Range 2026-06-15 - 2026-06-21 · Minimum layover 12:00",
    );
  });

  it("updates stepper-date values through number and date controls", async () => {
    const handleChange = vi.fn();

    const { rerender } = render(
      <PairingBidControl
        ariaLabel="Edit Prefer Pairing Length on Date"
        bid={{ type: "stepper-date", value: 2, date: "2025-12-24", min: 1, max: 7 }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit Prefer Pairing Length on Date operator"), {
      target: { value: "Between" },
    });
    expect(handleChange).toHaveBeenCalledWith({
      type: "stepper-range-date",
      from: 2,
      to: 2,
      date: "2025-12-24",
      min: 1,
      max: 7,
    });

    rerender(
      <PairingBidControl
        ariaLabel="Edit Prefer Pairing Length on Date"
        bid={{ type: "stepper-date", value: 2, date: "2025-12-24", min: 1, max: 7 }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit Prefer Pairing Length on Date"), {
      target: { value: "4" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "stepper-date",
      value: 4,
      date: "2025-12-24",
      min: 1,
      max: 7,
    });

    const dateInput = screen.getByLabelText("Edit Prefer Pairing Length on Date date");
    expect(dateInput).toHaveAttribute("type", "text");
    expect(dateInput).toHaveAttribute("placeholder", "YYYY-MM-DD");

    fireEvent.change(dateInput, {
      target: { value: "2025-12-29" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "stepper-date",
      value: 2,
      date: "2025-12-29",
      min: 1,
      max: 7,
    });
  });

  it("can render an explicit empty operator selection before the user chooses one", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleOperatorChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Flight Legs per Duty"
        bid={{ type: "stepper", value: 1, min: 1, max: 8 }}
        operatorOptions={["=", "<", ">"]}
        operatorPlaceholder="--"
        operatorValue={null}
        onChange={handleChange}
        onOperatorChange={handleOperatorChange}
      />,
    );

    const operatorSelect = screen.getByLabelText("Edit Flight Legs per Duty operator");

    expect(operatorSelect).toHaveValue("");
    await user.selectOptions(operatorSelect, "=");

    expect(handleOperatorChange).toHaveBeenCalledWith("=");
    expect(handleChange).toHaveBeenCalledWith({
      type: "stepper",
      value: 1,
      min: 1,
      max: 8,
      operator: "=",
    });
  });

  it("updates stepper date range values", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Long Stretch Off / Compressed Flying"
        bid={{
          type: "stepper-date-range",
          value: 2,
          from: "2026-05-01",
          to: "2026-05-07",
          min: 1,
          max: 14,
        }}
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit Long Stretch Off / Compressed Flying consecutive days"), {
      target: { value: "4" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "stepper-date-range",
      value: 4,
      from: "2026-05-01",
      to: "2026-05-07",
      min: 1,
      max: 14,
    });

    fireEvent.change(screen.getByLabelText("Edit Long Stretch Off / Compressed Flying to"), {
      target: { value: "2026-05-10" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "stepper-date-range",
      value: 2,
      from: "2026-05-01",
      to: "2026-05-10",
      min: 1,
      max: 14,
    });
  });

  it("updates days off / days on pattern fields", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Days Off / Days On Pattern"
        bid={{
          type: "days-off-on-pattern",
          minDaysOff: 3,
          minDaysOn: 3,
          maxDaysOn: 5,
          min: 1,
          max: 14,
        }}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText("WORK DAYS MIN")).toBeInTheDocument();
    expect(screen.getByText("WORK DAYS MAX")).toBeInTheDocument();
    expect(screen.getByText("DAYS OFF")).toBeInTheDocument();
    expect(screen.getByText("Work 3-5 days, then 3 days off")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Edit Days Off / Days On Pattern min days on"), {
      target: { value: "4" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "days-off-on-pattern",
      minDaysOff: 3,
      minDaysOn: 4,
      maxDaysOn: 5,
      min: 1,
      max: 14,
    });

    fireEvent.change(screen.getByLabelText("Edit Days Off / Days On Pattern max days on"), {
      target: { value: "6" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "days-off-on-pattern",
      minDaysOff: 3,
      minDaysOn: 3,
      maxDaysOn: 6,
      min: 1,
      max: 14,
    });

    fireEvent.change(screen.getByLabelText("Edit Days Off / Days On Pattern minimum days off"), {
      target: { value: "5" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "days-off-on-pattern",
      minDaysOff: 5,
      minDaysOn: 3,
      maxDaysOn: 5,
      min: 1,
      max: 14,
    });
  });

  it("updates shared days off employee values", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Shared Days Off With Employee"
        bid={{
          type: "crew-days-off-share",
          employeeNumber: "19",
          minimumDays: 4,
          min: 1,
        }}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText("Employee Number")).toBeInTheDocument();
    expect(screen.getByText("Minimum shared days")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Edit Shared Days Off With Employee employee number"), {
      target: { value: "817" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "crew-days-off-share",
      employeeNumber: "817",
      minimumDays: 4,
      min: 1,
    });

    fireEvent.change(screen.getByLabelText("Edit Shared Days Off With Employee minimum shared days"), {
      target: { value: "12" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "crew-days-off-share",
      employeeNumber: "19",
      minimumDays: 12,
      min: 1,
    });
  });

  it("keeps selected crew when clicking the crew field again", () => {
    const handleChange = vi.fn();

    render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit Employee Schedule Preference"
          bid={{
            type: "employee-schedule-preference",
            crewId: "762",
            crewName: "Carolyn Susan Ann Alves",
            relationship: "together",
            scheduleType: "days_off",
            thresholdType: "minimum",
            days: 8,
            min: 1,
            max: 31,
          }}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Carolyn Susan Ann Alves")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("employee-schedule-crew-combobox").firstElementChild as Element);
    fireEvent.click(screen.getByLabelText("Edit Employee Schedule Preference crew"));
    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Carolyn Susan Ann Alves")).toBeInTheDocument();
    expect(screen.getByText("762")).toBeInTheDocument();
  });

  it("updates employee schedule preference crew and choices", async () => {
    const handleChange = vi.fn();

    vi.mocked(pbsUserService.searchCrewOptions).mockResolvedValue({
      query: "DIA",
      limit: 20,
      options: [
        {
          value: "817",
          label: "Diana Crew",
          crewId: "817",
          userName: "Diana Crew",
          userCode: "diana.crew",
          base: "YEG",
          rank: "FA",
          division: "C",
        },
      ],
    });

    render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit Employee Schedule Preference"
          bid={{
            type: "employee-schedule-preference",
            crewId: "762",
            crewName: "Carolyn Susan Ann Alves",
            relationship: "together",
            scheduleType: "days_off",
            thresholdType: "minimum",
            days: 8,
            min: 1,
            max: 31,
          }}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Crew")).toBeInTheDocument();
    expect(screen.getByText("Carolyn Susan Ann Alves")).toBeInTheDocument();
    expect(screen.getByText("Relationship")).toBeInTheDocument();
    expect(screen.getByText("Schedule Type")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Edit Employee Schedule Preference crew"), {
      target: { value: "dia" },
    });
    const crewOption = await screen.findByRole("option", { name: /Diana Crew/i });
    fireEvent.click(crewOption);
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "employee-schedule-preference",
      crewId: "817",
      crewName: "Diana Crew",
      relationship: "together",
      scheduleType: "days_off",
      thresholdType: "minimum",
      days: 8,
      min: 1,
      max: 31,
    });

    fireEvent.click(screen.getByRole("button", { name: "Apart" }));
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "employee-schedule-preference",
      crewId: "762",
      crewName: "Carolyn Susan Ann Alves",
      relationship: "apart",
      scheduleType: "days_off",
      thresholdType: "minimum",
      days: 8,
      min: 1,
      max: 31,
    });

    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "employee-schedule-preference",
      crewId: "762",
      crewName: "Carolyn Susan Ann Alves",
      relationship: "together",
      scheduleType: "work",
      thresholdType: "minimum",
      days: 8,
      min: 1,
      max: 31,
    });

    fireEvent.change(screen.getByLabelText("Edit Employee Schedule Preference threshold operator"), {
      target: { value: "maximum" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "employee-schedule-preference",
      crewId: "762",
      crewName: "Carolyn Susan Ann Alves",
      relationship: "together",
      scheduleType: "days_off",
      thresholdType: "maximum",
      days: 8,
      min: 1,
      max: 31,
    });

    fireEvent.change(screen.getByLabelText("Edit Employee Schedule Preference days"), {
      target: { value: "12" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "employee-schedule-preference",
      crewId: "762",
      crewName: "Carolyn Susan Ann Alves",
      relationship: "together",
      scheduleType: "days_off",
      thresholdType: "minimum",
      days: 12,
      min: 1,
      max: 31,
    });
  });

  it("switches time bids between compare and between modes", () => {
    const handleChange = vi.fn();

    const { rerender } = render(
      <PairingBidControl
        ariaLabel="Edit Report Between"
        bid={{ type: "time-range", from: "09:00", to: "18:30" }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit Report Between operator"), {
      target: { value: ">" },
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time",
      value: "09:00",
      operator: ">",
    });

    rerender(
      <PairingBidControl
        ariaLabel="Edit Report Between"
        bid={{ type: "time", value: "09:00", operator: ">" }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit Report Between operator"), {
      target: { value: "Between" },
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-range",
      from: "09:00",
      to: "09:00",
    });
  });

  it("edits pairing total credit with duration controls", () => {
    const handleChange = vi.fn();

    const { rerender } = render(
      <PairingBidControl
        ariaLabel="Edit Pairing Total Credit"
        bid={{ type: "duration", value: "08:00" }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByLabelText("Edit Pairing Total Credit")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Edit Pairing Total Credit")).toHaveAttribute("placeholder", "HH:MM");
    expect(screen.getByLabelText("Edit Pairing Total Credit")).not.toHaveAttribute("inputmode");

    fireEvent.change(screen.getByLabelText("Edit Pairing Total Credit"), {
      target: { value: "s12:30x" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "duration",
      value: "12:30",
    });

    fireEvent.blur(screen.getByLabelText("Edit Pairing Total Credit"));
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "duration",
      value: "08:00",
    });

    fireEvent.change(screen.getByLabelText("Edit Pairing Total Credit operator"), {
      target: { value: "Between" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "duration-range",
      from: "08:00",
      to: "08:00",
    });

    rerender(
      <PairingBidControl
        ariaLabel="Edit Pairing Total Credit"
        bid={{ type: "duration-range", from: "08:00", to: "12:30" }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit Pairing Total Credit to"), {
      target: { value: "112:30" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "duration-range",
      from: "08:00",
      to: "112:30",
    });
  });

  it("edits average daily credit with duration controls and operator", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Average Daily Credit"
        bid={{ type: "duration", value: "005:30", operator: ">" }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByLabelText("Edit Average Daily Credit operator")).toHaveValue(">");
    expect(screen.getByLabelText("Edit Average Daily Credit")).toHaveAttribute("placeholder", "HH:MM");

    fireEvent.change(screen.getByLabelText("Edit Average Daily Credit operator"), {
      target: { value: "Between" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "duration-range",
      from: "005:30",
      to: "005:30",
    });
  });

  it("edits TAFB with duration controls without equals operator", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit TAFB"
        bid={{ type: "duration", value: "020:00", operator: ">" }}
        operatorOptions={["<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByLabelText("Edit TAFB operator")).toHaveValue(">");
    expect(screen.queryByRole("option", { name: "=" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit TAFB")).toHaveAttribute("placeholder", "HH:MM");

    fireEvent.change(screen.getByLabelText("Edit TAFB operator"), {
      target: { value: "Between" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "duration-range",
      from: "020:00",
      to: "020:00",
    });
  });

  it("edits credit per time away from base with unit switching", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Credit Per Time Away From Base"
        bid={{ type: "percent-or-duration", unit: "percent", value: "75", operator: ">" }}
        operatorOptions={["<", ">"]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByLabelText("Edit Credit Per Time Away From Base operator")).toHaveValue(">");
    expect(screen.getByLabelText("Edit Credit Per Time Away From Base unit")).toHaveValue("percent");
    expect(screen.getByLabelText("Edit Credit Per Time Away From Base")).toHaveAttribute("type", "number");

    fireEvent.change(screen.getByLabelText("Edit Credit Per Time Away From Base unit"), {
      target: { value: "duration" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "percent-or-duration",
      unit: "duration",
      value: "",
      operator: ">",
    });
  });

  it("edits any/every enroute check-in time with Between support", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Any/Every Enroute Check-In Time"
        bid={{ type: "time", value: "06:00", operator: "=" }}
        operatorOptions={["=", "<", ">", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByLabelText("Edit Any/Every Enroute Check-In Time operator")).toHaveValue("=");

    fireEvent.change(screen.getByLabelText("Edit Any/Every Enroute Check-In Time operator"), {
      target: { value: "Between" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-range",
      from: "06:00",
      to: "06:00",
    });
  });

  it("edits any/every enroute check-out time with less-than and Between support", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Any/Every Enroute Check-Out Time"
        bid={{ type: "time", value: "22:30", operator: "<" }}
        operatorOptions={["<", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByLabelText("Edit Any/Every Enroute Check-Out Time operator")).toHaveValue("<");

    fireEvent.change(screen.getByLabelText("Edit Any/Every Enroute Check-Out Time operator"), {
      target: { value: "Between" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-range",
      from: "22:30",
      to: "22:30",
    });
  });

  it("edits one generic time condition per dialog", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const { rerender } = render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit time condition"
          bid={{ type: "time-condition-list", conditions: [] }}
          operatorOptions={["=", "<", ">", "Between"]}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: "ADD" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Edit time condition operator"), "Between");
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-condition-list",
      conditions: [{ operator: "Between", from: "", to: "" }],
    });

    rerender(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit time condition"
          bid={{ type: "time-condition-list", conditions: [{ operator: "Between", from: "", to: "" }] }}
          operatorOptions={["=", "<", ">", "Between"]}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    fireEvent.change(screen.getByLabelText("Edit time condition from"), {
      target: { value: "10:00" },
    });
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-condition-list",
      conditions: [{ operator: "Between", from: "10:00", to: "" }],
    });

    rerender(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit time condition"
          bid={{ type: "time-condition-list", conditions: [{ operator: "Between", from: "10:00", to: "" }] }}
          operatorOptions={["=", "<", ">", "Between"]}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    fireEvent.change(screen.getByLabelText("Edit time condition to"), {
      target: { value: "11:00" },
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-condition-list",
      conditions: [{ operator: "Between", from: "10:00", to: "11:00" }],
    });

    rerender(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit time condition"
          bid={{ type: "time-condition-list", conditions: [{ operator: "Between", from: "10:00", to: "11:00" }] }}
          operatorOptions={["=", "<", ">", "Between"]}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    await user.selectOptions(screen.getByLabelText("Edit time condition operator"), ">");
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-condition-list",
      conditions: [{ operator: ">", value: "10:00" }],
    });

    rerender(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit time condition"
          bid={{ type: "time-condition-list", conditions: [{ operator: ">", value: "10:00" }] }}
          operatorOptions={["=", "<", ">", "Between"]}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    fireEvent.change(screen.getByLabelText("Edit time condition"), {
      target: { value: "13:00" },
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "time-condition-list",
      conditions: [{ operator: ">", value: "13:00" }],
    });
  });

  it("supports token editing for tag-list bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Prefer Aircraft"
        bid={{
          type: "tag-list",
          values: ["A321"],
          suggestions: ["A319", "A321", "B737"],
        }}
        onChange={handleChange}
      />,
    );

    await user.type(screen.getByLabelText("Edit Prefer Aircraft"), "b787{enter}");
    expect(handleChange).toHaveBeenLastCalledWith({
      type: "tag-list",
      values: ["A321", "B787"],
      suggestions: ["A319", "A321", "B737"],
    });
  });

  it("uses work start station options without mixing landing or layover airports", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        airportOptionGroup="work-start"
        airportOptions={{
          airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
          airportPreferenceOptions: [],
          landingAirports: ["CUN"],
          layoverAirports: ["YHZ"],
          workStartStations: ["YVR"],
          filterAirports: ["CUN", "YHZ", "YVR"],
        }}
        ariaLabel="Edit Work Start Station"
        bid={{
          type: "tag-list",
          values: [],
        }}
        onChange={handleChange}
      />,
    );

    fireEvent.pointerDown(screen.getByTestId("pairing-airport-combobox"));

    expect(screen.getByLabelText("Filter stations")).toBeInTheDocument();
    expect(screen.getByText("Work Start")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "YVR" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "CUN" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "YHZ" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "YVR" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "tag-list",
      values: ["YVR"],
    });
  });

  it("closes the scaled airport listbox from an option without closing its parent dialog", () => {
    const handleChange = vi.fn();

    render(
      <div aria-label="Configure Work Start Station" role="dialog">
        <PairingBidControl
          airportOptionGroup="work-start"
          airportOptions={{
            airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
            airportPreferenceOptions: [],
            landingAirports: [],
            layoverAirports: [],
            workStartStations: ["YVR", "YYZ"],
            filterAirports: ["YVR", "YYZ"],
          }}
          ariaLabel="Edit Work Start Station"
          bid={{ type: "tag-list", values: [] }}
          onChange={handleChange}
        />
      </div>,
    );

    const trigger = screen.getByRole("combobox", { name: "Edit Work Start Station" });
    fireEvent.pointerDown(trigger);

    const listbox = screen.getByRole("listbox", { name: "Edit Work Start Station options" });
    const option = screen.getByRole("option", { name: "YVR" });

    expect(trigger).toHaveAttribute("aria-controls", listbox.id);
    expect(listbox).toHaveAttribute("aria-multiselectable", "true");
    expect(option).toHaveAttribute("aria-selected", "false");

    option.focus();
    fireEvent.keyDown(option, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Edit Work Start Station options" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Configure Work Start Station" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("builds airport preference bids without fulfilment fields", async () => {
    const user = userEvent.setup();
    const AirportPreferenceHarness = () => {
      const [bid, setBid] = useState<PairingBidValue>({
        type: "airport-preference",
        event: "landing",
        locations: [],
        dateScope: null,
        minimumLayoverDuration: null,
      });

      return (
        <>
          <PairingBidControl
            airportOptions={{
              airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
              airportPreferenceOptions: [
                { code: "YYZ", kind: "airport", label: "YYZ · Toronto Pearson", events: ["landing", "layover"] },
                { code: "YTO", kind: "city", label: "YTO", events: ["layover"] },
              ],
              landingAirports: ["YVR"],
              layoverAirports: ["YYZ"],
              workStartStations: [],
              filterAirports: ["YVR", "YYZ"],
            }}
            ariaLabel="Edit Airport Preference"
            bid={bid}
            onChange={setBid}
          />
          <output data-testid="airport-preference-json">{JSON.stringify(bid)}</output>
        </>
      );
    };

    render(<AirportPreferenceHarness />);

    await user.click(screen.getByRole("button", { name: "Layover" }));
    fireEvent.pointerDown(screen.getByLabelText("Edit Airport Preference airports or cities"));
    expect(screen.getByRole("option", { name: /YYZ · Toronto Pearson/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /YTO/i })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /YYZ · Toronto Pearson/i }));
    expect(screen.queryByText("FULFILMENT")).not.toBeInTheDocument();

    expect(JSON.parse(screen.getByTestId("airport-preference-json").textContent ?? "{}")).toEqual({
      type: "airport-preference",
      event: "layover",
      locations: [{ code: "YYZ", kind: "airport" }],
      dateScope: null,
      minimumLayoverDuration: null,
    });

    await user.click(screen.getByRole("button", { name: "Both" }));

    expect(JSON.parse(screen.getByTestId("airport-preference-json").textContent ?? "{}")).toEqual({
      type: "airport-preference",
      event: "landing_or_layover",
      locations: [{ code: "YYZ", kind: "airport" }],
      dateScope: null,
      minimumLayoverDuration: null,
    });
  });

  it("does not commit tag-list tokens while an IME composition is active", () => {
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Layover at City"
        bid={{
          type: "tag-list",
          values: [],
        }}
        onChange={handleChange}
      />,
    );

    const input = screen.getByLabelText("Edit Layover at City");

    fireEvent.change(input, { target: { value: "北京" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", isComposing: true });

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("keeps comma token commits working for tag-list bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Layover at City"
        bid={{
          type: "tag-list",
          values: [],
        }}
        onChange={handleChange}
      />,
    );

    await user.type(screen.getByLabelText("Edit Layover at City"), "yyz,");

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "tag-list",
      values: ["YYZ"],
      suggestions: undefined,
    });
  });

  it("supports date and day selection for date-or-dow bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Departing On"
        bid={{
          type: "date-or-dow-list",
          dates: ["2026-04-03"],
          daysOfWeek: ["MON"],
        }}
        onChange={handleChange}
      />,
    );

    expect(screen.queryByPlaceholderText(/code/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Edit Departing On date"), {
      target: { value: "2026-04-10" },
    });
    await user.click(screen.getByRole("button", { name: "Add Date" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-or-dow-list",
      dates: ["2026-04-03", "2026-04-10"],
      daysOfWeek: ["MON"],
    });

    await user.click(screen.getByRole("button", { name: "Tue" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-or-dow-list",
      dates: ["2026-04-03"],
      daysOfWeek: ["MON", "TUE"],
    });
  });

  it("uses date-or-dow controls for duty on date or day bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit date or day condition"
        bid={{
          type: "date-or-dow-list",
          dates: [],
          daysOfWeek: [],
        }}
        operatorOptions={["In", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.queryByPlaceholderText(/code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit date or day condition operator")).toHaveValue("In");

    await user.click(screen.getByRole("button", { name: "Fri" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: ["FRI"],
    });
  });

  it("uses date-or-dow controls for layover on date or day bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Any/Every Layover On Date / Day"
        bid={{
          type: "date-or-dow-list",
          dates: [],
          daysOfWeek: [],
        }}
        operatorOptions={["In", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.queryByPlaceholderText(/code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit Any/Every Layover On Date / Day operator")).toHaveValue("In");

    await user.click(screen.getByRole("button", { name: "Sat" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: ["SAT"],
    });
  });

  it("uses date-or-dow controls for enroute check-in date or day bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Any/Every Enroute Check-In Date / Day"
        bid={{
          type: "date-or-dow-list",
          dates: [],
          daysOfWeek: [],
        }}
        operatorOptions={["In", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.queryByPlaceholderText(/code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit Any/Every Enroute Check-In Date / Day operator")).toHaveValue("In");

    await user.click(screen.getByRole("button", { name: "Thu" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: ["THU"],
    });
  });

  it("uses date-or-dow controls for enroute check-out date or day bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Any/Every Enroute Check-Out Date / Day"
        bid={{
          type: "date-or-dow-list",
          dates: [],
          daysOfWeek: [],
        }}
        operatorOptions={["In", "Between"]}
        onChange={handleChange}
      />,
    );

    expect(screen.queryByPlaceholderText(/code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit Any/Every Enroute Check-Out Date / Day operator")).toHaveValue("In");

    await user.click(screen.getByRole("button", { name: "Sun" }));

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: ["SUN"],
    });
  });

  it("switches date-or-dow bids to date ranges for Between", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PairingBidControl
        ariaLabel="Edit Departing On"
        bid={{
          type: "date-or-dow-list",
          dates: ["2026-04-03"],
          daysOfWeek: [],
        }}
        operatorOptions={["In", "Between"]}
        onChange={handleChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Edit Departing On operator"), "Between");

    expect(handleChange).toHaveBeenLastCalledWith({
      type: "date-range",
      from: "2026-04-03",
      to: "2026-04-03",
    });
  });

  it("debounces pairing number autocomplete searches and adds selected options", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const search = vi.fn(async () => [
      {
        value: "4959",
        label: "M4959 (2026-02-24 - 2026-03-02)",
        pairingId: "4959",
        pairingLabel: "M4959",
        startDate: "2026-02-24",
        endDate: "2026-03-02",
      },
    ]);

    render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit Pairing Number"
          bid={{
            type: "pairing-id-list",
            pairingIds: [],
            pairingLabels: [],
          }}
          tagListAutocomplete={{
            queryKey: ["test", "pairing-ids"],
            placeholder: "Search Pairing Number",
            emptyLabel: "No matching Pairing Number",
            errorLabel: "Unable to load Pairing Numbers",
            loadingLabel: "Loading Pairing Numbers...",
            minQueryLength: 1,
            debounceMs: 20,
            search,
          }}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText("Edit Pairing Number"), "m49");

    await waitFor(() => expect(search).toHaveBeenCalledWith("m49"));

    await user.click(await screen.findByRole("button", { name: /M4959/ }));

    expect(handleChange).toHaveBeenCalledWith({
      type: "pairing-id-list",
      pairingIds: ["4959"],
      pairingLabels: ["M4959"],
    });
  });

  it("renders selected pairing number labels while keeping pairing ids as pairingIds", () => {
    render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit Pairing Number"
          bid={{
            type: "pairing-id-list",
            pairingIds: ["11962"],
            pairingLabels: ["YYZ/GDL/YYZ"],
          }}
          onChange={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("YYZ/GDL/YYZ")).toBeInTheDocument();
    expect(screen.queryByText("11962")).not.toBeInTheDocument();
  });

  it("adds crew id autocomplete selections for leg employee number bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const search = vi.fn(async () => [
      {
        value: "5510",
        label: "5510 - Peter Adams",
        crewId: "5510",
        firstName: "Peter",
        lastName: "Adams",
      },
    ]);

    render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit Any/Every Leg With Employee Number"
          bid={{
            type: "tag-list",
            values: [],
          }}
          tagListAutocomplete={{
            queryKey: ["test", "crew-ids"],
            placeholder: "Search Employee Number",
            emptyLabel: "No matching Employee Number",
            errorLabel: "Unable to load Employee Numbers",
            loadingLabel: "Loading Employee Numbers...",
            minQueryLength: 1,
            debounceMs: 20,
            search,
          }}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText("Edit Any/Every Leg With Employee Number"), "pet");
    await user.click(await screen.findByRole("button", { name: /5510 - Peter Adams/ }));

    expect(handleChange).toHaveBeenCalledWith({
      type: "tag-list",
      values: ["5510"],
      suggestions: undefined,
    });
  });

  it("adds flight number autocomplete selections for any flight number bids", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const search = vi.fn(async () => [
      {
        value: "1993",
        label: "1993",
      },
    ]);

    render(
      <AppProviders>
        <PairingBidControl
          ariaLabel="Edit Any Flight Number"
          bid={{
            type: "tag-list",
            values: [],
          }}
          tagListAutocomplete={{
            queryKey: ["test", "flight-numbers"],
            placeholder: "Search Flight Number",
            emptyLabel: "No matching Flight Number",
            errorLabel: "Unable to load Flight Numbers",
            loadingLabel: "Loading Flight Numbers...",
            minQueryLength: 1,
            debounceMs: 20,
            search,
          }}
          onChange={handleChange}
        />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText("Edit Any Flight Number"), "19");
    await user.click(await screen.findByRole("button", { name: /1993/ }));

    expect(handleChange).toHaveBeenCalledWith({
      type: "tag-list",
      values: ["1993"],
      suggestions: undefined,
    });
  });

  it("renders any leg is redeye as an enabled flag without value controls", () => {
    render(
      <PairingBidControl
        ariaLabel="Edit Any Leg Is Redeye"
        bid={{ type: "flag" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Edit Any Leg Is Redeye")).toHaveTextContent("Enabled");
    expect(screen.queryByLabelText("Edit Any Leg Is Redeye operator")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit Any Leg Is Redeye" })).not.toBeInTheDocument();
  });

  it("renders Redeye Preference as a read-only dedicated summary outside the config dialog", () => {
    render(
      <PairingBidControl
        ariaLabel="Edit Redeye Preference"
        bid={{
          type: "redeye-preference",
          dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Edit Redeye Preference")).toHaveTextContent("Redeye · between 2026-06-03 - 2026-06-18");
    expect(screen.queryByLabelText("Edit Redeye Preference operator")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit Redeye Preference" })).not.toBeInTheDocument();
  });

  it("renders Month-End Carryover as a read-only dedicated summary outside the config dialog", () => {
    render(
      <PairingBidControl
        ariaLabel="Edit Month-End Carryover"
        bid={{
          type: "month-end-carryover",
          operator: "Between",
          from: 2,
          to: 4,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Edit Month-End Carryover")).toHaveTextContent("Carryover between 2 - 4 days");
    expect(screen.queryByLabelText("Edit Month-End Carryover operator")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit Month-End Carryover" })).not.toBeInTheDocument();
  });

  it("renders Deadhead Flying as a read-only dedicated summary outside the config dialog", () => {
    render(
      <PairingBidControl
        ariaLabel="Edit Deadhead Flying"
        bid={{
          type: "deadhead-flying",
          mode: "deadhead-only-duty",
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Edit Deadhead Flying")).toHaveTextContent("Deadhead-only duty");
    expect(screen.queryByLabelText("Edit Deadhead Flying operator")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit Deadhead Flying" })).not.toBeInTheDocument();
  });
});
