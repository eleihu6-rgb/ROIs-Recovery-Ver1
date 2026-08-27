import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
  HelpTip,
} from "@/features/help/components/help-article";

export default function PairingFavorites() {
  return (
    <>
      <HelpH2>Create a favorite</HelpH2>
      <HelpStep n={1}>
        Open <strong>Configure Pairing Bid</strong> for a property you want to reuse.
      </HelpStep>
      <HelpStep n={2}>
        Complete all required fields: <strong>TIERS</strong>, <strong>MODE</strong>, <strong>QUANTIFIER</strong>, and{" "}
        <strong>BID</strong> when they appear.
      </HelpStep>
      <HelpStep n={3}>
        Click <strong>SAVE FAVORITE</strong>. The configured favorite appears in the available property list as a
        saved template.
      </HelpStep>
      <HelpStep n={4}>
        Open <strong>FAVORITED PROPERTIES</strong> and click add to copy that template into the current draft.
      </HelpStep>
      <HelpFieldTable title="Favorite row behavior" items={[
        { label: "Add", details: "Copies the favorite configuration into EXISTING PAIRING PROPERTIES." },
        { label: "Preview", details: "Opens Search Pairings for the favorite configuration." },
        { label: "Delete favorite", details: "Opens a confirmation card. Confirm Remove deletes the template." },
        { label: "TIERS", details: "Favorite tier buttons are shown but readonly because the saved template owns that tier state." },
      ]} />
      <HelpOutcome>
        A favorite is reusable configuration. It is separate from any current draft row created from that favorite.
      </HelpOutcome>
      <HelpTip>
        A favorite is a reusable template. Adding a favorite creates a new current-draft property row.
      </HelpTip>
      <HelpNote>
        Removing a favorite does not delete an existing Pairing row already saved in the current draft.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "SAVE FAVORITE", description: "Saves a configured pairing property for reuse." },
        { name: "FAVORITED PROPERTIES", description: "Tab containing saved pairing favorite entries." },
        { name: "Confirm Remove", description: "Deletes the favorite template after confirmation." },
      ]} />
    </>
  );
}
