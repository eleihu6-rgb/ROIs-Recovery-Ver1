import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChartBarIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  ListBulletIcon,
  PaperAirplaneIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import { AppDialog } from "@rois/ui";
import { Button } from "@/shared/components/ui/button";
import { AwardTripCard } from "@/features/award/components/award-trip-card";
import { AwardMonthCalendar } from "@/features/award/components/award-month-calendar";
import type {
  AwardDisplayItem,
  AwardPageData,
  AwardRosterGroup,
} from "@/features/award/types";

type AwardRightPanelProps = {
  data: AwardPageData;
  periodControl?: ReactNode;
};

const getStatusLabel = (data: AwardPageData) => {
  if (data.lifecycleStage === "MIS_AWARD_CLOSED") return `Mis-award Closed · ${data.periodCode}`;
  if (data.lifecycleStage === "FINAL") return `Final · ${data.periodCode}`;
  if (data.availability === "AVAILABLE") return `Published · ${data.periodCode}`;
  if (data.availability === "PUBLISH_PENDING") return `Awaiting publication · ${data.periodCode}`;
  if (data.availability === "SCHEDULED") return `Scheduled · ${data.periodCode}`;
  return "Award period not configured";
};

const formatAwardDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  : null;

const getLifecycleTimeline = (data: AwardPageData) => [
  data.awardPublishAt ? `Published: ${formatAwardDateTime(data.awardPublishAt)}` : null,
  data.awardFinalAt ? `Final: ${formatAwardDateTime(data.awardFinalAt)}` : null,
  data.misAwardDeadlineAt ? `Mis-award deadline: ${formatAwardDateTime(data.misAwardDeadlineAt)}` : null,
].filter(Boolean).join(" · ");

const getEmptyStateMessage = (data: AwardPageData) => {
  if (data.availability === "PUBLISH_PENDING") {
    return "The Award display date has arrived, but no matching published roster snapshot is available yet.";
  }
  if (data.availability === "SCHEDULED") {
    const publishAt = formatAwardDateTime(data.awardPublishAt);
    return publishAt
      ? `Award results are scheduled to become available on ${publishAt}.`
      : "Award results are scheduled for a later date.";
  }
  if (data.availability === "UNCONFIGURED") {
    return "The Award period or Award display date has not been configured.";
  }
  return "The published roster snapshot contains no Award duties for this crew.";
};

const formatReasonReportDate = (startDate: string, endDate: string) =>
  startDate === endDate ? startDate : `${startDate} – ${endDate}`;

const formatStartTime = (time: string | null) =>
  time && /^\d{4}$/.test(time) ? `${time.slice(0, 2)}:${time.slice(2)}` : "--";

const getStartLabel = (item: AwardDisplayItem) => {
  const startDate = item.dateRangeLabel.split(" - ")[0] ?? item.dateRangeLabel;

  return `${startDate} ${formatStartTime(item.startTime)}`;
};

const getRouteLabel = (item: AwardDisplayItem) => {
  if (item.type === "pairing") {
    return item.routeLabel;
  }

  if (item.type === "activity") {
    return item.base ?? item.assignment ?? "--";
  }

  return "--";
};

const MissingDataText = ({ reason }: { reason: string }) => (
  <span className="font-semibold text-[#7a5a00]" title={reason}>
    Missing data
  </span>
);

const getTypeLabel = (item: AwardDisplayItem) => {
  if (item.type === "pairing") {
    return "Pairing";
  }

  if (item.type === "day_off") {
    return "Day Off";
  }

  return item.label;
};

const getCodeBadge = (item: AwardDisplayItem) => {
  if (item.type === "day_off") {
    return "DO";
  }

  if (item.type === "activity") {
    return item.label.slice(0, 3).toUpperCase();
  }

  return item.assignment ?? item.assignmentGroup ?? "FLY";
};

const codeBadgeClassName = (item: AwardDisplayItem) => {
  if (item.type === "day_off") {
    return "bg-[#4cc47c] text-white";
  }

  if (item.type === "activity") {
    return "bg-[#f2a33a] text-white";
  }

  return "bg-[#2e91e5] text-white";
};

