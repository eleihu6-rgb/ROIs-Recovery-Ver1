import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpParagraph,
  HelpStep,
} from "@/features/help/components/help-article";

export default function DashboardEntries() {
  return (
    <>
      <HelpH2>Read pre-assigned duties</HelpH2>
      <HelpStep n={1}>
        Open <strong>Dashboard</strong> and find <strong>MESSAGE CENTER</strong> on the right side.
      </HelpStep>
      <HelpStep n={2}>
        Read <strong>Pre-assigned Duties</strong>. These are duties already known for the displayed roster period.
      </HelpStep>
      <HelpStep n={3}>
        Use the type rows to see how many pre-assigned duties are grouped as Pairing, Days Off, Reserve, Training,
        Deadhead, Unavailable, or Other.
      </HelpStep>
      <HelpStep n={4}>
        Scroll <strong>Duty Details</strong> to review each pre-assigned item. The list is intentionally scrollable so
        long duty sets do not push the page out of view.
      </HelpStep>
      <HelpParagraph>
        Pre-assigned duties come from the roster data already loaded for the period. They can be visible even before an
        Award is published because they are not the same thing as Award results.
      </HelpParagraph>
      <HelpFieldTable title="Summary fields" items={[
        { label: "Duties", details: "Total number of grouped pre-assigned duty items in the displayed roster period." },
        { label: "Covered days", details: "The number of unique local calendar dates touched by those duties, clamped to the displayed period." },
        { label: "Pairing", details: "A pre-assigned flying duty with a pairing id. The tag uses the same blue pairing color as the calendar." },
        { label: "Days Off", details: "A pre-assigned off duty when the source code is DO, GDO, or OFF. The tag uses the same green off color as the calendar." },
        { label: "Reserve", details: "A pre-assigned reserve duty when the source code is RES." },
        { label: "Training", details: "A pre-assigned training duty such as SIM, SFT, or CBT." },
        { label: "Deadhead", details: "A pre-assigned DHD duty." },
        { label: "Unavailable", details: "A pre-assigned unavailable duty such as VAC or ILL. It reduces availability for the affected dates." },
      ]} />
      <HelpH2>Duty Details fields</HelpH2>
      <HelpFieldTable title="Duty list" items={[
        { label: "Duty label", details: "The label returned by the roster data, such as GDO or a pairing label. A company label such as VGDO is shown as source text when returned." },
        { label: "Date range", details: "The local date or date range covered by the duty. Cross-day duties show both dates." },
        { label: "Type tag", details: "The Portal grouping used for color and count, for example Days off or Pairing." },
        { label: "Time", details: "The local start-end time. Day-off-like duties that cover almost a full day display Full day." },
      ]} />
      <HelpList items={[
        "A time such as 18:05-04:55 means the duty crosses midnight.",
        "A duty can start before the displayed period or end after it; Covered days only counts the dates inside the current period.",
        "Dashboard does not edit these duties. If the pre-assignment is wrong, it must be corrected in the source roster data.",
      ]} />
      <HelpOutcome>
        Use MESSAGE CENTER as a quick explanation for why certain dates already have work, days off, or unavailable time
        before bidding starts.
      </HelpOutcome>
      <HelpNote>
        Pre-assigned duties are read-only in Dashboard and do not depend on whether Award has been published.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "MESSAGE CENTER", description: "Right-side Dashboard panel that currently shows Pre-assigned Duties." },
        { name: "Pre-assigned Duties", description: "Summary of imported duties already known for the displayed roster period." },
        { name: "Duty Details", description: "Scrollable list of individual pre-assigned duty details." },
      ]} />
    </>
  );
}
