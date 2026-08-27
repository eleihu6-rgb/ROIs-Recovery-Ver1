import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function PairingAddProperties() {
  return (
    <>
      <HelpH2>Add from the catalog</HelpH2>
      <HelpStep n={1}>
        Open <strong>Pairing</strong> from the top navigation.
      </HelpStep>
      <HelpStep n={2}>
        In <strong>ADD PAIRING PROPERTIES</strong>, select <strong>ALL PROPERTIES</strong> for catalog rows or{" "}
        <strong>FAVORITED PROPERTIES</strong> for saved templates.
      </HelpStep>
      <HelpStep n={3}>
        Type into <strong>Search Properties</strong> to filter the available list by property name.
      </HelpStep>
      <HelpStep n={4}>
        Read the row columns. <strong>PROPERTY</strong> is the condition name, <strong>BID</strong> shows the current
        configured value or placeholder, and <strong>TIERS</strong> appears for rows where tier selection is available.
      </HelpStep>
      <HelpStep n={5}>
        Click the add action beside the property. Catalog rows normally open <strong>Configure Pairing Bid</strong>;
        favorite rows can be copied directly into the current draft.
      </HelpStep>
      <HelpStep n={6}>
        Use the footer pagination when there are more than 10 matching available properties.
      </HelpStep>
      <HelpFieldTable title="Available property row actions" items={[
        { label: "Add", details: "Starts adding the selected property. For configurable catalog rows, opens Configure Pairing Bid." },
        { label: "Preview", details: "Appears for favorite rows and opens Search Pairings for that saved configuration." },
        { label: "Delete favorite", details: "Appears for favorite rows and asks for confirmation before removing the template." },
        { label: "T1-T7", details: "Visible in FAVORITED PROPERTIES and readonly for saved favorite templates." },
      ]} />
      <HelpOutcome>
        After a successful add, the property appears under <strong>EXISTING PAIRING PROPERTIES</strong>, pool counts
        are marked stale or refreshed, and the Bid review data can reload.
      </HelpOutcome>
      <HelpNote>
        If you add a property that conflicts with an existing rule in the same tier, the Portal shows an error message
        and does not save the duplicate or single-use condition.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "ADD PAIRING PROPERTIES", description: "Available pairing property catalog and favorites." },
        { name: "ALL PROPERTIES", description: "Catalog tab for all visible pairing properties." },
        { name: "FAVORITED PROPERTIES", description: "Reusable configured properties saved as favorites." },
        { name: "Search Properties", description: "Filters available pairing properties by property name." },
        { name: "Pagination", description: "Moves through the available pairing property catalog when more rows are available." },
      ]} />
    </>
  );
}
