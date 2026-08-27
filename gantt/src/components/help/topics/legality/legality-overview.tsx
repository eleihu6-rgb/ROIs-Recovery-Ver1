// gantt/src/components/help/topics/legality/legality-overview.tsx
import { HelpH2, HelpNote, HelpTip } from '../../help-article'

export default function LegalityOverview() {
  return (
    <div>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        The Legality tab lists the compliance <strong>rule sets</strong> your airline can check crew
        assignments against, and lets you inspect every rule and its parameters. Its main view pairs a
        rule <strong>catalog tree</strong> on the left with the rule sets you manage on the right. This
        section documents the <strong>F8 Full Ruleset</strong> (workset 433) — the complete set of 15
        Flight-Deck rules.
      </p>

      <HelpNote>
        This section covers what each rule is, where it comes from, and its parameters. For the
        operational controls, see <strong>Editing rule parameters</strong> (admins can change a rule’s
        values) and, on the Live screen, <strong>Choosing a rule set</strong>.
      </HelpNote>

      <HelpH2>The rule catalog tree</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        On the left of the Rule Sets view, the <strong>Rule Instances</strong> panel organises every
        rule in the catalog into a four-level hierarchy: <strong>reference › category › function ›
        instance</strong>. Reference and category nodes expand and collapse; the top-level references
        start open. Function rows pair the numeric <span className="font-mono">function</span> id with a
        description, and instance rows show their instance code (for example{' '}
        <span className="font-mono">001</span>) in a monospace font. Template instances carry an amber
        star and a <strong>Template</strong> badge.
      </p>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Use the <strong>Search rules…</strong> box above the tree to filter it — matching branches
        auto-expand and hits are highlighted. Click any instance to load its parameter table in the
        right-hand pane.
      </p>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        For admins, hovering an instance reveals three actions: <strong>Add to set</strong> (plus) adds
        it to the currently selected rule set, <strong>Copy to new instance</strong> duplicates it, and{' '}
        <strong>Delete this instance</strong> removes it (templates cannot be deleted).
      </p>

      <HelpH2>Managing rule sets by division</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        A rule set is a named collection of rules used to check assignments. The <strong>Rule Sets</strong>{' '}
        sidebar lists them as cards showing each set’s id, name, type and division badges, the last
        editor, an <strong>Enabled / Disabled</strong> state, and its rule count. Admins click the{' '}
        <strong>+</strong> button in the header to create a set, then use the{' '}
        <strong>Add Rules</strong>, <strong>Edit</strong>, <strong>Copy</strong> and{' '}
        <strong>Delete</strong> buttons in the main header to manage the selected one.
      </p>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Each set has a <strong>type</strong> — <strong>LIVE</strong>, <strong>PBS</strong>, or{' '}
        <strong>RO</strong> — and a <strong>division</strong>: <strong>Pilot (P)</strong> or{' '}
        <strong>Cabin (C)</strong>. The <strong>Enable this rule set</strong> checkbox turns a set on or
        off. Enabling a new LIVE set disables the previous one and clears old legality alerts while the
        affected roster period is re-checked in the background. The Copy dialog lets you either{' '}
        <strong>Share rules</strong> (reference the same rules — editing one affects both sets) or{' '}
        <strong>Copy rules</strong> (duplicate each rule into independent instances). Deleting a set
        removes it and its memberships, but a set that a scenario currently resolves to cannot be
        deleted.
      </p>

      <HelpH2>Rule set type badges</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Each rule set card shows its type and division as colour badges. The badge colours come from the{' '}
        <strong>RULE_SET_TYPE</strong> dictionary, which your administrator can configure — out of the
        box <strong>LIVE</strong> is blue, <strong>PBS</strong> purple, and <strong>RO</strong> yellow,
        with the text colour chosen automatically for contrast.
      </p>

      <HelpH2>Rule coverage warnings</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        If a division + type combination has no enabled rule set, an amber <strong>warning triangle</strong>{' '}
        appears in the <strong>Rule Sets</strong> header. Hovering it lists the missing combinations
        (for example <strong>PBS/C</strong>). LIVE and PBS sets expect at least one enabled set per
        division.
      </p>

      <HelpH2>Editing rule metadata in a set</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        In the selected set’s rule table, admins can edit a rule’s <strong>Description</strong>,{' '}
        <strong>Reference</strong>, <strong>Category</strong>, and <strong>Severity</strong> columns in
        place — click a value (a hover ring marks editable cells) and type, or pick{' '}
        <strong>Soft / Overridable / Hard</strong> for severity; press <strong>Enter</strong> or click
        away to save, <strong>Esc</strong> to cancel. Everyone else sees the same values read-only.
      </p>

      <HelpH2>Where the rules come from</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Every rule traces back to the <strong>Flair PBS BRD — Rules (Flight Deck)</strong> business
        requirements document and the regulations it cites: the Canadian Aviation Regulations (CAR)
        and the Flight Crew Member Fatigue Management — Prescriptive Regulations, plus the ALPA crew
        collective agreement (CBA). Each rule topic names its source.
      </p>

      <HelpH2>The 15 rules</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-2">
        Each rule is identified by its <strong>function id</strong> (for example 8002) and a name.
        They fall into a few families:
      </p>
      <ul className="text-xs text-foreground leading-relaxed mb-3 ml-4 list-disc space-y-1">
        <li><strong>Definitions &amp; calculators</strong> — 2014 Local Night, 7500 Acc State, 7502 Credit Hours, 7272 Reserve DP. These compute values other rules read and raise no violations.</li>
        <li><strong>Cumulative limits</strong> — 8002 Maximum Flight Time, 8002 Maximum Hours of Work.</li>
        <li><strong>Days off</strong> — 7501 Single Day Free from Duty, 7505 Min GDOs in a roster period, 7507 Min GDOs with fly/reserve filters.</li>
        <li><strong>Window of Circadian Low</strong> — 7503 Limits of Consecutive WOCLs, 7504 Spacing Rule – WOCL.</li>
        <li><strong>Roster structure</strong> — 7506 One Check-in Per Day, 8056 Roster Spacing.</li>
        <li><strong>Qualification</strong> — 8004 Basic Competency, 8030 Age Restriction.</li>
      </ul>

      <HelpH2>Reading a parameter table</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Each rule carries a parameter table. The leftmost <strong>Row</strong> column numbers
        every row (1, 2, 3 …) — it is UI-only and not saved with the rule. After it, most rules
        place applicability columns — <strong>Bases, Ranks, Fleets, Crew Teams</strong> — where{' '}
        <span className="font-mono">*</span> means “applies to all”. The remaining columns hold
        the rule’s thresholds (limits, windows, ratios). A rule may have several rows, one per
        period or condition.
      </p>

      <HelpTip>
        Sample values in these topics are the regulatory baseline from the BRD. The live F8 demo
        ruleset is tuned for engine testing, so some numbers differ — always read the actual values
        in the Legality tab’s own parameter table. Each topic flags where the demo differs.
      </HelpTip>

      <HelpH2>Where violations appear</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        When an assignment breaks a rule, a <strong>warning bell</strong> marks the affected duty on
        the gantt — on the Live roster and inside a Scenario alike. The <strong>Alert Center</strong>
        (the bell button at the top-right of the roster pane, showing a violation count) opens a list
        of every violation, one row per crew, rule and message. Use the <strong>search bar</strong> at
        the top of the dialog to filter by crew ID, rank, or base — the group counts and table update
        immediately. You can also <strong>group</strong> the remaining rows <strong>by Severity, Rule,
        Base or Rank</strong>. The bell sits in the same place — the roster pane’s action strip — in
        Live and in a Scenario. Severity is colour-coded: red for hard limits, amber for overridable,
        yellow for soft. Clicking a row in the Alert Center brings that crew to the top of the Roster
        pane.
      </p>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Violation messages from the live legality recheck begin with the triggering parameter row —
        for example <em>Row 2:</em> — matching the <strong>Row</strong> column in the rule’s
        parameter table, so you can trace an alert back to the row whose values were exceeded.
      </p>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        On a Scenario the violations are that scenario’s own legality, computed by the rule engine
        the first time the scenario is opened and stored so later viewers see the same result.
      </p>

      <HelpH2>Re-checking legality</HelpH2>
      <p className="text-xs text-foreground leading-relaxed mb-3">
        Next to the bell sits a <strong>Recheck</strong> control (circular-arrows icon). On the Live
        Legality view the header shows when legality was <strong>Last checked</strong> and a{' '}
        <strong>Recheck now</strong> button; saving a rule parameter automatically re-runs the live
        check. On a Scenario the Recheck button lives in the roster pane toolbar, beside the bell. If a
        rule parameter changes after a scenario was last checked, the button shows a small{' '}
        <strong>amber dot</strong> meaning the result <em>may be outdated</em> — click it to recompute.
        While a check runs the icon spins and the status reads <em>Checking legality…</em>.
      </p>
    </div>
  )
}
