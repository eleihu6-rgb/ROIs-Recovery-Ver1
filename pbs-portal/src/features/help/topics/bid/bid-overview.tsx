import {
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpParagraph,
  HelpScreenshot,
} from "@/features/help/components/help-article";

export default function BidOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/bid-overview.png"
        alt="Bid page with existing conditions and available property categories"
        caption="Bid keeps Current Days Off, Pairing, and Roster conditions in one workspace."
      />
      <HelpH2>What you use it for</HelpH2>
      <HelpParagraph>
        Use Bid to add and maintain Current Bid conditions for the active bid period. Days Off, Pairing, and Roster
        conditions share one Existing list; Reserve Preference is opened from ROSTER.
      </HelpParagraph>
      <HelpFieldTable title="Bid workspace" items={[
        { label: "EXISTING BID PROPERTIES", details: "Saved Current Bid conditions for the active Tier view." },
        { label: "Pairing toolbar", details: "Shows Pairing pool information and the REFRESH, VIEW RULES, and SEARCH PAIRINGS actions." },
        { label: "BID REVIEW", details: "Shows review information for the active Tier when attention is needed." },
        { label: "ADD BID PROPERTIES", details: "Contains FAVORITED PROPERTIES, DAYS OFF, PAIRING, and ROSTER." },
        { label: "Search Bid Properties", details: "Filters the property list in the selected category." },
      ]} />
      <HelpNote>
        Bid is for the active bid period. Use Standing Bid for reusable long-term conditions.
      </HelpNote>
    </>
  );
}
