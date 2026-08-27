import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpOutcome,
  HelpStep,
  HelpWarning,
} from "@/features/help/components/help-article";

export default function LineEditConfigured() {
  return (
    <>
      <HelpH2>Edit configured Line rows</HelpH2>
      <HelpStep n={1}>
        Find the line property under <strong>EXISTING LINE PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={2}>
        Check the <strong>BID</strong> summary to make sure you are editing the correct configured row.
      </HelpStep>
      <HelpStep n={3}>
        Click the edit action for configurable properties such as <strong>Commuter Pattern</strong>,{" "}
        <strong>Efficient Flying First</strong>, <strong>Mixed Line Bid</strong>, or{" "}
        <strong>Reserve / Flying Date Pattern</strong>.
      </HelpStep>
      <HelpStep n={4}>
        In <strong>Configure Line Bid</strong>, update the field values or <strong>APPLY TO TIERS</strong>.
      </HelpStep>
      <HelpStep n={5}>
        Click <strong>UPDATE BID</strong>. The current draft identity and version are updated after the service confirms
        the change.
      </HelpStep>
      <HelpH2>Delete a row</HelpH2>
      <HelpStep n={1}>
        Click the delete action beside the existing Line row.
      </HelpStep>
      <HelpStep n={2}>
        Wait for the save operation to finish. The row is removed from <strong>EXISTING LINE PROPERTIES</strong>.
      </HelpStep>
      <HelpFieldTable title="Validation examples" items={[
        { label: "Mixed Line Bid", details: "Choose Reserve Only or Pairing Only, then select at least one Tier before ADD BID can save. Editing an existing row back to Mixed Line removes the 427 bid." },
        { label: "Efficient Flying First", details: "Requires Award or Avoid before ADD BID / UPDATE BID can save." },
        { label: "Commuter Pattern", details: "Pattern days must be at least 1 and max days on must be greater than or equal to min days on." },
        { label: "Reserve / Flying Date Pattern", details: "Requires at least one segment, complete date scopes, and no more than four segments." },
      ]} />
      <HelpOutcome>
        The BID summary and Bid review update after a successful edit because Line rows contribute to the current draft.
      </HelpOutcome>
      <HelpWarning>
        Simple line properties may not show an edit action. Use the available tier controls or delete/re-add pattern
        that the row exposes.
      </HelpWarning>
      <HelpControlsRef items={[
        { name: "EXISTING LINE PROPERTIES", description: "Saved line properties in the current draft." },
        { name: "Edit", description: "Opens the configured bid editor for editable rows." },
        { name: "Delete", description: "Removes the selected Line row from the current draft." },
        { name: "UPDATE BID", description: "Applies changes to the selected existing property." },
      ]} />
    </>
  );
}
