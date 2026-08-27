import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
  HelpTip,
} from "@/features/help/components/help-article";

export default function LineFavoritesTiers() {
  return (
    <>
      <HelpH2>Apply Line bids to tiers</HelpH2>
      <HelpStep n={1}>
        Use T1-T7 controls to choose where a line property applies. In the Line dialog this section is labeled{" "}
        <strong>APPLY TO TX</strong>.
      </HelpStep>
      <HelpStep n={2}>
        At least one tier remains active. If only one tier is selected, clicking it again will not remove the final tier.
      </HelpStep>
      <HelpStep n={3}>
        Save reusable line configurations as favorites when <strong>SAVE FAVORITE</strong> is available.
      </HelpStep>
      <HelpStep n={4}>
        Reuse a favorite from <strong>FAVORITED PROPERTIES</strong>. Favorite rows keep their saved bid values and tier
        state.
      </HelpStep>
      <HelpFieldTable title="Favorites and tiers" items={[
        { label: "Catalog row favorite", details: "Simple Line properties can expose a favorite action directly in ALL PROPERTIES." },
        { label: "Configured favorite", details: "Complex Line properties are favorited from Configure Line Bid after their details are complete." },
        { label: "Favorite row tiers", details: "Shown in FAVORITED PROPERTIES and read-only because they come from the saved template." },
        { label: "Existing row tiers", details: "Editable T1-T7 controls when the saved row supports direct tier changes." },
      ]} />
      <HelpOutcome>
        Reusing a favorite adds a Line bid to the current draft. Removing the favorite deletes the reusable template,
        not existing draft rows created from it.
      </HelpOutcome>
      <HelpTip>
        Some configured line properties are favorited from the dialog after their details are complete.
      </HelpTip>
      <HelpNote>
        Favorite behavior is intentionally different from deleting an existing Line row. Use the row delete action under
        existing properties if you want to remove a saved draft bid.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "APPLY TO TX", description: "Dialog tier control for where the line bid applies." },
        { name: "T1-T7", description: "Tier controls for where the line bid applies." },
        { name: "SAVE FAVORITE", description: "Stores a configured line property for reuse." },
        { name: "FAVORITED PROPERTIES", description: "Saved line-property templates." },
        { name: "Remove favorite", description: "Deletes the favorite template after confirmation." },
      ]} />
    </>
  );
}
