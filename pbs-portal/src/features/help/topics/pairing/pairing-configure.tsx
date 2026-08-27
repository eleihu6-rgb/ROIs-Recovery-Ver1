import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpScreenshot,
  HelpStep,
  HelpTip,
} from "@/features/help/components/help-article";

export default function PairingConfigure() {
  return (
    <>
      <HelpH2>Open the dialog</HelpH2>
      <HelpStep n={1}>
        Select a configurable property such as <strong>Pairing Preference</strong> from <strong>ADD PAIRING PROPERTIES</strong>{" "}
        or edit an existing pairing property.
      </HelpStep>
      <HelpStep n={2}>
        In <strong>Configure Pairing Bid</strong>, select the active <strong>TIERS</strong>. At least one tier must stay active.
      </HelpStep>
      <HelpStep n={3}>
        Choose <strong>MODE</strong> when it appears: <strong>Award</strong> or <strong>Avoid</strong>.
      </HelpStep>
      <HelpStep n={4}>
        Choose <strong>QUANTIFIER</strong> when it appears: <strong>Any</strong> or <strong>Every</strong>.
      </HelpStep>
      <HelpStep n={5}>
        Fill the <strong>BID</strong> control. Depending on the property, this can be a number, time, range, date,
        airport/city code, employee number, flight number, or tag list.
      </HelpStep>
      <HelpStep n={6}>
        Confirm with <strong>ADD BID</strong> for a new property or <strong>UPDATE BID</strong> for an existing property.
      </HelpStep>
      <HelpFieldTable title="Configure Pairing Bid fields" items={[
        { label: "TIERS", details: "T1-T7 toggles for where the bid applies." },
        { label: "MODE", details: "Award or Avoid when the property supports action selection." },
        { label: "QUANTIFIER", details: "Any or Every when the property can combine multiple values." },
        { label: "BID", details: "The property-specific input. Search placeholders include Search Pairing Number, Type airport or city code, Search Employee Number, and Search Flight Number." },
        { label: "CREDIT PRIORITY", details: "Higher or Lower preference for properties that support credit priority." },
      ]} />
      <HelpH2>Pairing Preference details</HelpH2>
      <HelpList items={[
        "Use the search box to narrow the active bid period pairing list by pairing number, base, route, or rank text.",
        "Select one or more pairing rows before saving the bid.",
        "Search text and Filters only narrow the selectable list; they do not save a bid by themselves.",
        "ADD BID stays disabled until at least one pairing row is selected.",
      ]} />
      <HelpScreenshot
        alt="Pairing Preference search input and Filters button"
        caption="Search and Filters help find candidate pairings. The saved bid still comes from selected rows."
        src="/help/screenshots/bid-condition-pairing-preference-search-controls.png"
      />
      <HelpScreenshot
        alt="Pairing Preference selected count and selected pairing chip after a row is checked"
        caption="The selected count and selected chips show exactly which pairing rows will be saved."
        src="/help/screenshots/bid-condition-pairing-preference-selection-controls.png"
      />
      <HelpOutcome>
        Review the row in <strong>EXISTING PAIRING PROPERTIES</strong>.
      </HelpOutcome>
      <HelpTip>
        Pairing Number searches are filtered by the current period and actor base rules used elsewhere in Pairing.
      </HelpTip>
      <HelpH2>Filter the pairing list</HelpH2>
      <HelpStep n={7}>
        In the pairing list, click <strong>Filters</strong> to open <strong>Pairing Filters</strong>. Filters narrow
        the available pairing list only; they do not save a bid.
      </HelpStep>
      <HelpStep n={8}>
        Set the search conditions you need, then click <strong>Apply Filters</strong>. Select the matching pairing rows,
        then use <strong>ADD BID</strong> or <strong>UPDATE BID</strong> to save the bid.
      </HelpStep>
      <HelpFieldTable title="Pairing Filters" items={[
        { label: "Pairing start dates", details: "Limits pairings by origin date range." },
        { label: "Check-in / Check-out", details: "Limits pairings by check-in or check-out time ranges." },
        { label: "Length", details: "Limits pairing duration by day count." },
        { label: "Route station", details: "Limits pairings by stations included in the route." },
        { label: "Layover station", details: "Limits pairings by layover station." },
        { label: "Layover count", details: "Limits the number of layovers." },
        { label: "Credit", details: "Limits total credit using HH:MM values." },
        { label: "Redeye / DHD", details: "Limits results to Redeye pairings or pairings with deadhead activity." },
        { label: "Clear All", details: "Clears the draft filter fields without saving a bid." },
        { label: "Apply Filters", details: "Applies the filters to the pairing list." },
      ]} />
      <HelpScreenshot
        alt="Pairing Filters dialog with date, time, station, credit, Redeye, and DHD controls"
        caption="Pairing Filters are temporary list filters. After applying them, select pairing rows and then save."
        src="/help/screenshots/bid-condition-pairing-preference-filters-dialog.png"
      />
      <HelpH2>Date scope labels</HelpH2>
      <HelpFieldTable title="Date scope meaning" items={[
        { label: "Event Date", details: "The date of the event evaluated by that condition, such as a check-in/check-out event, duty event, work-day event, or airport event." },
        { label: "Flight Date", details: "The operating date of a flight leg inside the pairing. Flight Number Preference, Redeye Preference, and Deadhead Flying use this label." },
        { label: "Pairing Start Date", details: "The first calendar date of the pairing. A multi-day pairing still has one pairing start date." },
        { label: "Switch off / on", details: "Off does not disable the bid. Off means the rule can match anywhere in the period; On adds Specific Dates or Date Range on top of the saved rule." },
      ]} />
      <HelpNote>
        <strong>SAVE FAVORITE</strong> saves the configured property as a reusable template. It does not add a row to
        the current draft unless you also use <strong>ADD BID</strong>.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "Pairing Preference", description: "Pairing property used to award or avoid selected current-period pairings." },
        { name: "Configure Pairing Bid", description: "Dialog for action, bid value, dates, duties, and other conditions." },
        { name: "Filters", description: "Opens Pairing Filters to narrow the selectable pairing list." },
        { name: "ADD BID / UPDATE BID", description: "Persists the configured bid into the current draft." },
        { name: "SAVE FAVORITE", description: "Saves the configured property for reuse under FAVORITED PROPERTIES." },
      ]} />
    </>
  );
}
