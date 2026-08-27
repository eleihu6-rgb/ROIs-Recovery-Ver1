import {
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function BidAddProperties() {
  return (
    <>
      <HelpH2>Add a Current Bid condition</HelpH2>
      <HelpStep n={1}>
        Open <strong>Bid</strong> and review <strong>EXISTING BID PROPERTIES</strong> for similar saved conditions.
      </HelpStep>
      <HelpStep n={2}>
        Under <strong>ADD BID PROPERTIES</strong>, select <strong>DAYS OFF</strong>, <strong>PAIRING</strong>, or <strong>ROSTER</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Use <strong>Search Bid Properties</strong> when you need to filter the selected category.
      </HelpStep>
      <HelpStep n={4}>
        Select the add button on a property row and complete the fields in its Configure dialog.
      </HelpStep>
      <HelpStep n={5}>
        Select one or more <strong>T1-T7</strong> buttons. Complete every section marked <strong>REQUIRED</strong>.
      </HelpStep>
      <HelpStep n={6}>
        Select <strong>ADD BID</strong> and wait for the save to finish. Confirm the new row and summary under
        <strong> EXISTING BID PROPERTIES</strong>.
      </HelpStep>
      <HelpFieldTable title="Property categories" items={[
        { label: "DAYS OFF", details: "Conditions that describe preferred time away from work." },
        { label: "PAIRING", details: "Conditions that describe preferred or avoided pairing characteristics." },
        { label: "ROSTER", details: "Conditions that describe the preferred shape of the monthly roster, including Mixed Line Bid and Reserve Preference." },
      ]} />
      <HelpFieldTable title="Roster preference examples" items={[
        { label: "Mixed Line Bid", details: "Mixed Line is the default and saves no 427 bid. Reserve Only saves reserve-only; Pairing Only saves pairing-only." },
        { label: "Reserve Preference", details: "Choose a reserve short-call type and date scope from the ROSTER category. It is displayed with Roster conditions while preserving reserve draft behavior internally." },
      ]} />
      <HelpOutcome>
        The new condition appears with its category, summary, and Tier tags after the server confirms the save.
      </HelpOutcome>
      <HelpNote>
        If ADD BID is unavailable, check the required fields and select at least one Tier.
      </HelpNote>
    </>
  );
}
