import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpOutcome,
  HelpStep,
  HelpWarning,
} from "@/features/help/components/help-article";

export default function PairingPoolCounts() {
  return (
    <>
      <HelpH2>Read the toolbar</HelpH2>
      <HelpStep n={1}>
        Read the pool-count summary above <strong>EXISTING PAIRING PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={2}>
        The left side shows the current tier, rules label, and pairing result label. A stale state means the rules
        changed after the last count.
      </HelpStep>
      <HelpStep n={3}>
        Click <strong>REFRESH</strong> when the summary is stale after editing property rows or tier selections.
      </HelpStep>
      <HelpStep n={4}>
        Click <strong>VIEW RULES</strong> to switch from editable rows to the rule expression view. Click{" "}
        <strong>VIEW PROPERTIES</strong> to return to the row list.
      </HelpStep>
      <HelpStep n={5}>
        Click <strong>SEARCH PAIRINGS</strong> to open a search using the current active draft rules.
      </HelpStep>
      <HelpFieldTable title="Pool-count status" items={[
        { label: "Loading", details: "The toolbar and row count cells are waiting for pairing count results." },
        { label: "Success", details: "The toolbar shows current rule and pairing totals for the selected tier." },
        { label: "Stale", details: "A draft edit changed the rules after the last count. Refresh before using the number." },
        { label: "Error", details: "The count request failed and the Portal displays an error message." },
      ]} />
      <HelpH2>COUNT column</HelpH2>
      <HelpList items={[
        "Existing pairing rows can show a COUNT value such as the number of pairing numbers or pairings that match that row.",
        "While counts load, row count cells show skeleton loading blocks.",
        "If no count is available for a row, the count cell remains blank.",
      ]} />
      <HelpOutcome>
        REFRESH recalculates counts but does not change draft rows. SEARCH PAIRINGS opens a review page for matching
        pairings.
      </HelpOutcome>
      <HelpWarning>
        Editing a row can make counts stale. Refresh counts before using them as final decision support.
      </HelpWarning>
      <HelpControlsRef items={[
        { name: "REFRESH", description: "Recalculates current pool counts." },
        { name: "VIEW RULES / VIEW PROPERTIES", description: "Toggles between row list and rule-expression view." },
        { name: "SEARCH PAIRINGS", description: "Previews pairings that match the current draft rules." },
        { name: "COUNT", description: "Per-row matching count area for existing pairing properties." },
      ]} />
    </>
  );
}