const AwardSummaryCards = ({ data }: { data: AwardPageData }) => {
  const summaryItems = [
    {
      label: "Period",
      value: data.summary.period,
      icon: RectangleStackIcon,
      iconClassName: "border-[#dce8ff] bg-[#f7faff] text-[#3e8cff]",
      valueClassName: "text-[#2f75dd] text-base leading-6",
    },
    {
      label: "Duties",
      value: data.summary.duties,
      icon: ListBulletIcon,
      iconClassName: "border-[#e6ebf2] bg-[#fbfcfe] text-[#7f8796]",
      valueClassName: "text-[#282c3b] text-2xl leading-7",
    },
    {
      label: "Days Off",
      value: data.summary.daysOff,
      icon: CalendarDaysIcon,
      iconClassName: "border-[#dff3e8] bg-[#f5fcf8] text-[#14a565]",
      valueClassName: "text-[#078047] text-2xl leading-7",
    },
    {
      label: "Pairings",
      value: data.summary.pairings,
      icon: PaperAirplaneIcon,
      iconClassName: "border-[#dcefff] bg-[#f6fbff] text-[#2b99e8]",
      valueClassName: "text-[#1789e8] text-2xl leading-7",
    },
    {
      label: "Credit Hours",
      value: data.summary.creditHours,
      icon: ClockIcon,
      iconClassName: "border-[#e5e1ff] bg-[#faf9ff] text-[#706cd5]",
      valueClassName: "text-[#706cd5] text-2xl leading-7",
    },
    {
      label: "Block Hours",
      value: data.summary.blockHours,
      icon: ChartBarIcon,
      iconClassName: "border-[#ffe9c7] bg-[#fffaf2] text-[#f29a2e]",
      valueClassName: "text-[#f29a2e] text-2xl leading-7",
    },
  ];

  return (
    <dl className="mt-4 grid grid-cols-[1.35fr_repeat(5,minmax(0,1fr))] gap-4" aria-label="Award summary">
      {summaryItems.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className="flex min-h-24 items-center gap-4 rounded-xl border border-[#e3e9f2] bg-white px-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
          >
            <dt className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-sm">
              <span className={`flex h-full w-full items-center justify-center rounded-xl ${item.iconClassName}`}>
                <Icon className="h-6 w-6" />
              </span>
            </dt>
            <dd className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-[#4d5566]">{item.label}</p>
              <p className={`mt-1 truncate font-bold ${item.valueClassName}`}>
                {item.value}
              </p>
            </dd>
          </div>
        );
      })}
    </dl>
  );
};

type RosterDetailsPanelProps = {
  dutyCount: number;
  groups: AwardRosterGroup[];
  emptyStateMessage: string;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
};

