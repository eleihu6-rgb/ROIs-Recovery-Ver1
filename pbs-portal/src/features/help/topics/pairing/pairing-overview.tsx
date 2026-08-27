import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpOutcome,
  HelpParagraph,
  HelpScreenshot,
} from "@/features/help/components/help-article";

export default function PairingOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/pairing-overview.png"
        alt="Pairing page right panel with existing and add pairing properties"
        caption="Pairing is the main bid workspace for properties, rules, previews, favorites, and pool counts."
      />
      <HelpH2>What you use it for</HelpH2>
      <HelpParagraph>
        Use Pairing to add or edit pairing properties in the current draft. Existing rows show saved properties and the
        <strong>ADD PAIRING PROPERTIES</strong> section lists available catalog and favorite entries.
      </HelpParagraph>
      <HelpH2>What makes Pairing different</HelpH2>
      <HelpParagraph>
        Pairing also provides pool counts, rule-expression view, Preview actions, and <strong>SEARCH PAIRINGS</strong>.
      </HelpParagraph>
      <HelpFieldTable title="Pairing workspace areas" items={[
        { label: "EXISTING PAIRING PROPERTIES", details: "Saved pairing rules in the current draft, with PROPERTY, BID, TIERS, and COUNT columns." },
        { label: "Pool-count toolbar", details: "Shows current tier, rule count, pairing result count, REFRESH, VIEW RULES / VIEW PROPERTIES, and SEARCH PAIRINGS." },
        { label: "ADD PAIRING PROPERTIES", details: "Catalog and favorite area for adding new pairing rules." },
        { label: "Search Pairings page", details: "Preview page for one property or for the current active rules." },
      ]} />
      <HelpH2>Common workflow</HelpH2>
      <HelpList items={[
        "Check existing rows and counts first.",
        "Use VIEW RULES if you want to inspect the rule expression by tier instead of the editable row table.",
        "Use ADD PAIRING PROPERTIES, ALL PROPERTIES, FAVORITED PROPERTIES, and Search Properties to find a condition.",
        "Configure the bid in Configure Pairing Bid, then add it to the current draft.",
        "Use REFRESH or SEARCH PAIRINGS when you need count or matching-pairing evidence for the current rules.",
      ]} />
      <HelpOutcome>
        Pairing changes save to the current draft and refresh the related calendar and Bid review data. Pool counts may
        become stale until they are refreshed.
      </HelpOutcome>
      <HelpControlsRef items={[
        { name: "REFRESH", description: "Recalculates pool counts for the current tier and draft state." },
        { name: "VIEW RULES / VIEW PROPERTIES", description: "Switches between rule expression view and editable property rows." },
        { name: "SEARCH PAIRINGS", description: "Opens Search Pairings using the active current rules when at least one tier has rules." },
      ]} />
    </>
  );
}
