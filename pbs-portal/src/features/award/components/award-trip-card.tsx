import { CalendarDaysIcon, PlayIcon } from "@heroicons/react/24/solid";
import type { AwardDetailRow, AwardDisplayItem } from "@/features/award/types";

type AwardTripCardProps = {
  item: AwardDisplayItem;
};

const legHeaders = ["DAY", "DH", "Flight", "DPS", "ARS", "DEP", "ARR", "BLK", "CRD", "Fleet"] as const;

const getLegCells = (leg: AwardDisplayItem["legs"][number]) => [
  leg.day,
  leg.deadhead ? "DH" : "",
  leg.flightNumber ?? "--",
  leg.depAirport ?? "--",
  leg.arrAirport ?? "--",
  leg.depTime ?? "--",
  leg.arrTime ?? "--",
  leg.blockLabel,
  leg.creditLabel,
  leg.equipmentMissing ? "Missing" : leg.equipment ?? "--",
];

const buildTotals = (item: AwardDisplayItem): AwardDetailRow[] => [
  { label: "BLOCK", value: item.blockLabel },
  { label: "CREDIT", value: item.creditLabel },
  { label: "TAFB", value: item.tafbLabel },
  { label: "LEGS", value: String(item.legs.length) },
];

const missingValue = (value: string | null) => value ?? "--";
const missingDataClassName = "font-semibold text-[#7a5a00]";

const getTimeRangeLabel = (item: AwardDisplayItem) => item.timeRangeLabel;

const getItemCode = (item: AwardDisplayItem) => {
  if (item.type === "day_off") {
    return "DO";
  }

  if (item.type === "activity") {
    return item.label.slice(0, 3).toUpperCase();
  }

  return item.assignment ?? item.assignmentGroup ?? "FLY";
};

const getItemBadgeClassName = (item: AwardDisplayItem) => {
  if (item.type === "day_off") {
    return "bg-[#4cc47c] text-white";
  }

  if (item.type === "activity") {
    return "bg-[#f2a33a] text-white";
  }

  return "bg-[#52c8ef] text-white";
};

const getActivityTypeLabel = (item: AwardDisplayItem) => {
  if (item.type === "day_off") {
    return "Day Off";
  }

  return item.label;
};