const RosterDetailsPanel = ({
  dutyCount,
  groups,
  emptyStateMessage,
  selectedGroupId,
  onSelectGroup,
}: RosterDetailsPanelProps) => {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const selectedItem = selectedGroup?.item ?? null;
  const activeGroupId = selectedGroup?.id ?? null;

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    rowRefs.current.get(activeGroupId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeGroupId]);

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, groupId: string) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectGroup(groupId);
  };

  return (
    <section
      aria-label="Roster details"
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#e3e9f2] bg-white px-4 pb-3 pt-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
      data-testid="award-roster-details-panel"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-bold uppercase leading-6 text-[#101a33]">Roster Details</h2>
        <span className="text-sm font-semibold leading-5 text-[#687184]">
          {dutyCount} {dutyCount === 1 ? "duty" : "duties"} · {groups.length} {groups.length === 1 ? "row" : "rows"}
        </span>
      </div>

      {groups.length > 0 ? (
        <div className="mt-3 grid min-h-0 flex-1 grid-rows-[minmax(10rem,0.85fr)_minmax(13rem,1.15fr)] gap-3">
          <div
            className="min-h-0 overflow-y-auto rounded-lg border border-[#edf1f6]"
            data-testid="award-roster-details-scroll"
          >
            <table className="w-full table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#fbfcfe] text-xs font-bold uppercase leading-5 text-[#687184] shadow-[0_1px_0_#edf1f6]">
                <tr>
                  <th className="w-[82px] px-3 py-2">Code</th>
                  <th className="px-3 py-2">Duty / Activity</th>
                  <th className="w-[150px] px-3 py-2">Start</th>
                  <th className="w-[140px] px-3 py-2">Route / Location</th>
                  <th className="w-[82px] px-3 py-2">Position</th>
                  <th className="w-[80px] px-3 py-2">Credit</th>
                  <th className="w-[95px] px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6] text-[#283146]">
                {groups.map((group) => {
                  const item = group.item;
                  const isSelected = group.id === activeGroupId;

                  return (
                    <tr
                      key={`activity-row-${group.id}`}
                      ref={(node) => {
                        if (node) {
                          rowRefs.current.set(group.id, node);
                        } else {
                          rowRefs.current.delete(group.id);
                        }
                      }}
                      aria-selected={isSelected}
                      className={`h-8 cursor-pointer transition-colors focus:outline-none ${
                        isSelected
                          ? "bg-[#eef6ff] shadow-[inset_3px_0_0_#2e91e5]"
                          : "hover:bg-[#f8fafd] focus:bg-[#f8fafd]"
                      }`}
                      tabIndex={0}
                      onClick={() => onSelectGroup(group.id)}
                      onKeyDown={(event) => handleRowKeyDown(event, group.id)}
                    >
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex h-5 min-w-8 items-center justify-center rounded px-2 text-xs font-bold ${codeBadgeClassName(item)}`}>
                          {getCodeBadge(item)}
                        </span>
                      </td>
                      <td className="truncate px-3 py-1.5 font-semibold">{item.pairingCode ?? item.label}</td>
                      <td className="truncate px-3 py-1.5">{getStartLabel(item)}</td>
                      <td className="truncate px-3 py-1.5">{getRouteLabel(item)}</td>
                      <td className="truncate px-3 py-1.5">{item.position ?? "--"}</td>
                      <td className="truncate px-3 py-1.5">
                        {item.creditMissingReason ? <MissingDataText reason={item.creditMissingReason} /> : item.creditLabel}
                      </td>
                      <td className="truncate px-3 py-1.5">{getTypeLabel(item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section
            aria-label="Selected duty details"
            className="min-h-0 overflow-hidden rounded-lg border border-[#edf1f6] bg-[#fbfcfe] px-3 py-3"
            data-testid="award-selected-duty-details"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase leading-5 text-[#101a33]">Selected Duty</h3>
              <span className="truncate text-xs font-semibold leading-4 text-[#687184]">
                {selectedItem?.type === "pairing"
                  ? `${selectedItem.pairingCode ?? selectedItem.label} #${selectedItem.pairingId ?? "--"}`
                  : selectedItem
                  ? `${selectedItem.label} · ${getTypeLabel(selectedItem)}`
                  : "--"}
              </span>
            </div>
            {selectedItem ? (
              <div
                className="mt-2 max-h-[calc(100%_-_1.75rem)] overflow-y-auto"
                data-testid="award-selected-duty-scroll"
              >
                <AwardTripCard item={selectedItem} />
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div
          className="mt-3 rounded-xl border border-dashed border-[#d8dde6] bg-[#fbfcfe] px-4 py-10 text-center text-sm leading-5 text-[#6f7485]"
          data-testid="award-empty-state"
        >
          {emptyStateMessage}
        </div>
      )}
    </section>
  );
};

const ReasonReportPreview = ({ data }: { data: AwardPageData }) => (
  <section
    aria-label="Reason report preview"
    className="shrink-0 rounded-xl border border-[#e3e9f2] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
  >
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-sm font-bold uppercase leading-5 text-[#101a33]">Reason Report Preview</h2>
      <ClipboardDocumentListIcon className="h-5 w-5 text-[#8a91a3]" />
    </div>
    {data.report.available ? (
      <div className="mt-3 divide-y divide-[#edf1f6] rounded-lg border border-[#edf1f6] text-sm">
        {data.report.items.slice(0, 3).map((item) => (
          <div className="grid grid-cols-[minmax(118px,auto)_1fr] gap-x-3 gap-y-1 px-3 py-2" key={item.id}>
            <span className="font-semibold text-[#283146]">{item.pairingCode}</span>
            <span className="text-right text-xs text-[#687184]">
              {formatReasonReportDate(item.startDate, item.endDate)}
            </span>
            <span className="col-span-2 text-[#4f586c]">{item.explanation}</span>
          </div>
        ))}
        {data.report.items.length > 3 ? (
          <p className="px-3 py-2 text-right text-xs font-semibold text-[#706cd5]">
            + {data.report.items.length - 3} more explanation{data.report.items.length - 3 === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    ) : (
      <p className="mt-3 rounded-lg border border-dashed border-[#d8dde6] bg-[#fbfcfe] px-3 py-4 text-sm leading-5 text-[#687184]">
        {data.report.disabledReason ?? "No award explanations are available for this period."}
      </p>
    )}
  </section>
);

export const AwardRightPanel = ({ data, periodControl }: AwardRightPanelProps) => {
  const [reasonReportOpen, setReasonReportOpen] = useState(false);
  const [selectedRosterGroupId, setSelectedRosterGroupId] = useState<string | null>(
    data.rosterGroups[0]?.id ?? null,
  );
  const reasonReportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedRosterGroup = data.rosterGroups.find(
    (group) => group.id === selectedRosterGroupId,
  ) ?? data.rosterGroups[0] ?? null;

  useEffect(() => {
    if (selectedRosterGroup?.id !== selectedRosterGroupId) {
      setSelectedRosterGroupId(selectedRosterGroup?.id ?? null);
    }
  }, [selectedRosterGroup?.id, selectedRosterGroupId]);

  const handleReasonReportOpenChange = (open: boolean) => {
    setReasonReportOpen(open);

    if (!open) {
      window.setTimeout(() => reasonReportTriggerRef.current?.focus(), 0);
    }
  };

  const handleCalendarEventSelect = (eventId: string) => {
    const group = data.rosterGroups.find((candidate) =>
      candidate.calendarEventIds.includes(eventId),
    );

    if (group) {
      setSelectedRosterGroupId(group.id);
    }
  };

  return (
    <>
      <section
        className="flex h-[var(--portal-page-shell-height)] max-h-[var(--portal-page-shell-height)] min-h-0 flex-col overflow-hidden rounded-xl bg-white px-7 pb-8 pt-7 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
        data-uiid="award-results-page"
        data-testid="award-results-page"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold uppercase leading-8 text-[#101a33]">Award</h1>
            <span className={`inline-flex h-8 items-center rounded-md border px-3 text-sm font-semibold ${
              data.published
                ? "border-[#a8e7c4] bg-[#f1fff7] text-[#078047]"
                : "border-[#d8dde6] bg-[#fbfcfe] text-[#687184]"
            }`}
              title={getLifecycleTimeline(data)}
            >
              {getStatusLabel(data)}
            </span>
            <span className="inline-flex h-8 items-center rounded-md border border-[#d8dde6] bg-[#fbfcfe] px-3 text-xs font-semibold leading-4 text-[#687184]">
              {data.timeZone.timezoneLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {periodControl}
          <Button
            aria-disabled={!data.report.available}
            className="h-9 shrink-0 rounded-lg border border-[#9a86e8] bg-white px-4 text-sm font-semibold text-[#706cd5] shadow-none hover:bg-[#f8f5ff] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!data.report.available}
            title={data.report.available ? undefined : data.report.disabledReason}
            type="button"
            onClick={(event) => {
              reasonReportTriggerRef.current = event.currentTarget;
              setReasonReportOpen(true);
            }}
          >
            View Reason Report
          </Button>
          </div>
        </div>

        <AwardSummaryCards data={data} />

        {data.warnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-[#f0dba5] bg-[#fff9e9] px-3 py-2 text-xs leading-4 text-[#7a5a00]">
            {data.warnings.join(" ")}
          </div>
        ) : null}

        {data.availability === "AVAILABLE" && data.upcomingPeriod ? (
          <div className="mt-4 rounded-lg border border-[#cfd9ef] bg-[#f6f8ff] px-3 py-2 text-xs leading-4 text-[#4f5f86]" role="status">
            {data.upcomingPeriod.periodCode} is {data.upcomingPeriod.lifecycleStage === "PUBLISH_PENDING"
              ? "awaiting roster publication"
              : data.upcomingPeriod.lifecycleStage === "SCHEDULED"
                ? "scheduled for a later Award publish time"
                : "not fully configured"}. Showing the latest published Award.
          </div>
        ) : null}

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1.1fr_0.9fr] items-stretch gap-4" data-testid="award-detail-grid">
          <AwardMonthCalendar
            calendar={data.calendar}
            selectedEventIds={selectedRosterGroup?.calendarEventIds ?? []}
            onSelectEvent={handleCalendarEventSelect}
          />
          <div className="flex min-h-0 flex-col gap-4" data-testid="award-side-panel">
            <RosterDetailsPanel
              dutyCount={data.items.length}
              groups={data.rosterGroups}
              emptyStateMessage={getEmptyStateMessage(data)}
              selectedGroupId={selectedRosterGroup?.id ?? null}
              onSelectGroup={setSelectedRosterGroupId}
            />
            <ReasonReportPreview data={data} />
          </div>
        </div>
      </section>

      <AppDialog
        bodyClassName="space-y-3"
        className="max-w-2xl"
        data-testid="award-reason-report-dialog"
        description={data.periodCode}
        icon={<ClipboardDocumentListIcon className="h-4 w-4" />}
        onOpenChange={handleReasonReportOpenChange}
        open={reasonReportOpen}
        title="Award Reason Report"
      >
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.report.items.map((item) => (
            <article className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1 px-4 py-3" key={item.id}>
              <h3 className="font-semibold text-foreground">{item.pairingCode}</h3>
              <p className="text-right text-xs text-muted-foreground">
                {formatReasonReportDate(item.startDate, item.endDate)}
              </p>
              <p className="col-span-2 text-sm text-foreground">{item.explanation}</p>
            </article>
          ))}
        </div>
      </AppDialog>
    </>
  );
};
