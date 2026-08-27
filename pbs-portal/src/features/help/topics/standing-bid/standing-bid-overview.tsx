import {
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpParagraph,
  HelpScreenshot,
} from "@/features/help/components/help-article";

export default function StandingBidOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/standing-bid-overview.png"
        alt="Standing Bid page with saved conditions and available properties"
        caption="Standing Bid keeps reusable conditions separate from the Current Bid."
      />
      <HelpH2>What you use it for</HelpH2>
      <HelpParagraph>
        Use Standing Bid for reusable long-term conditions. It is stored separately from the active Current Bid.
      </HelpParagraph>
      <HelpFieldTable items={[
        { label: "EXISTING STANDING BID", details: "Saved long-term conditions with their summaries and Tier tags." },
        { label: "ALL / T1-T7", details: "Filters the Existing list without changing the saved conditions." },
        { label: "ADD STANDING BID", details: "The visible catalog of conditions that can be saved as Standing Bid." },
        { label: "DAYS OFF / PAIRING / ROSTER", details: "Standing property categories available for the current user and context. Reserve Preference is shown under ROSTER." },
      ]} />
      <HelpH2>Current Bid vs Standing Bid</HelpH2>
      <HelpFieldTable title="Behavior difference" items={[
        { label: "Current Bid", details: "Uses the current bid-period calendar and can save current-period specific dates, date ranges, and exact current-period pairing rows." },
        { label: "Standing Bid", details: "Stores reusable long-term rules. It does not show the left BIDDING CALENDAR because it is not editing one exact bid-period calendar." },
        { label: "Lineholder Standing", details: "Contains reusable Days Off, Pairing, and Roster / Line conditions." },
        { label: "Reserve Preference", details: "Appears under ROSTER, while internally saving to the StandingReserve draft for reserve bidding." },
      ]} />
      <HelpNote>
        For the current bid period, saved Current Bid business conditions are used first. Standing Bid is the fallback
        when the Current Bid has no saved business conditions.
      </HelpNote>
    </>
  );
}
