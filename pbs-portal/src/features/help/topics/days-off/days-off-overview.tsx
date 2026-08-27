import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpOutcome,
  HelpParagraph,
  HelpScreenshot,
} from "@/features/help/components/help-article";

export default function DaysOffOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/days-off-overview.png"
        alt="Days Off page with existing and available properties"
        caption="Days Off uses the shared Rule Bid panel pattern with existing properties and addable properties."
      />
      <HelpH2>What you use it for</HelpH2>
      <HelpParagraph>
        Use Days Off to manage date-based bids in the current draft. The right panel contains existing saved properties
        and the <strong>ADD DAYS OFF PROPERTIES</strong> area for new entries.
      </HelpParagraph>
      <HelpH2>Screen layout</HelpH2>
      <HelpFieldTable items={[
        { label: "EXISTING DAYS OFF PROPERTIES", details: "Rows already saved in the current draft. Each row has PROPERTY, BID, and TIERS columns." },
        { label: "ADD DAYS OFF PROPERTIES", details: "Catalog of available Days Off properties. Use tabs and search before adding a row." },
        { label: "ALL PROPERTIES", details: "Shows the Days Off property catalog currently returned by the service." },
        { label: "FAVORITED PROPERTIES", details: "Shows saved favorite templates when favorites are available." },
        { label: "Search Properties", details: "Filters the visible available properties by property name." },
      ]} />
      <HelpH2>How changes save</HelpH2>
      <HelpParagraph>
        Add, update, and delete actions call the Days Off draft service and refresh the related bidding calendar and
        Bid review data.
      </HelpParagraph>
      <HelpH2>Typical workflow</HelpH2>
      <HelpList items={[
        "Open Days Off from the top navigation.",
        "Check EXISTING DAYS OFF PROPERTIES to avoid duplicating the same date or pattern.",
        "Use ADD DAYS OFF PROPERTIES, the ALL PROPERTIES tab, and Search Properties to find the property you need.",
        "Configure dates, tiers, time windows, or modifiers in Configure Days Off Bid.",
        "Review the saved row and then verify the Bid workspace or Dashboard calendar when needed.",
      ]} />
      <HelpOutcome>
        A successful add, update, or delete changes the current draft and refreshes the calendar and Bid review with
        the new Days Off state.
      </HelpOutcome>
      <HelpControlsRef items={[
        { name: "PROPERTY", description: "Name of the Days Off bid property." },
        { name: "BID", description: "Configured date, weekday, range, time, or modifier summary for that property." },
        { name: "TIERS", description: "T1-T7 toggles that determine where the Days Off bid applies." },
      ]} />
    </>
  );
}
