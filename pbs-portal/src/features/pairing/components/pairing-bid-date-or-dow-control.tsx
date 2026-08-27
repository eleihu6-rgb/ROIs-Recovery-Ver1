import { XMarkIcon } from "@heroicons/react/24/outline";
import { useId, useState } from "react";
import { BidDateInput } from "@/features/pairing/components/pairing-bid-control-inputs";
import type {
  PairingBidValue,
  PairingDayOfWeek,
} from "@/features/pairing/types";

const DAY_OF_WEEK_OPTIONS: { value: PairingDayOfWeek; label: string }[] = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

export const DateOrDowListControl = ({
  ariaLabel,
  allowDates = true,
  bid,
  dateDisabledHint,
  onChange,
  showDisabledDates = false,
}: {
  ariaLabel: string;
  allowDates?: boolean;
  bid: Extract<PairingBidValue, { type: "date-or-dow-list" }>;
  dateDisabledHint?: string;
  onChange: (value: Extract<PairingBidValue, { type: "date-or-dow-list" }>) => void;
  showDisabledDates?: boolean;
}) => {
  const [draftDate, setDraftDate] = useState("");
  const dateHintId = useId();
  const datesDisabled = !allowDates;
  const showDates = allowDates || showDisabledDates;
  const selectedDays = new Set(bid.daysOfWeek);

  const addDate = () => {
    const normalizedDate = draftDate.trim();

    if (normalizedDate.length === 0 || bid.dates.includes(normalizedDate)) {
      setDraftDate("");
      return;
    }

    onChange({
      ...bid,
      dates: [...bid.dates, normalizedDate].sort(),
    });
    setDraftDate("");
  };

  const removeDate = (dateToRemove: string) => {
    onChange({
      ...bid,
      dates: bid.dates.filter((date) => date !== dateToRemove),
    });
  };

  const toggleDay = (day: PairingDayOfWeek) => {
    onChange({
      ...bid,
      daysOfWeek: selectedDays.has(day)
        ? bid.daysOfWeek.filter((selectedDay) => selectedDay !== day)
        : DAY_OF_WEEK_OPTIONS
          .map((option) => option.value)
          .filter((optionDay) => optionDay === day || selectedDays.has(optionDay)),
    });
  };

  return (
    <div className="space-y-3">
      {showDates ? (
        <div className="space-y-2">
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">Date</p>
          <div
            aria-describedby={datesDisabled && dateDisabledHint ? dateHintId : undefined}
            aria-label={`${ariaLabel} date restriction`}
            className="flex flex-wrap items-center gap-2"
            role="group"
          >
            {bid.dates.map((date) => (
              <span
                key={`${ariaLabel}-${date}`}
                className="inline-flex h-[28px] items-center gap-1 rounded-full bg-[#eef2ff] px-[10px] text-xs font-semibold text-[#6467d1]"
              >
                {date}
                <button
                  aria-label={`Remove ${date} from ${ariaLabel}`}
                  className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[#6467d1] transition hover:bg-[#dfe5ff] focus-visible:outline-none"
                  disabled={datesDisabled}
                  type="button"
                  onClick={() => removeDate(date)}
                >
                  <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
                </button>
              </span>
            ))}
            <BidDateInput
              ariaLabel={`${ariaLabel} date`}
              disabled={datesDisabled}
              value={draftDate}
              onValueChange={setDraftDate}
            />
            <button
              className="h-[30px] cursor-pointer rounded-xl border border-[#cfd6e4] bg-white px-3 text-xs font-bold text-[#6467d1] transition hover:bg-[#f5f7ff] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={datesDisabled || draftDate.trim().length === 0}
              type="button"
              onClick={addDate}
            >
              Add Date
            </button>
          </div>
          {datesDisabled && dateDisabledHint ? (
            <p id={dateHintId} className="m-0 text-xs font-medium leading-4 text-[#6f7485]">
              {dateDisabledHint}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">Day</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${ariaLabel} days of week`}>
          {DAY_OF_WEEK_OPTIONS.map((day) => {
            const selected = selectedDays.has(day.value);

            return (
              <button
                key={day.value}
                aria-pressed={selected}
                className={`h-[30px] min-w-[44px] cursor-pointer rounded-xl border px-3 text-xs font-bold transition ${
                  selected
                    ? "border-[#6467d1] bg-[#eef2ff] text-[#5458c8]"
                    : "border-[#cfd6e4] bg-white text-[#6f7485] hover:bg-[#f5f7ff]"
                }`}
                type="button"
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
