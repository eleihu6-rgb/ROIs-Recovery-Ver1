import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ReactElement } from "react";

import {
  FlightNumberPreferenceEditor,
  isFlightNumberPreferenceBidValueValid,
} from "@/features/pairing/components/flight-number-preference-editor";
import type { FlightNumberPreferenceBid, PairingBidAction, PairingBidValue } from "@/features/pairing/types";

const renderWithQueryClient = (ui: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
};

const FlightNumberPreferenceEditorHarness = () => {
  const [value, setValue] = useState<FlightNumberPreferenceBid>({
    type: "flight-number-preference",
    flightNumbers: ["0601"],
    dateScope: null,
  });
  const [action, setAction] = useState<PairingBidAction | null>("award");
  const [isValid, setIsValid] = useState(false);

  return (
    <>
      <FlightNumberPreferenceEditor
        action={action}
        actionOptions={["award", "avoid"]}
        ariaLabel="Flight Number Preference"
        periodCode="Jun 2026"
        periodEndDate="2026-06-30"
        periodStartDate="2026-06-01"
        value={value}
        onActionChange={setAction}
        onChange={setValue}
        onValidityChange={setIsValid}
      />
      <output data-testid="flight-number-preference-payload">
        {JSON.stringify({ action, value, isValid })}
      </output>
    </>
  );
};

