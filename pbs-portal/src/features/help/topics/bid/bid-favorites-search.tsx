import {
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpStep,
} from "@/features/help/components/help-article";

export default function BidFavoritesSearch() {
  return (
    <>
      <HelpH2>Reuse a Favorite</HelpH2>
      <HelpStep n={1}>
        Open <strong>FAVORITED PROPERTIES</strong> under <strong>ADD BID PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={2}>
        Select a Favorite, review its saved condition, and choose one or more buttons under <strong>SELECT TX</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Select <strong>ADD TO BID</strong>, then confirm the new row under <strong>EXISTING BID PROPERTIES</strong>.
      </HelpStep>
      <HelpH2>Search Pairings</HelpH2>
      <HelpStep n={4}>
        Select <strong>VIEW RULES</strong> to review the active Pairing rules, or <strong>SEARCH PAIRINGS</strong> to search
        with the current rules.
      </HelpStep>
      <HelpStep n={5}>
        Use <strong>ALL PAIRINGS</strong> when you need to browse without applying the current Pairing-rule filters.
      </HelpStep>
      <HelpFieldTable items={[
        { label: "Favorite", details: "Stores reusable condition values. Select T1-T7 when adding the Favorite to the Current Bid." },
        { label: "REFRESH", details: "Refreshes the Pairing pool counts after rules change." },
        { label: "VIEW RULES", details: "Shows the active Pairing rule expressions." },
        { label: "SEARCH PAIRINGS", details: "Opens Pairing Search using the current active rules." },
        { label: "ALL PAIRINGS", details: "Opens Pairing Search without current-rule filters." },
      ]} />
      <HelpNote>
        Updating a Favorite changes the reusable template. It does not automatically change an Existing Bid row that was
        created earlier from that Favorite.
      </HelpNote>
    </>
  );
}
