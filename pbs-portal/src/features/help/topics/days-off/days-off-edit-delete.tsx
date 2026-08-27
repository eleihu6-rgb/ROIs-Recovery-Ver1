import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpOutcome,
  HelpStep,
  HelpWarning,
} from "@/features/help/components/help-article";

export default function DaysOffEditDelete() {
  return (
    <>
      <HelpH2>Edit an existing row</HelpH2>
      <HelpStep n={1}>
        Find the row in <strong>EXISTING DAYS OFF PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={2}>
        Review the <strong>PROPERTY</strong>, <strong>BID</strong>, and <strong>TIERS</strong> columns so you edit
        the correct row.
      </HelpStep>
      <HelpStep n={3}>
        Click the edit action on the row. The same <strong>Configure Days Off Bid</strong> dialog opens with the saved
        values loaded.
      </HelpStep>
      <HelpStep n={4}>
        Change dates, days, time window, modifiers, or tier selection, then click <strong>UPDATE BID</strong>.
      </HelpStep>
      <HelpOutcome>
        The row updates in place under <strong>EXISTING DAYS OFF PROPERTIES</strong>. The bidding calendar and Bid
        review data are refreshed after the save path completes.
      </HelpOutcome>
      <HelpH2>Delete an existing row</HelpH2>
      <HelpStep n={1}>
        Click the delete action for the row you want to remove.
      </HelpStep>
      <HelpStep n={2}>
        Wait for the save operation to finish. The row disappears from the existing list after the draft is updated.
      </HelpStep>
      <HelpFieldTable title="Existing row controls" items={[
        { label: "Delete", details: "Removes the selected Days Off row from the current draft." },
        { label: "Edit", details: "Reopens Configure Days Off Bid for a saved row." },
        { label: "T1-T7", details: "Can be toggled for existing properties when the row supports tier editing. At least one tier remains active." },
      ]} />
      <HelpWarning>
        Save conflicts or server errors are shown through the Portal message system. If a conflict appears, reload the
        current draft before continuing.
      </HelpWarning>
      <HelpControlsRef items={[
        { name: "EXISTING DAYS OFF PROPERTIES", description: "Saved days-off properties in the current draft." },
        { name: "Edit", description: "Opens the bid dialog for the selected row." },
        { name: "Delete", description: "Removes the selected row from the current draft." },
        { name: "UPDATE BID", description: "Saves changes made to an existing Days Off bid." },
      ]} />
    </>
  );
}
