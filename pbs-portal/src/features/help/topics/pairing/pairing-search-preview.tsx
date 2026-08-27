import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function PairingSearchPreview() {
  return (
    <>
      <HelpH2>Open a preview</HelpH2>
      <HelpStep n={1}>
        From a pairing row, click the preview action to inspect pairings matching that single property.
      </HelpStep>
      <HelpStep n={2}>
        From the Pairing toolbar, click <strong>SEARCH PAIRINGS</strong> to preview pairings matching the current
        active draft rules.
      </HelpStep>
      <HelpStep n={3}>
        On the Search Pairings page, review <strong>SEARCH CRITERIA</strong> and <strong>SEARCH RESULTS</strong>.
      </HelpStep>
      <HelpStep n={4}>
        Use <strong>Back</strong> to return to the Pairing workbench when you are done.
      </HelpStep>
      <HelpFieldTable title="Search Pairings page" items={[
        { label: "SEARCH CRITERIA", details: "The selected property rules used to calculate results." },
        { label: "ADD MORE SEARCH CRITERIA", details: "Opens a picker with ALL PROPERTIES, FAVORITED PROPERTIES, and Search Properties." },
        { label: "BID THESE PROPERTIES", details: "Creates bids from selected criteria after choosing a tier in the Choose Tier dialog." },
        { label: "SEARCH RESULTS", details: "Matching pairings with pairing number, base, report time, block/credit values, legs, and active dates." },
        { label: "Pagination footer", details: "Total item count, previous/next page buttons, page numbers, page size display, and Go to page input." },
      ]} />
      <HelpH2>Preview vs current rules</HelpH2>
      <HelpList items={[
        "A row preview follows one property or one favorite template.",
        "SEARCH PAIRINGS follows the current saved draft rules and active tier context.",
        "If no tier has active pairing rules, the Portal asks you to add at least one pairing property before searching.",
      ]} />
      <HelpOutcome>
        Previewing does not automatically change the draft. Draft changes happen only through add, update, delete, or
        BID THESE PROPERTIES actions.
      </HelpOutcome>
      <HelpNote>
        Search Preview is a review workflow. Adding or editing the bid still happens from the Pairing panel.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "Preview", description: "Opens Search Pairings for one property." },
        { name: "SEARCH PAIRINGS", description: "Searches using the current active draft rules." },
        { name: "Search Pairings", description: "Result page for matching pairings and duty details." },
        { name: "Back", description: "Returns from Search Pairings to the Pairing workbench." },
      ]} />
    </>
  );
}
