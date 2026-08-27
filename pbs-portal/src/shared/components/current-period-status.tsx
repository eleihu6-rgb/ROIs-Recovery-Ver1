import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";

type CurrentPeriodStatusProps = {
  currentPeriod?: PbsCurrentPeriod;
  className?: string;
  variant?: "banner" | "compact";
};

const formatDateTime = (value?: string | null, zoneId = "UTC"): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Map(new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zoneId,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");

  return `${month} ${day}, ${hour}:${minute}`;
};

const getStageTitle = (currentPeriod: PbsCurrentPeriod): string => {
  if (currentPeriod.computedStage === "OPEN") {
    return `Bidding open for ${currentPeriod.periodCode}`;
  }

  if (currentPeriod.computedStage === "NOT_OPEN") {
    return `Bidding not open for ${currentPeriod.periodCode}`;
  }

  if (currentPeriod.computedStage === "CLOSED") {
    return `Bidding closed for ${currentPeriod.periodCode}`;
  }

  return `Bidding window incomplete for ${currentPeriod.periodCode}`;
};

const getStageClassName = (currentPeriod: PbsCurrentPeriod): string => {
  if (currentPeriod.computedStage === "OPEN") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (currentPeriod.computedStage === "CLOSED") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
};

const buildOpenCloseDetail = (openAt: string | null, closeAt: string | null): string =>
  [openAt ? `Open ${openAt}` : null, closeAt ? `Close ${closeAt}` : null]
    .filter(Boolean)
    .join(" · ");

const getDetailText = (
  currentPeriod: PbsCurrentPeriod,
  openAt: string | null,
  closeAt: string | null,
): string => {
  const openCloseDetail = buildOpenCloseDetail(openAt, closeAt);

  if (currentPeriod.computedStage === "NOT_OPEN" && openAt) {
    return `Bidding opens at ${openAt}`;
  }

  if (currentPeriod.computedStage === "CLOSED" && closeAt) {
    return `Bidding closed at ${closeAt}`;
  }

  if (currentPeriod.computedStage === "INCOMPLETE") {
    return currentPeriod.readOnlyReason ?? openCloseDetail;
  }

  return openCloseDetail || currentPeriod.readOnlyReason || "";
};

export const CurrentPeriodStatus = ({
  currentPeriod,
  className = "",
  variant = "banner",
}: CurrentPeriodStatusProps) => {
  if (!currentPeriod) {
    return null;
  }

  const zoneId = currentPeriod.zoneId ?? "UTC";
  const openAt = formatDateTime(currentPeriod.bidOpenAt, zoneId);
  const closeAt = formatDateTime(currentPeriod.bidCloseAt, zoneId);
  const timezoneSuffix = currentPeriod.timezoneLabel ? ` · ${currentPeriod.timezoneLabel}` : "";
  const detailText = getDetailText(currentPeriod, openAt, closeAt);
  const detail = detailText ? `${detailText}${timezoneSuffix}` : null;
  const isCompact = variant === "compact";

  return (
    <div
      className={[
        isCompact
          ? "max-w-md rounded-xl border px-3 py-1.5 text-xs shadow-sm"
          : "rounded-2xl border px-4 py-3 text-xs",
        getStageClassName(currentPeriod),
        className,
      ].filter(Boolean).join(" ")}
      data-testid={isCompact ? "bidding-calendar-current-period-status" : "current-period-status"}
      role="status"
    >
      <div className={isCompact ? "truncate font-semibold leading-4" : "font-semibold"}>
        {getStageTitle(currentPeriod)}
      </div>
      {detail ? (
        <div className={isCompact ? "mt-0.5 truncate text-2xs leading-3 opacity-85" : "mt-1 text-xs leading-4 opacity-85"}>
          {detail}
        </div>
      ) : null}
    </div>
  );
};
