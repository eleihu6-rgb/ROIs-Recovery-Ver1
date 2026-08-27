import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpOutcome,
  HelpStep,
  HelpTip,
} from "@/features/help/components/help-article";

export default function DaysOffAdd() {
  return (
    <>
      <HelpH2>Add from the right panel</HelpH2>
      <HelpStep n={1}>
        Open <strong>Days Off</strong> from the top navigation.
      </HelpStep>
      <HelpStep n={2}>
        In <strong>ADD DAYS OFF PROPERTIES</strong>, keep <strong>ALL PROPERTIES</strong> selected or switch to{" "}
        <strong>FAVORITED PROPERTIES</strong> when you want a saved template.
      </HelpStep>
      <HelpStep n={3}>
        Type into <strong>Search Properties</strong> to filter by property name. Clearing the search restores the full
        visible list.
      </HelpStep>
      <HelpStep n={4}>
        Click the add action beside the property. Date-based properties open <strong>Configure Days Off Bid</strong>.
      </HelpStep>
      <HelpStep n={5}>
        In the dialog, select at least one tier under <strong>TIERS</strong>, configure the bid fields, then click{" "}
        <strong>ADD BID</strong>.
      </HelpStep>
      <HelpFieldTable title="Configure Days Off Bid" items={[
        { label: "TIERS", details: "T1-T7 selection. At least one active tier is required before ADD BID can save." },
        { label: "DATES", details: "Adds one or more specific days off dates." },
        { label: "DAYS OF WEEK", details: "Adds recurring weekday preferences for the bid period." },
        { label: "DATE RANGE", details: "Adds a continuous date range preference." },
        { label: "ADD DATE", details: "Adds the selected date into the Dates list." },
        { label: "SAVE FAVORITE", details: "Stores the configured bid as a reusable template when favorite support is available." },
      ]} />
      <HelpH2>What ADD BID requires</HelpH2>
      <HelpList items={[
        "A valid tier selection.",
        "A valid date, weekday, or date range.",
        "A valid date range where the end date is the same as or later than the start date.",
      ]} />
      <HelpOutcome>
        The new row appears in <strong>EXISTING DAYS OFF PROPERTIES</strong>. The draft service saves it immediately,
        then the related calendar and Bid review data can refresh.
      </HelpOutcome>
      <HelpTip>
        Calendar-driven days-off actions and the right-panel add flow both update the same current draft.
      </HelpTip>
      <HelpControlsRef items={[
        { name: "ADD DAYS OFF PROPERTIES", description: "Catalog of days-off properties that can be added to the draft." },
        { name: "Search Properties", description: "Filters the available property list by property name." },
        { name: "ADD BID", description: "Confirms the configured days-off bid." },
        { name: "Pagination", description: "Moves through the available property catalog when more rows are available." },
      ]} />
    </>
  );
}
