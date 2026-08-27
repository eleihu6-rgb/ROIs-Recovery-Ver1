import type { DashboardMessagePanelData } from "@/features/dashboard/types";

type DashboardRightPanelProps = {
  data: DashboardMessagePanelData;
};

const pluralize = (value: number, singular: string, plural = `${singular}s`) =>
  `${value} ${value === 1 ? singular : plural}`;

const FULL_DAY_CODES = new Set(["DO", "GDO", "OFF"]);
const UNAVAILABLE_CODES = new Set(["VAC", "ILL"]);
const TRAINING_CODES = new Set(["SIM", "SFT", "CBT"]);
const DEADHEAD_CODES = new Set(["DHD"]);

const DUTY_TAG_BASE_CLASS =
  "inline-flex h-5 shrink-0 items-center rounded border px-2 text-xs font-semibold leading-4";

const getDutyTypeLabel = (code: string) => {
  if (code === "PAIRING") {
    return "Pairing";
  }

  if (FULL_DAY_CODES.has(code)) {
    return "Days off";
  }

  if (UNAVAILABLE_CODES.has(code)) {
    return "Unavailable";
  }

  if (TRAINING_CODES.has(code)) {
    return "Training";
  }

  if (code === "RES") {
    return "Reserve";
  }

  return code;
};

const getDutyTagClassName = (code: string) => {
  if (code === "PAIRING") {
    return `${DUTY_TAG_BASE_CLASS} border-[#4FCFED] bg-[#4FCFED] text-white`;
  }

  if (code === "DAYS_OFF" || FULL_DAY_CODES.has(code)) {
    return `${DUTY_TAG_BASE_CLASS} border-[#3DC0A9] bg-[#3DC0A9] text-white`;
  }

  if (code === "UNAVAILABLE" || UNAVAILABLE_CODES.has(code)) {
    return `${DUTY_TAG_BASE_CLASS} border-[#F5B507] bg-[#F5B507] text-white`;
  }

  if (code === "TRAINING" || TRAINING_CODES.has(code)) {
    return `${DUTY_TAG_BASE_CLASS} border-[#2E91E5] bg-[#2E91E5] text-white`;
  }

  if (code === "RESERVE" || code === "RES") {
    return `${DUTY_TAG_BASE_CLASS} border-[#706CD5] bg-[#706CD5] text-white`;
  }

  if (code === "DEADHEAD" || DEADHEAD_CODES.has(code)) {
    return `${DUTY_TAG_BASE_CLASS} border-[#F5B507] bg-[#F5B507] text-white`;
  }

  return `${DUTY_TAG_BASE_CLASS} border-[#8A91A3] bg-[#8A91A3] text-white`;
};

const parseClockMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

const formatDutyTime = (code: string, label: string, timeText: string | null) => {
  if (!timeText) {
    return null;
  }

  const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(timeText);

  if (!match) {
    return timeText;
  }

  const startMinutes = parseClockMinutes(match[1]);
  const endMinutes = parseClockMinutes(match[2]);

  if (startMinutes === null || endMinutes === null) {
    return timeText;
  }

  const durationMinutes = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : endMinutes + 24 * 60 - startMinutes;
  const isDayOffLike = FULL_DAY_CODES.has(code) || FULL_DAY_CODES.has(label.toUpperCase());

  return isDayOffLike && durationMinutes >= 23 * 60 + 58 ? "Full day" : timeText;
};

export const DashboardRightPanel = ({ data }: DashboardRightPanelProps) => {
  const { preAssignments } = data;
  const hasPreAssignments = preAssignments.totalDuties > 0;

  return (
    <aside className="min-h-full rounded-3xl bg-white shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
      <div className="flex h-full min-h-0 flex-col px-6 py-6">
        <div className="flex h-8 items-center rounded-sm bg-[rgba(104,102,204,0.08)]">
          <span className="h-8 w-1 rounded-l-sm bg-[#706cd5]" />
          <span className="ml-3 text-sm font-medium leading-[18px] text-[#4d4f5c]">{data.title}</span>
        </div>

        <section aria-labelledby="dashboard-preassigned-heading" className="mt-5">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f7485]"
            id="dashboard-preassigned-heading"
          >
            Pre-assigned Duties
          </h2>

          <div className="mt-3 rounded-lg border border-[#E2E8ED] bg-white px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium leading-5 text-[#4d5568]">Duties</span>
              <span className="text-xl font-semibold leading-6 text-[#282c3b]">
                {preAssignments.totalDuties}
              </span>
            </div>

            {hasPreAssignments ? (
              <div className="mt-3 space-y-2 border-t border-[#eef1f6] pt-3">
                {preAssignments.categories.map((category) => (
                  <div className="flex items-center justify-between gap-3" key={category.code}>
                    <span className="min-w-0">
                      <span className={getDutyTagClassName(category.code)}>{category.label}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold leading-[18px] text-[#282c3b]">
                      {category.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#eef1f6] pt-3">
              <span className="text-sm font-medium leading-5 text-[#4d5568]">Covered days</span>
              <span className="text-sm font-semibold leading-5 text-[#282c3b]">
                {pluralize(preAssignments.daysTouched, "day")}
              </span>
            </div>
          </div>

          {hasPreAssignments ? (
            <>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#6f7485]">
                Duty Details
              </div>
              <ul
                className="mt-2 max-h-96 divide-y divide-[#eef1f6] overflow-y-auto overscroll-contain rounded-lg border border-[#E2E8ED] bg-white"
                aria-label="Pre-assigned duty details"
                tabIndex={0}
              >
                {preAssignments.details.map((item) => {
                  const timeText = formatDutyTime(item.code, item.label, item.timeText);

                  return (
                    <li className="px-3 py-3" key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-semibold leading-5 text-[#1f2533]"
                            title={item.label}
                          >
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-xs font-normal leading-4 text-[#747b8f]">
                            {item.dateText}
                          </p>
                        </div>
                        <span className={getDutyTagClassName(item.code)}>
                          {getDutyTypeLabel(item.code)}
                        </span>
                      </div>
                      {timeText ? (
                        <p className="mt-1.5 text-xs font-medium leading-4 text-[#4d5568]">
                          {timeText}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-[#d8dde6] bg-[#fbfcff] px-3 py-4 text-sm font-medium leading-5 text-[#6f7485]">
              No pre-assigned duties for this period.
            </p>
          )}
        </section>

      </div>
    </aside>
  );
};
