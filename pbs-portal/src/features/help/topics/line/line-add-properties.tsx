import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function LineAddProperties() {
  return (
    <>
      <HelpH2>Add a line property</HelpH2>
      <HelpStep n={1}>
        Open <strong>Line</strong> from the top navigation.
      </HelpStep>
      <HelpStep n={2}>
        In <strong>ADD LINE PROPERTIES</strong>, use <strong>ALL PROPERTIES</strong> or <strong>FAVORITED PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Type into <strong>Search Properties</strong> to find the property by name.
      </HelpStep>
      <HelpStep n={4}>
        For a simple row, select T1-T7 when visible and click add. The row is saved into{" "}
        <strong>EXISTING LINE PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={5}>
        For a configurable row, click add and complete <strong>Configure Line Bid</strong> before saving.
      </HelpStep>
      <HelpFieldTable title="Configure Line Bid" items={[
        { label: "PREFERENCE", details: "Appears for Mixed Line Bid, Efficient Flying First, and credit-window preferences. Choose the displayed option before saving." },
        { label: "BID", details: "Property-specific input. It can be text, number, work/off pattern, minimum base layover, credit window, or reserve/flying date pattern." },
        { label: "APPLY TO TIERS", details: "T1-T7 selection for where this Line bid applies." },
        { label: "SAVE FAVORITE", details: "Stores the configured Line property as a reusable favorite when available." },
        { label: "ADD BID", details: "Adds the configured Line property to the current draft." },
      ]} />
      <HelpFieldTable title="Line bid examples" items={[
        { label: "Commuter Pattern", details: "Uses minimum days off plus min/max days on." },
        { label: "Mixed Line Bid", details: "Mixed Line is the default and saves no 427 bid. Reserve Only saves reserve-only; Pairing Only saves pairing-only." },
        { label: "Efficient Flying First", details: "Award prioritizes highest average daily credit first. Avoid prioritizes lowest average daily credit first." },
        { label: "Reserve / Flying Date Pattern", details: "Uses segments with Work Type, Call Type or Any Flying, Date Scope, ADD SEGMENT, and Preference Strength." },
      ]} />
      <HelpOutcome>
        The saved Line bid appears in the existing list. The BID column shows a readable summary instead of exposing all
        dialog inputs inline.
      </HelpOutcome>
      <HelpNote>
        Configurable catalog rows may hide inline tier controls until the dialog opens. This keeps incomplete bids from
        being added without required values.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "ADD LINE PROPERTIES", description: "Available line-property catalog and favorites." },
        { name: "Search Properties", description: "Filters available line properties." },
        { name: "Configure Line Bid", description: "Dialog for complex Line bid properties." },
        { name: "ADD BID", description: "Confirms configured line bids." },
      ]} />
    </>
  );
}
