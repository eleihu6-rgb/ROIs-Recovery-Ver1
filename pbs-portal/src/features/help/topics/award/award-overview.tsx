import {
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpParagraph,
  HelpScreenshot,
  HelpStep,
} from "@/features/help/components/help-article";

export default function AwardOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/award-overview.png"
        alt="Award page with published roster and duty details"
        caption="Award displays the published roster and details available for each duty."
      />
      <HelpH2>View published results</HelpH2>
      <HelpStep n={1}>
        Open <strong>Award</strong> after the result for the bid period is published.
      </HelpStep>
      <HelpStep n={2}>
        Use <strong>Award period</strong> when it appears to switch between readable published periods.
      </HelpStep>
      <HelpStep n={3}>
        Review the month calendar and the duty or activity blocks shown on each date.
      </HelpStep>
      <HelpStep n={4}>
        Select a duty or activity to review <strong>Roster Details</strong> and <strong>Selected Duty</strong>.
      </HelpStep>
      <HelpStep n={5}>
        Review <strong>Reason Report Preview</strong> or <strong>Award Explanation</strong> when that information is available.
      </HelpStep>
      <HelpFieldTable title="Award areas" items={[
        { label: "Award period", details: "Shown only when the service returns at least one readable published, final, or mis-award-closed period for the crew." },
        { label: "Roster Details", details: "Lists the published duties and activities for the displayed period." },
        { label: "Selected Duty", details: "Shows route, time, position, credit, and segment details for the selected item." },
        { label: "Reason Report Preview", details: "Shows available result explanation information." },
      ]} />
      <HelpH2>Status labels</HelpH2>
      <HelpFieldTable title="Publication status" items={[
        { label: "Published", details: "A published roster snapshot is available for the selected period." },
        { label: "Final", details: "The period has reached final status and remains readable." },
        { label: "Mis-award Closed", details: "Mis-award review is closed and the period remains readable." },
        { label: "Awaiting publication", details: "The Award display date has arrived, but no matching published roster snapshot is available yet." },
        { label: "Scheduled", details: "Award results are configured for a later display date." },
        { label: "Award period not configured", details: "The period or Award display date is missing configuration." },
      ]} />
      <HelpH2>Summary fields</HelpH2>
      <HelpFieldTable title="Roster summary" items={[
        { label: "Period", details: "The roster period currently displayed." },
        { label: "Duties", details: "Count of duties or activities in the published roster snapshot." },
        { label: "Days Off", details: "Count of published off-day items in the displayed Award roster." },
        { label: "Pairings", details: "Count of published flying pairings in the displayed Award roster." },
        { label: "Credit Hours", details: "Award credit in HH:MM when the published snapshot has credit data. Missing data means the roster exists but credit information was not returned." },
        { label: "Block Hours", details: "Sum of block time from the published duty items, shown as HH:MM when available or -- when not available." },
      ]} />
      <HelpParagraph>
        If a newer period is scheduled or awaiting publication but an older readable Award exists, the page may show a
        notice and display the latest published Award instead of a blank future period.
      </HelpParagraph>
      <HelpList items={[
        "A 0 count means the published roster snapshot exists but that item type was not found for the crew.",
        "-- means the field is not available for the selected period.",
        "The Reason Report button is disabled when no award explanations are available for the period.",
      ]} />
      <HelpOutcome>
        Use Award to inspect published results and explanations. Use Bid and Standing Bid to edit future requests.
      </HelpOutcome>
      <HelpNote>
        Award is a result view. Saving a Bid does not create an Award immediately.
      </HelpNote>
    </>
  );
}
