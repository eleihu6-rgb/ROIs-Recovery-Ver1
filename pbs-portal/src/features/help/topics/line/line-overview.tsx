import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpOutcome,
  HelpParagraph,
  HelpScreenshot,
} from "@/features/help/components/help-article";

export default function LineOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/line-overview.png"
        alt="Line page with existing line properties and add line properties"
        caption="Line uses the shared Rule Bid panel for line-property bidding."
      />
      <HelpH2>What you use it for</HelpH2>
      <HelpParagraph>
        Use Line to manage line-property bids in the current draft. The page uses the shared Rule Bid panel,
        so existing properties, available properties, favorites, and T1-T7 tier controls follow the same pattern as
        other rule-bid pages.
      </HelpParagraph>
      <HelpH2>Screen layout</HelpH2>
      <HelpFieldTable items={[
        { label: "EXISTING LINE PROPERTIES", details: "Saved line bid rows with PROPERTY, BID, and TIERS columns." },
        { label: "ADD LINE PROPERTIES", details: "Available line-property catalog and saved favorites." },
        { label: "ALL PROPERTIES", details: "Catalog rows returned for the active Line draft." },
        { label: "FAVORITED PROPERTIES", details: "Configured favorites that can be reused." },
        { label: "Search Properties", details: "Filters available Line property names." },
      ]} />
      <HelpH2>Line property types</HelpH2>
      <HelpList items={[
        "Simple properties can be added directly from the available list and tiered with T1-T7.",
        "Configurable properties open Configure Line Bid before they are saved.",
        "Configurable examples include Mixed Line Bid, Forget Line, Min Base Layover, Commuter Pattern, Efficient Flying First, and Reserve / Flying Date Pattern.",
      ]} />
      <HelpOutcome>
        A successful add, edit, delete, or favorite action saves against the current Line draft and refreshes Bid
        review data.
      </HelpOutcome>
      <HelpControlsRef items={[
        { name: "PROPERTY", description: "Name of the Line bid property." },
        { name: "BID", description: "Configured summary such as Reserve only, Pairing only, Work 4-5 days, then 4 days off, or credit/day limits." },
        { name: "TIERS", description: "T1-T7 selection showing where the Line bid applies." },
      ]} />
    </>
  );
}
