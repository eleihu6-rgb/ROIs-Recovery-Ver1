import type { PairingSearchResult } from "@/features/pairing/types";
import { PairingResultCardDetail } from "@/features/pairing/components/pairing-result-card-detail";
import styles from "@/features/pairing/components/pairing-search-panel.module.css";
import { cn } from "@/shared/lib/cn";
import { listPbsPeriodDates } from "../../../../../packages/contracts/pbs-prefer-off.js";

type PairingDetailCardProps = {
  actionDisabled?: boolean;
  actionLabel?: string;
  className?: string;
  periodEndDate: string;
  periodStartDate: string;
  result: PairingSearchResult;
  onAction?: (result: PairingSearchResult) => void;
};

const MINI_CALENDAR_DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
type MiniCalendarCell = {
  id: string;
  isoDate: string;
  day: number;
  muted: boolean;
};

const formatIsoDate = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addUtcDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
};

const buildMiniCalendarCells = (periodStartDate: string, periodEndDate: string): MiniCalendarCell[] => {
  const periodDates = listPbsPeriodDates(periodStartDate, periodEndDate);
  const firstDate = parseIsoDate(periodDates[0] ?? "");
  const lastDate = parseIsoDate(periodDates.at(-1) ?? "");

  if (!firstDate || !lastDate) {
    return [];
  }

  const firstDayOffset = firstDate.getUTCDay();
  const currentPeriodCells = periodDates.map((isoDate) => {
    const date = parseIsoDate(isoDate)!;

    return { id: isoDate, isoDate, day: date.getUTCDate(), muted: false };
  });
  const leadingCells = Array.from({ length: firstDayOffset }, (_, index) => {
    const date = addUtcDays(firstDate, index - firstDayOffset);

    return {
      id: formatIsoDate(date),
      isoDate: formatIsoDate(date),
      day: date.getUTCDate(),
      muted: true,
    };
  });
  const visibleCellCount = leadingCells.length + currentPeriodCells.length;
  const trailingCellCount = (7 - (visibleCellCount % 7)) % 7;
  const trailingCells = Array.from({ length: trailingCellCount }, (_, index) => {
    const date = addUtcDays(lastDate, index + 1);

    return {
      id: formatIsoDate(date),
      isoDate: formatIsoDate(date),
      day: date.getUTCDate(),
      muted: true,
    };
  });

  return [...leadingCells, ...currentPeriodCells, ...trailingCells];
};

export const PairingMiniCalendar = ({
  activeDates,
  periodEndDate,
  periodStartDate,
}: {
  activeDates: string[];
  periodEndDate: string;
  periodStartDate: string;
}) => {
  const activeDaySet = new Set(activeDates);
  const cells = buildMiniCalendarCells(periodStartDate, periodEndDate);

  return (
    <div className={styles.miniCalendarWrap} data-testid="pairing-search-mini-calendar">
      <div className={styles.miniWeekdays}>
        {MINI_CALENDAR_DAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className={styles.miniGrid}>
        {cells.map((cell) => {
          const isActive = activeDaySet.has(cell.isoDate);

          return (
            <div
              key={cell.id}
              className={cn(
                styles.miniCell,
                cell.muted ? styles.miniCellMuted : "",
                isActive ? styles.miniCellActive : "",
              )}
              data-active={isActive ? "true" : "false"}
              data-date={cell.isoDate}
            >
              {String(cell.day).padStart(2, "0")}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const PairingDetailCard = ({
  actionDisabled,
  actionLabel,
  className,
  periodEndDate,
  periodStartDate,
  result,
  onAction,
}: PairingDetailCardProps) => (
  <article className={cn(styles.resultCard, className)}>
    <div className={styles.resultMain}>
      <div className={styles.resultCardHeader}>
        <div className={styles.resultCardTitleActions}>
          <div className={styles.pairingBadge}>
            <span>{result.pairingNumber}</span>
          </div>
          {actionLabel && onAction ? (
            <button
              className={styles.resultCardAction}
              disabled={actionDisabled}
              type="button"
              onClick={() => onAction(result)}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>

    <div className={styles.resultCardContent} data-testid="pairing-result-card-content">
      <PairingResultCardDetail className={cn(styles.resultCardDetail, "mt-0")} result={result} />
      <PairingMiniCalendar
        activeDates={result.activeDates}
        periodEndDate={periodEndDate}
        periodStartDate={periodStartDate}
      />
    </div>
  </article>
);
