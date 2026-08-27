import type { PbsReserveCoverageDay } from "../../../../../packages/contracts/pbs-reserve-bids.js";

import { TierSelectionTitle } from "@/shared/components/tiers";

type ReserveCoverageCalendarAnchor = {
  row: number;
  col: number;
};

export type ReserveCoverageCalendarAction = {
  date: string;
  selectedTiers: string[];
  anchor: ReserveCoverageCalendarAnchor;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onTierToggle: (tier: string) => void;
  onClearTiers: () => void;
};

type ReserveCoverageCalendarProps = {
  days: PbsReserveCoverageDay[];
  actionPopover?: ReserveCoverageCalendarAction | null;
  actionLabel: string;
  description: string;
  onSelectDate: (date: string, anchor: ReserveCoverageCalendarAnchor) => void;
};

const DAYS_PER_WEEK = 7;
const RESERVE_TIERS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];
const POPOVER_WIDTH = 320;
const POPOVER_GAP = 8;
const COVERAGE_CELL_HEIGHT = 80;
const POPOVER_EDGE_PADDING = 8;

const formatDay = (date: string) => {
  const day = Number.parseInt(date.slice(-2), 10);
  return Number.isNaN(day) ? date : String(day);
};

const formatCssNumber = (value: number) =>
  Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(3))}`;

const getActionPopoverLeft = (col: number) => {
  const centerPercent = formatCssNumber(((col - 0.5) / DAYS_PER_WEEK) * 100);
  const halfWidth = formatCssNumber(POPOVER_WIDTH / 2);

  return [
    `clamp(${POPOVER_EDGE_PADDING}px,`,
    `calc(${centerPercent}% - ${halfWidth}px),`,
    `calc(100% - ${POPOVER_WIDTH + POPOVER_EDGE_PADDING}px))`,
  ].join(" ");
};

const getActionPopoverStyle = (anchor: ReserveCoverageCalendarAnchor) => {
  if (anchor.row <= 1) {
    return {
      left: getActionPopoverLeft(anchor.col),
      top: `${COVERAGE_CELL_HEIGHT + POPOVER_GAP}px`,
    };
  }

  return {
    left: getActionPopoverLeft(anchor.col),
    top: `${(anchor.row - 1) * COVERAGE_CELL_HEIGHT - POPOVER_GAP}px`,
    transform: "translateY(-100%)",
  };
};

export const ReserveCoverageCalendar = ({
  days,
  actionPopover = null,
  actionLabel,
  description,
  onSelectDate,
}: ReserveCoverageCalendarProps) => {
  const selectedTierSet = new Set(actionPopover?.selectedTiers ?? []);
  const selectedDay = actionPopover
    ? days.find((day) => day.date === actionPopover.date) ?? null
    : null;

  return (
    <section
      className="rounded-3xl border border-[#e2e8ed] bg-white p-4"
      data-testid="reserve-coverage-calendar"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-sm font-bold text-[#40424f]">RESERVE COVERAGE</h2>
          <p className="m-0 mt-1 text-xs font-medium text-[#8d93a5]">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold text-[#8d93a5]">
          <span>Need</span>
          <span>Off</span>
        </div>
      </div>

      <div className="relative">
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            const row = Math.floor(index / DAYS_PER_WEEK) + 1;
            const col = (index % DAYS_PER_WEEK) + 1;

            return (
              <button
                key={day.date}
                aria-label={`Open ${actionLabel} options for ${day.date}; need ${day.requiredReserveCount}; off ${day.availableOffCount}`}
                className="min-h-[72px] cursor-pointer rounded-2xl border border-[#d8dde6] bg-[#fbfcff] p-2 text-left transition hover:border-[#706cd5] hover:bg-[#f5f7ff] focus-visible:border-[#706cd5] focus-visible:outline-none"
                type="button"
                onClick={() => onSelectDate(day.date, { row, col })}
              >
                <span className="block text-sm font-bold text-[#40424f]">{formatDay(day.date)}</span>
                <span className="mt-2 block text-xs font-semibold text-[#546070]">
                  Need: {day.requiredReserveCount}
                </span>
                <span className="mt-1 block text-xs font-semibold text-[#2f9f8f]">
                  Off: {day.availableOffCount}
                </span>
              </button>
            );
          })}
        </div>

        {actionPopover ? (
          <button
            aria-label="Close reserve calendar action popover"
            className="fixed inset-0 z-[25] cursor-default appearance-none border-0 bg-transparent p-0"
            data-testid="reserve-calendar-action-popover-dismiss"
            tabIndex={-1}
            type="button"
            onClick={actionPopover.isPending ? undefined : actionPopover.onCancel}
          />
        ) : null}

        {actionPopover ? (
          <div
            className="absolute z-30 rounded-3xl border border-[#d8dde6] bg-white px-4 py-3 shadow-[0_16px_40px_rgba(45,49,66,0.14)]"
            data-testid="reserve-calendar-action-popover"
            style={{
              width: `${POPOVER_WIDTH}px`,
              ...getActionPopoverStyle(actionPopover.anchor),
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#6f7485]">
              {actionLabel}
            </p>
            <p className="mt-1 text-sm font-medium leading-5 text-[#40424f]">
              {actionPopover.date}
            </p>
            {selectedDay ? (
              <p className="mt-1 text-xs font-semibold leading-5 text-[#6f7485]">
                Need: {selectedDay.requiredReserveCount} · Off: {selectedDay.availableOffCount}
              </p>
            ) : null}

            <fieldset aria-label="Reserve bid tiers" className="mt-3">
              <TierSelectionTitle as="legend" required />
              <div className="mt-2 grid grid-cols-4 gap-2">
                {RESERVE_TIERS.map((tier) => (
                  <label
                    key={tier}
                    className={[
                      "flex h-[28px] items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold",
                      actionPopover.isPending
                        ? "cursor-not-allowed border-[#edf0f4] bg-[#f8f9fb] text-[#a8adba]"
                        : "cursor-pointer border-[#e1e5ec] text-[#40424f]",
                    ].join(" ")}
                  >
                    <input
                      checked={selectedTierSet.has(tier)}
                      className="h-3.5 w-3.5 accent-[#706cd5] disabled:cursor-not-allowed"
                      disabled={actionPopover.isPending}
                      type="checkbox"
                      onChange={() => actionPopover.onTierToggle(tier)}
                    />
                    {tier}
                  </label>
                ))}
                <button
                  className="h-[28px] cursor-pointer rounded-lg border border-dashed border-[#c8ced8] px-2 text-xs font-semibold text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={actionPopover.isPending}
                  type="button"
                  onClick={actionPopover.onClearTiers}
                >
                  Clear
                </button>
              </div>
            </fieldset>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={actionPopover.isPending}
                type="button"
                onClick={actionPopover.onCancel}
              >
                Cancel
              </button>
              <button
                className="h-[30px] cursor-pointer rounded-lg bg-[#706cd5] px-3 text-xs font-semibold text-white hover:bg-[#615ec1] disabled:cursor-not-allowed disabled:bg-[#b8b6e8]"
                disabled={actionPopover.isPending || actionPopover.selectedTiers.length === 0}
                type="button"
                onClick={actionPopover.onConfirm}
              >
                {actionPopover.isPending ? "ADDING..." : "ADD BID"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