const ActivityCard = ({ item }: { item: AwardDisplayItem }) => (
  <article
    aria-label={`Award activity ${item.label}`}
    className="rounded-xl border border-[#e6ebf2] bg-[#fbfcfe] px-4 py-3"
    data-testid="award-selected-activity-card"
  >
    <div className="flex min-w-0 items-center gap-3 border-b border-[#edf1f6] pb-3">
      <span className={`inline-flex h-8 min-w-12 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-bold ${getItemBadgeClassName(item)}`}>
        {getItemCode(item)}
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-base font-bold leading-5 text-[#282c3b]">
          {item.label}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-xs leading-[15px] text-[#6f7485]">
          <CalendarDaysIcon className="h-3.5 w-3.5" />
          {item.dateRangeLabel} · {getTimeRangeLabel(item)}
        </p>
      </div>
    </div>

    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm leading-[18px]">
      <div className="rounded-lg bg-white px-3 py-2">
        <dt className="text-xs font-bold uppercase leading-4 text-[#7f8392]">Date</dt>
        <dd className="mt-1 font-semibold text-[#283146]">{item.dateRangeLabel}</dd>
      </div>
      <div className="rounded-lg bg-white px-3 py-2">
        <dt className="text-xs font-bold uppercase leading-4 text-[#7f8392]">Time</dt>
        <dd className="mt-1 font-semibold text-[#283146]">{getTimeRangeLabel(item)}</dd>
      </div>
      <div className="rounded-lg bg-white px-3 py-2">
        <dt className="text-xs font-bold uppercase leading-4 text-[#7f8392]">Location / Assignment</dt>
        <dd className="mt-1 truncate font-semibold text-[#283146]">{item.base ?? item.assignment ?? item.assignmentGroup ?? "--"}</dd>
      </div>
      <div className="rounded-lg bg-white px-3 py-2">
        <dt className="text-xs font-bold uppercase leading-4 text-[#7f8392]">Credit</dt>
        <dd className="mt-1 font-semibold text-[#283146]">{item.creditLabel}</dd>
      </div>
      <div className="rounded-lg bg-white px-3 py-2">
        <dt className="text-xs font-bold uppercase leading-4 text-[#7f8392]">Type</dt>
        <dd className="mt-1 font-semibold text-[#283146]">{getActivityTypeLabel(item)}</dd>
      </div>
      <div className="rounded-lg bg-white px-3 py-2">
        <dt className="text-xs font-bold uppercase leading-4 text-[#7f8392]">Code</dt>
        <dd className="mt-1 font-semibold text-[#283146]">{getItemCode(item)}</dd>
      </div>
    </dl>
  </article>
);

export const AwardTripCard = ({ item }: AwardTripCardProps) => {
  if (item.type !== "pairing") {
    return <ActivityCard item={item} />;
  }

  const tripMeta = [
    { label: "DATE", value: item.dateRangeLabel },
    { label: "TIME", value: item.timeRangeLabel },
    { label: "BASE", value: missingValue(item.base) },
    { label: "PAIRING FLEET", value: missingValue(item.fleet) },
    { label: "POSITION", value: missingValue(item.position) },
    { label: "CODE", value: getItemCode(item) },
  ];

  return (
    <article
      aria-label={`Award pairing ${item.label}`}
      className="rounded-xl border border-[#e6ebf2] bg-white px-4 py-4"
      data-testid="award-selected-pairing-card"
    >
      <div className="min-w-0">
        <header className="inline-flex h-[30px] items-center rounded-lg bg-[#52c8ef] px-3 text-xs font-semibold uppercase leading-[15px] text-white">
          <PlayIcon className="mr-1.5 h-[14px] w-[14px]" data-testid="award-trip-code-icon" />
          {item.pairingCode ?? item.label}
        </header>

        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm leading-[18px] text-[#7f8392]">
          {tripMeta.map((meta) => (
            <div key={`${item.id}-${meta.label}-${meta.value}`} className="flex gap-1">
              <dt>{meta.label}:</dt>
              <dd className="font-semibold text-[#4d4f5c]">{meta.value}</dd>
            </div>
          ))}
        </dl>

        {item.dataNotices.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[#f0dba5] bg-[#fff9e9] px-3 py-2 text-xs leading-4 text-[#7a5a00]">
            {item.dataNotices.join(" ")}
          </div>
        ) : null}

        {item.explanation ? (
          <aside
            aria-label="Award Explanation"
            className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
            data-testid="award-explanation"
          >
            <p className="text-xs font-semibold uppercase text-muted-foreground">Award Explanation</p>
            <p className="mt-1">{item.explanation}</p>
          </aside>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-left">
            <thead className="text-xs font-bold leading-[15px] text-[#4d4f5c]">
              <tr className="grid grid-cols-[44px_44px_72px_58px_58px_62px_62px_66px_66px_54px]">
                {legHeaders.map((header) => (
                  <th key={`${item.id}-${header}`} className="font-bold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm font-semibold leading-[18px] text-[#4d4f5c]">
              {item.legs.map((leg, legIndex) => (
                <tr
                  key={`${item.id}-leg-${leg.id}-${legIndex}`}
                  className="mt-1.5 grid grid-cols-[44px_44px_72px_58px_58px_62px_62px_66px_66px_54px] border-t border-[#edf1f6] pt-1.5"
                >
                  {getLegCells(leg).map((value, index) => (
                    <td
                      key={`${item.id}-${leg.id}-cell-${index}`}
                      className={`truncate pr-2 ${value === "Missing" || value === "Missing data" ? missingDataClassName : ""}`}
                      title={value === "Missing" ? item.legEquipmentMissingReason ?? undefined : undefined}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm leading-[18px] text-[#7f8392]">
          {buildTotals(item).map((row) => (
            <div key={`${item.id}-totals-${row.label}`} className="flex gap-1">
              <dt>{row.label}:</dt>
              <dd className={row.value === "Missing data" ? missingDataClassName : "font-semibold text-[#4d4f5c]"}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
};
