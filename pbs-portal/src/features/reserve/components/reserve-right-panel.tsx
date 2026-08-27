import { useEffect, useMemo, useState } from "react";
import { MonthGridCalendar } from "@/shared/components/calendar";
import { PanelStripHeader } from "@/shared/components/panel";
import { Button } from "@/shared/components/ui/button";
import type { ReserveCalendarData } from "@/features/reserve/types";
import type { ScheduleTierTone } from "@/shared/components/schedule/types";

type ReserveRightPanelProps = {
  data: ReserveCalendarData;
};

const toneClassMap: Record<ScheduleTierTone, string> = {
  blue: "bg-[#4FCFED]",
  green: "bg-[#3DC0A9]",
  red: "bg-[#D94C4C]",
  yellow: "bg-[#F5B507]",
  empty: "bg-[#F8F9FB]",
};

const getViewportWidth = () => window.innerWidth;

export const ReserveRightPanel = ({ data }: ReserveRightPanelProps) => {
  const [selectedDate, setSelectedDate] = useState(data.selectedDate);
  const [viewportWidth, setViewportWidth] = useState(() => getViewportWidth());

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(getViewportWidth());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const reserveGridStyle = useMemo(() => {
    if (viewportWidth >= 1750) {
      return {
        labelWidth: "142px",
      };
    }

    if (viewportWidth >= 1500) {
      return {
        labelWidth: "132px",
      };
    }

    return {
      labelWidth: "116px",
    };
  }, [viewportWidth]);

  const reserveRowStyle = useMemo(
    () => ({
      gridTemplateColumns: `${reserveGridStyle.labelWidth} repeat(${data.dayLabels.length}, minmax(0, 1fr))`,
    }),
    [data.dayLabels.length, reserveGridStyle.labelWidth],
  );

  return (
    <section
      className="min-h-full overflow-hidden rounded-3xl bg-white px-5 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
      data-uiid="reserve-right-panel"
    >
      <PanelStripHeader title={data.title} />

      <div className="mt-10 flex justify-end">
        <Button
          className="h-[30px] rounded-lg bg-[#706cd5] px-[14px] text-sm font-semibold text-white shadow-none hover:bg-[#615ec1]"
          type="button"
          onClick={() => undefined}
        >
          {data.actionLabel}
        </Button>
      </div>

      <div
        className="mt-[14px] overflow-hidden rounded-3xl border border-[#e2e8ed] bg-white px-[14px] pb-[14px] pt-[12px]"
        data-testid="reserve-heatmap"
      >
        <ol
          className="grid w-full items-center gap-x-[6px] text-xs font-medium leading-[15px] text-[#8d93a5]"
          style={reserveRowStyle}
        >
          <li aria-hidden="true" />
          {data.dayLabels.map((day) => (
            <li key={day} className="list-none text-center">
              <time dateTime={day}>{day}</time>
            </li>
          ))}
        </ol>

        <ul className="mt-[8px] space-y-[8px]">
          {data.tierRows.map((row) => (
            <li
              key={row.label}
              className="grid w-full list-none items-center gap-x-[6px]"
              data-testid="reserve-heatmap-row"
              style={reserveRowStyle}
            >
              <button
                className={
                  row.active
                    ? "flex h-[26px] items-center justify-center rounded-lg border border-[#706cd5] bg-[#706cd5] text-xs font-medium leading-[15px] text-white"
                    : "flex h-[26px] items-center justify-center rounded-lg border border-[#e2e8ed] bg-[#f8f9fb] text-xs font-medium leading-[15px] text-[#4d4f5c]"
                }
                type="button"
              >
                {row.label}
              </button>

              <ol className="contents" aria-label={`${row.label} reserve heatmap`}>
                {row.cells.map((cell, index) => (
                  <li key={`${row.label}-${index}`} className="list-none">
                    <span className={`block aspect-square w-full rounded-lg ${toneClassMap[cell]}`} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <MonthGridCalendar
          entries={data.entries}
          month={data.month}
          selectedDate={selectedDate}
          todayDate={data.todayDate}
          year={data.year}
          onSelectDate={setSelectedDate}
        />
      </div>

      <p className="sr-only" data-testid="reserve-selected-date">
        {selectedDate}
      </p>
    </section>
  );
};
