import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { PbsPairingAirportOptionsResponse } from "../../../../../packages/contracts/pbs-search-pairings.js";

import { AirportPreferenceEditor } from "@/features/pairing/components/airport-preference-editor";
import type { PairingBidValue } from "@/features/pairing/types";

const airportOptions: PbsPairingAirportOptionsResponse = {
  airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
  airportPreferenceOptions: [
    { code: "YVR", kind: "airport", label: "YVR Vancouver", events: ["landing", "layover"] },
    { code: "YTO", kind: "city", label: "YTO Toronto area", events: ["layover"] },
  ],
  landingAirports: ["YVR"],
  layoverAirports: ["YVR", "YTO"],
  workStartStations: [],
  filterAirports: ["YVR", "YTO"],
};

const AirportPreferenceEditorHarness = () => {
  const [value, setValue] = useState<PairingBidValue>({
    type: "airport-preference",
    event: "landing",
    locations: [],
    dateScope: null,
    minimumLayoverDuration: null,
  });
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <AirportPreferenceEditor
        ariaLabel="Airport Preference"
        options={airportOptions}
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        value={value}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output aria-label="Airport Preference validity">{String(isValid)}</output>
      <output aria-label="Airport Preference value">{JSON.stringify(value)}</output>
    </>
  );
};

describe("AirportPreferenceEditor", () => {
  it("reports invalid until a supported airport or city is selected", async () => {
    const user = userEvent.setup();

    render(<AirportPreferenceEditorHarness />);

    expect(screen.getByRole("button", { name: "Landing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("false");

    await user.click(screen.getByLabelText("Airport Preference airports or cities"));
    await user.click(await screen.findByRole("option", { name: /YVR Vancouver/ }));

    await waitFor(() =>
      expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("true"),
    );
    expect(screen.queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(screen.queryByText("Minimum Required")).not.toBeInTheDocument();
    expect(screen.queryByText("Maximum Required")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Airport Preference value")).not.toHaveTextContent("minimumRequired");
    expect(screen.getByLabelText("Airport Preference value")).not.toHaveTextContent("maximumRequired");
  });

  it("invalidates incomplete event date scopes and removes them when the switch is off", async () => {
    const user = userEvent.setup();

    render(<AirportPreferenceEditorHarness />);

    await user.click(screen.getByLabelText("Airport Preference airports or cities"));
    await user.click(await screen.findByRole("option", { name: /YVR Vancouver/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("true"),
    );

    await user.click(screen.getByRole("switch", { name: "Airport Preference limit to event date" }));

    expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "Open date picker for Airport Preference event dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("true"),
    );

    await user.click(screen.getByRole("switch", { name: "Airport Preference limit to event date" }));

    expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"dateScope":null');
  });

  it("uses a configured slider for preferred layover hours only while that optional switch is enabled", async () => {
    const user = userEvent.setup();

    render(<AirportPreferenceEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Layover" }));
    await user.click(screen.getByLabelText("Airport Preference airports or cities"));
    await user.click(await screen.findByRole("option", { name: /YVR Vancouver/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("true"),
    );

    await user.click(screen.getByRole("switch", { name: "Airport Preference preferred layover hours" }));

    expect(screen.getByLabelText("Airport Preference validity")).toHaveTextContent("true");
    expect(screen.getByLabelText("Airport Preference preferred layover hours value")).toHaveValue("13");
    expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"minimumLayoverDuration":"13:00"');

    fireEvent.change(screen.getByLabelText("Airport Preference preferred layover hours value"), {
      target: { value: "16" },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"minimumLayoverDuration":"16:00"'),
    );

    await user.click(screen.getByRole("switch", { name: "Airport Preference preferred layover hours" }));

    expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"minimumLayoverDuration":null');
  });

  it("shows Both in the UI while preserving landing_or_layover payload and clearing hours on Landing", async () => {
    const user = userEvent.setup();

    render(<AirportPreferenceEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Both" }));
    expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"event":"landing_or_layover"');

    await user.click(screen.getByRole("switch", { name: "Airport Preference preferred layover hours" }));
    expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"minimumLayoverDuration":"13:00"');

    await user.click(screen.getByRole("button", { name: "Landing" }));
    expect(screen.queryByRole("switch", { name: "Airport Preference preferred layover hours" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Airport Preference value")).toHaveTextContent('"minimumLayoverDuration":null');
  });

  it("keeps the parent dialog open and restores trigger focus when Escape closes the portaled listbox", async () => {
    const user = userEvent.setup();

    render(
      <div aria-label="Configure Airport Preference" role="dialog">
        <AirportPreferenceEditorHarness />
      </div>,
    );

    const trigger = screen.getByRole("combobox", { name: "Airport Preference airports or cities" });

    await user.click(trigger);

    const listbox = await screen.findByRole("listbox", { name: "Airport Preference airports or cities options" });
    expect(trigger).toHaveAttribute("aria-controls", listbox.id);
    expect(listbox).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getByRole("option", { name: /YVR Vancouver/ })).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "Airport Preference airports or cities options" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Configure Airport Preference" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
