import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { formatPairingBidValue } from "@/features/pairing/pairing-bid-summary";
import { AirportPreferenceControl } from "@/features/pairing/components/pairing-airport-preference-control";
import { DateOrDowListControl } from "@/features/pairing/components/pairing-bid-date-or-dow-control";
import {
  CrewDaysOffShareControl,
  DaysOffOnPatternControl,
  EmployeeSchedulePreferenceControl,
} from "@/features/pairing/components/pairing-bid-special-controls";
import { StepperBidControl } from "@/features/pairing/components/pairing-bid-stepper-controls";
import { AirportMultiSelect } from "@/features/pairing/components/pairing-bid-airport-select";
import { TagListControl } from "@/features/pairing/components/pairing-bid-tag-list-control";
import { TimeValueBidControl } from "@/features/pairing/components/pairing-bid-time-value-controls";
import {
  BidDateInput,
  BidTextInput,
  ControlRow,
  PAIRING_BID_CONTROL_CLASS,
} from "@/features/pairing/components/pairing-bid-control-inputs";
import type {
  PairingBidAutocompleteConfig,
  PairingBidOperator,
  PairingBidValue,
} from "@/features/pairing/types";
import type { PbsPairingAirportOptionsResponse } from "../../../../../packages/contracts/pbs-search-pairings.js";
import {
  inferPairingBidOperator,
  transformPairingBidForOperator,
} from "@/features/pairing/pairing-bid-control-logic";

type PairingBidControlProps = {
  bid: PairingBidValue;
  ariaLabel: string;
  readOnly?: boolean;
  operatorValue?: PairingBidOperator | null;
  operatorOptions?: PairingBidOperator[];
  operatorPlaceholder?: string;
  selectPlaceholder?: string;
  summaryPrefix?: string | null;
  tagListAutocomplete?: PairingBidAutocompleteConfig;
  tagListPlaceholder?: string;
  airportOptionGroup?: "landing-layover" | "work-start";
  airportOptions?: PbsPairingAirportOptionsResponse;
  onChange?: (value: PairingBidValue) => void;
  onOperatorChange?: (value: PairingBidOperator) => void;
};

const READ_ONLY_CLASS =
  "flex h-[30px] items-center overflow-hidden rounded-xl border border-[#cfd6e4] bg-[#f8f9fc] px-[10px] text-sm font-medium leading-4 text-[#6f7485] whitespace-nowrap text-ellipsis";