describe("FlightNumberPreferenceEditor", () => {
  it("removes matching-flight bounds and keeps the flight-date limit off by default", () => {
    render(<FlightNumberPreferenceEditorHarness />);

    expect(screen.queryByText("MATCHING FLIGHTS")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Flight Number Preference type" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Charter" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Positioning Flights - Charter Network" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Recovery Flights - Charter Network" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent(
      '"value":{"type":"flight-number-preference","flightNumbers":["0601"],"dateScope":null}',
    );
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent('"isValid":true');
  });

  it("keeps the main preference fields on one visual width system", () => {
    render(<FlightNumberPreferenceEditorHarness />);

    const fieldShells = screen.getAllByTestId("flight-number-preference-field-shell");
    expect(fieldShells).toHaveLength(3);
    fieldShells.forEach((fieldShell) => {
      expect(fieldShell).toHaveClass("w-full");
      expect(fieldShell).toHaveClass("max-w-xl");
    });

    expect(screen.getByRole("button", { name: "Award" }).closest("[data-testid='flight-number-preference-field-shell']"))
      .toBe(fieldShells[0]);
    expect(screen.getByRole("combobox", { name: "Flight Number Preference type" }).closest("[data-testid='flight-number-preference-field-shell']"))
      .toBe(fieldShells[1]);
    expect(screen.getByLabelText("Flight Number Preference flight numbers").closest("[data-testid='flight-number-preference-field-shell']"))
      .toBe(fieldShells[2]);
  });

  it("selects multiple specific flight dates and clears them when switching to a range", async () => {
    const user = userEvent.setup();
    render(<FlightNumberPreferenceEditorHarness />);

    await user.click(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" }));
    expect(screen.getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent('"isValid":false');

    await user.click(screen.getByRole("button", { name: "Open date picker for Flight Number Preference flight dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-18" }));

    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent(
      '"dateScope":{"mode":"specific_dates","dates":["2026-06-03","2026-06-18"]}',
    );
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent('"isValid":true');

    await user.click(screen.getByRole("button", { name: "Date Range" }));
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent(
      '"dateScope":{"mode":"date_range","from":"","to":""}',
    );
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent('"isValid":false');
  });

  it("clears the date scope when the flight-date limit is disabled", async () => {
    const user = userEvent.setup();
    render(<FlightNumberPreferenceEditorHarness />);

    await user.click(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" }));
    await user.click(screen.getByRole("button", { name: "Open date picker for Flight Number Preference flight dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-06-03" }));
    await user.click(screen.getByRole("switch", { name: "LIMIT TO FLIGHT DATE" }));

    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent('"dateScope":null');
    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent('"isValid":true');
  });

  it("filters autocomplete by a clearable type without saving the type in the bid payload", async () => {
    const user = userEvent.setup();
    const search = vi.fn(async (
      _query: string,
      options?: { type?: "charter" | "positioning-charter-network" | "recovery-charter-network" },
    ) => [
      {
        value: options?.type === "charter"
          ? "7001"
          : options?.type === "positioning-charter-network" ? "9900" : "0601",
        label: options?.type === "charter"
          ? "7001"
          : options?.type === "positioning-charter-network" ? "9900" : "0601",
      },
    ]);

    const Harness = () => {
      const [value, setValue] = useState<FlightNumberPreferenceBid>({
        type: "flight-number-preference",
        flightNumbers: [],
        dateScope: null,
      });

      return (
        <>
          <FlightNumberPreferenceEditor
            action="award"
            actionOptions={["award", "avoid"]}
            ariaLabel="Flight Number Preference"
            autocomplete={{
              queryKey: ["test", "flight-numbers"],
              placeholder: "Search Flight Number",
              emptyLabel: "No matching Flight Number",
              errorLabel: "Unable to load Flight Numbers",
              loadingLabel: "Loading Flight Numbers...",
              minQueryLength: 1,
              debounceMs: 0,
              allowCustomTokens: false,
              search,
            }}
            periodCode="Jun 2026"
            periodEndDate="2026-06-30"
            periodStartDate="2026-06-01"
            value={value}
            onActionChange={() => undefined}
            onChange={setValue}
            onValidityChange={() => undefined}
          />
          <output data-testid="flight-number-preference-payload">
            {JSON.stringify(value)}
          </output>
        </>
      );
    };

    renderWithQueryClient(<Harness />);

    const typeSelect = screen.getByRole("combobox", { name: "Flight Number Preference type" });
    const flightNumberInput = screen.getByLabelText("Flight Number Preference flight numbers");

    expect(typeSelect).toHaveValue("");

    await user.selectOptions(typeSelect, "charter");
    await user.type(flightNumberInput, "70");

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("70", { type: "charter" });
    });

    await user.click(within(await screen.findByTestId("pairing-tag-list-autocomplete")).getByRole("button"));
    expect(screen.getByText("7001")).toBeInTheDocument();

    await user.selectOptions(typeSelect, "positioning-charter-network");
    expect(screen.getByText("7001")).toBeInTheDocument();
    await user.type(flightNumberInput, "99");

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("99", { type: "positioning-charter-network" });
    });

    await user.clear(flightNumberInput);
    await user.click(screen.getByRole("button", { name: "Clear Flight Number Preference type" }));
    expect(typeSelect).toHaveValue("");
    expect(screen.getByText("7001")).toBeInTheDocument();
    await user.type(flightNumberInput, "06");

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("06", undefined);
    });

    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent(
      '"flightNumbers":["7001"]',
    );
    expect(screen.getByTestId("flight-number-preference-payload")).not.toHaveTextContent("charter");
    expect(screen.getByTestId("flight-number-preference-payload")).not.toHaveTextContent("positioning-charter-network");
  });

  it("does not add raw typed text as a flight number when Enter is pressed", async () => {
    const user = userEvent.setup();
    const search = vi.fn(async () => []);

    const Harness = () => {
      const [value, setValue] = useState<FlightNumberPreferenceBid>({
        type: "flight-number-preference",
        flightNumbers: [],
        dateScope: null,
      });

      return (
        <>
          <FlightNumberPreferenceEditor
            action="award"
            actionOptions={["award", "avoid"]}
            ariaLabel="Flight Number Preference"
            autocomplete={{
              queryKey: ["test", "flight-numbers", "no-custom"],
              placeholder: "Search Flight Number",
              emptyLabel: "No matching Flight Number",
              errorLabel: "Unable to load Flight Numbers",
              loadingLabel: "Loading Flight Numbers...",
              minQueryLength: 1,
              debounceMs: 0,
              allowCustomTokens: false,
              search,
            }}
            periodCode="Jun 2026"
            periodEndDate="2026-06-30"
            periodStartDate="2026-06-01"
            value={value}
            onActionChange={() => undefined}
            onChange={setValue}
            onValidityChange={() => undefined}
          />
          <output data-testid="flight-number-preference-payload">
            {JSON.stringify(value)}
          </output>
        </>
      );
    };

    renderWithQueryClient(<Harness />);

    const flightNumberInput = screen.getByLabelText("Flight Number Preference flight numbers");
    await user.type(flightNumberInput, "7{Enter}");

    expect(screen.getByTestId("flight-number-preference-payload")).toHaveTextContent(
      '"flightNumbers":[]',
    );
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it.each([
    [{ type: "flight-number-preference", flightNumbers: [], dateScope: null } satisfies PairingBidValue, false],
    [{ type: "flight-number-preference", flightNumbers: ["0601"], dateScope: null } satisfies PairingBidValue, true],
    [{ type: "flight-number-preference", flightNumbers: ["0601"], dateScope: { mode: "specific_dates", dates: [] } } satisfies PairingBidValue, false],
    [{ type: "flight-number-preference", flightNumbers: ["0601"], dateScope: { mode: "date_range", from: "2026-06-18", to: "2026-06-03" } } satisfies PairingBidValue, false],
    [{ type: "flight-number-preference", flightNumbers: ["0601"], dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" } } satisfies PairingBidValue, true],
  ])("validates its dedicated bid payload", (bid, expected) => {
    expect(isFlightNumberPreferenceBidValueValid(bid)).toBe(expected);
  });
});
