import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
  HelpTip,
} from "@/features/help/components/help-article";

export default function DaysOffFavorites() {
  return (
    <>
      <HelpH2>Save a reusable bid</HelpH2>
      <HelpStep n={1}>
        Add or edit a Days Off property until the dialog contains the dates, days, time window, modifiers, and tiers
        you expect to reuse.
      </HelpStep>
      <HelpStep n={2}>
        Click <strong>SAVE FAVORITE</strong> when the dialog offers favorite support.
      </HelpStep>
      <HelpStep n={3}>
        Open the <strong>FAVORITED PROPERTIES</strong> tab in <strong>ADD DAYS OFF PROPERTIES</strong> to reuse the
        saved configured property.
      </HelpStep>
      <HelpStep n={4}>
        Click the add action on the favorite row. The favorite is copied into the current draft as a new existing bid.
      </HelpStep>
      <HelpFieldTable title="Favorites behavior" items={[
        { label: "Favorite template", details: "Saved configuration used as a starting point for future Days Off bids." },
        { label: "Existing row", details: "A bid already saved in the current draft. It is not removed when a favorite is removed." },
        { label: "Remove favorite", details: "Deletes the reusable template from FAVORITED PROPERTIES." },
      ]} />
      <HelpOutcome>
        Reusing a favorite creates or adds a current draft row; removing a favorite only removes the template.
      </HelpOutcome>
      <HelpTip>
        Favorites are stored by stable favorite keys. Removing a favorite does not remove an already saved bid from the
        current draft.
      </HelpTip>
      <HelpNote>
        If <strong>SAVE FAVORITE</strong> is not visible for a Days Off property, that property is not currently exposed
        as a configured favorite action in this workflow.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "SAVE FAVORITE", description: "Saves the configured property as a reusable template." },
        { name: "FAVORITED PROPERTIES", description: "Tab containing reusable configured properties." },
        { name: "Remove favorite", description: "Deletes the favorite template, not the existing draft row." },
      ]} />
    </>
  );
}