export const PairingBidControl = ({
  bid,
  ariaLabel,
  readOnly = false,
  operatorValue,
  operatorOptions,
  operatorPlaceholder,
  selectPlaceholder = "--",
  summaryPrefix,
  tagListAutocomplete,
  tagListPlaceholder = "",
  airportOptionGroup = "landing-layover",
  airportOptions,
  onChange,
  onOperatorChange,
}: PairingBidControlProps) => {
  const handleChange = (value: PairingBidValue) => {
    onChange?.(value);
  };

  if (readOnly) {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {summaryPrefix ? `${summaryPrefix} · ${formatPairingBidValue(bid)}` : formatPairingBidValue(bid)}
      </div>
    );
  }

  const currentOperator = operatorValue === undefined ? inferPairingBidOperator(bid) : operatorValue;
  const operatorShell = operatorOptions && operatorOptions.length > 0 ? (
    <div className="relative w-[112px]">
      <select
        aria-label={`${ariaLabel} operator`}
        className={`${PAIRING_BID_CONTROL_CLASS} w-full appearance-none pr-8`}
        value={currentOperator ?? ""}
        onChange={(event) => {
          const nextOperator = event.target.value as PairingBidOperator;

          onOperatorChange?.(nextOperator);
          handleChange(transformPairingBidForOperator(bid, nextOperator));
        }}
      >
        {currentOperator === null ? (
          <option disabled value="">
            {operatorPlaceholder ?? selectPlaceholder}
          </option>
        ) : null}
        {operatorOptions.map((option) => (
          <option key={`${ariaLabel}-operator-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-[8px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8392]" />
    </div>
  ) : null;

  if (bid.type === "flag") {
    return (
      <div
        aria-label={ariaLabel}
        className="inline-flex h-[30px] items-center rounded-full border border-[#d8dde6] bg-[#f8f9fc] px-3 text-xs font-semibold text-[#6f7485]"
      >
        Enabled
      </div>
    );
  }

  if (bid.type === "date") {
    return (
      <ControlRow>
        {operatorShell}
        <BidDateInput
          ariaLabel={ariaLabel}
          value={bid.value}
          onValueChange={(value) => handleChange({ ...bid, value })}
        />
      </ControlRow>
    );
  }

  if (bid.type === "stepper") {
    return (
      <StepperBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "stepper-range") {
    return (
      <StepperBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "stepper-date") {
    return (
      <StepperBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "stepper-range-date") {
    return (
      <StepperBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "stepper-date-range") {
    return (
      <StepperBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "days-off-on-pattern") {
    return (
      <DaysOffOnPatternControl
        ariaLabel={ariaLabel}
        bid={bid}
        onChange={(value) => handleChange(value)}
      />
    );
  }

  if (bid.type === "credit-density-preference") {
    return (
      <div
        aria-label={ariaLabel}
        className="flex min-h-[30px] w-full items-center overflow-hidden rounded-full border border-[#d7ddea] bg-[#f9fafc] px-[14px] text-sm font-medium leading-[18px] text-[#6f7485]"
        title={`Min credit ${bid.minimumTotalCredit}, max working days ${bid.maximumWorkingDays}, strength ${bid.strength}`}
      >
        <span className="min-w-0 truncate">
          {`Min credit ${bid.minimumTotalCredit}, max working days ${bid.maximumWorkingDays}, strength ${bid.strength}`}
        </span>
      </div>
    );
  }

  if (bid.type === "crew-days-off-share") {
    return (
      <CrewDaysOffShareControl
        ariaLabel={ariaLabel}
        bid={bid}
        onChange={(value) => handleChange(value)}
      />
    );
  }

  if (bid.type === "employee-schedule-preference") {
    return (
      <EmployeeSchedulePreferenceControl
        ariaLabel={ariaLabel}
        bid={bid}
        onChange={(value) => handleChange(value)}
      />
    );
  }

  if (bid.type === "time") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "time-range") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "duration") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "duration-range") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "time-condition-list") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "time-date") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "time-range-date") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "date-range") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "date-or-dow-list") {
    return (
      <div className="space-y-3">
        {operatorShell}
        <DateOrDowListControl
          ariaLabel={ariaLabel}
          bid={bid}
          onChange={(value) => handleChange(value)}
        />
      </div>
    );
  }

  if (bid.type === "airport-preference") {
    return (
      <AirportPreferenceControl
        airportOptions={airportOptions}
        ariaLabel={ariaLabel}
        bid={bid}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "tag-list" || bid.type === "tag-list-date" || bid.type === "pairing-id-list") {
    return (
      <div className="space-y-3">
        {operatorShell}
        {bid.type === "tag-list" && airportOptions ? (
          <AirportMultiSelect
            ariaLabel={ariaLabel}
            bid={bid}
            optionGroup={airportOptionGroup}
            options={airportOptions}
            onChange={(value) => handleChange(value)}
          />
        ) : (
          <TagListControl
            ariaLabel={ariaLabel}
            autocomplete={tagListAutocomplete}
            bid={bid}
            placeholder={tagListPlaceholder}
            onChange={(value) => handleChange(value)}
          />
        )}
      </div>
    );
  }

  if (bid.type === "select") {
    return (
      <div className="relative w-[164px]">
        <select
          aria-label={ariaLabel}
          className={`${PAIRING_BID_CONTROL_CLASS} w-full appearance-none pr-8`}
          value={bid.value}
          onChange={(event) => handleChange({ ...bid, value: event.target.value })}
        >
          <option value="" disabled>
            {selectPlaceholder}
          </option>
          {bid.options.map((option) => (
            <option key={`${ariaLabel}-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-[8px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8392]" />
      </div>
    );
  }

  if (bid.type === "percent") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "percent-or-duration") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "percent-range") {
    return (
      <TimeValueBidControl
        ariaLabel={ariaLabel}
        bid={bid}
        operatorShell={operatorShell}
        onChange={handleChange}
      />
    );
  }

  if (bid.type === "pairing-occurrence-list") {
    return null;
  }

  if (bid.type === "reserve-call-type-date-scope" || bid.type === "reserve-flying-date-pattern") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "pairing-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "pairing-check-time") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "pairing-length-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "month-end-carryover") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "flight-number-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "redeye-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "deadhead-flying") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "credit-window-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "efficient-flying-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "flight-legs-per-duty") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  if (bid.type === "work-day-preference") {
    return (
      <div aria-label={ariaLabel} className={READ_ONLY_CLASS} title={formatPairingBidValue(bid)}>
        {formatPairingBidValue(bid)}
      </div>
    );
  }

  return (
    <BidTextInput
      ariaLabel={ariaLabel}
      className="w-[220px]"
      type="text"
      value={bid.value}
      onValueChange={(value) => handleChange({ ...bid, value })}
    />
  );
};
