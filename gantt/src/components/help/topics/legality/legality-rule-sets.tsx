import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'
import { ShieldCheck, Search, Plus, ListPlus, Pencil, Copy as CopyIcon, Trash2, AlertTriangle, Trees, Layers } from 'lucide-react'

export default function LegalityRuleSets() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        The <strong>Rule Sets</strong> view lists every compliance rule set, shows the rules each one
        contains, and lets admins create, copy, edit, and delete sets.
      </p>

      <HelpStep n={1}>
        <strong>Open the view.</strong> In the <strong>Legality</strong> tab, the default view is{' '}
        <strong>Rule Sets</strong>. Three columns run across: the <strong>Rule Instances</strong>{' '}
        catalog tree on the left, the <strong>Rule Sets</strong> sidebar in the middle, and the selected
        set&apos;s rules on the right.
      </HelpStep>

      <HelpNote>
        Reclaim table space by hiding a column: the <strong>Rule Instances</strong> tree and the{' '}
        <strong>Rule Sets</strong> sidebar each have a <strong>Trees</strong> / <strong>Layers</strong>{' '}
        icon in their header that collapses that column. When a column is hidden, a flashing{' '}
        <strong>Show Rule Instances</strong> / <strong>Show Rule Sets</strong> button appears in the
        detail header on the right — click it to bring the column back.
      </HelpNote>

      <HelpStep n={2}>
        <strong>Read a Rule Set card.</strong> Each card in the sidebar shows the set&apos;s{' '}
        <strong>id</strong> and <strong>name</strong>, the <strong>last editor</strong>, one{' '}
        <strong>type</strong> badge per claimed type (<strong>LIVE</strong> / <strong>PBS</strong> /{' '}
        <strong>RO</strong>), a <strong>division</strong> badge (<strong>P</strong> / <strong>C</strong>), an{' '}
        <strong>Enabled</strong> / <strong>Disabled</strong> state, and its{' '}
        <strong>rule count</strong>. Disabled sets are dimmed; the active set is highlighted. Click a
        card to load its rules.
      </HelpStep>

      <HelpStep n={3}>
        <strong>Search the sets.</strong> The <strong>Search sets…</strong> box above the list filters
        the cards by id or name. A <strong>Search rules…</strong> box above the table filters the
        selected set&apos;s rules.
      </HelpStep>

      <HelpStep n={4}>
        <strong>Create a set (admin).</strong> Click the <strong>+</strong> button in the Rule Sets
        header. In the <strong>New Rule Set</strong> dialog give it a <strong>Name</strong>, choose the{' '}
        <strong>Division</strong> (<strong>Pilot (P)</strong> or <strong>Cabin (C)</strong>),
        and pick one or more <strong>Rule Types</strong> — toggle <strong>LIVE</strong> /{' '}
        <strong>PBS</strong> / <strong>RO</strong> (at least one is required). A set that claims
        multiple types serves all of them, e.g. a <strong>LIVE,PBS,RO</strong> set works for live
        checks, PBS scenarios, and RO scenarios.
      </HelpStep>

      <HelpStep n={5}>
        <strong>Manage the selected set (admin).</strong> The header over the rules table offers{' '}
        <strong>Add Rules</strong> (pick catalog rules not yet in the set), <strong>Edit</strong>{' '}
        (name / division / type / enabled), <strong>Copy</strong> (as <strong>Share rules</strong> —
        reference the same rules — or <strong>Copy rules</strong> — independent instances), and{' '}
        <strong>Delete</strong>. A set that a scenario currently resolves to cannot be deleted.
      </HelpStep>

      <HelpStep n={6}>
        <strong>Watch rule-set coverage.</strong> When a division + type combination has no enabled
        set, an amber <strong>warning triangle</strong> appears in the Rule Sets header — hover it to
        see the missing combinations (for example <strong>PBS/C</strong>). Enabling a set that claims{' '}
        <strong>LIVE</strong> or <strong>PBS</strong> disables the previous enabled set of that type
        for the same division and re-checks the affected roster period in the background.
      </HelpStep>

      <HelpNote>
        Creating, editing, copying, deleting, and adding rules are <strong>admin-only</strong>. Other
        users can browse the sets and read every rule and parameter.
      </HelpNote>

      <HelpTip>
        The same <strong>Enable this rule set</strong> checkbox appears when you create or edit a set.
        Turning a <strong>LIVE</strong> set on (or switching its type or division) asks you to confirm
        before it clears old legality alerts and starts a background recheck.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Rule Sets sidebar', icon: <ShieldCheck className="h-3.5 w-3.5" />, description: 'Cards for every rule set: id, name, last editor, one badge per claimed type, division badge, Enabled/Disabled, rule count. Click a card to load the set.' },
        { name: 'Hide Rule Instances', icon: <Trees className="h-3.5 w-3.5" />, description: 'Header icon on the Rule Instances catalog tree — collapses the left column to give the table more room.' },
        { name: 'Hide Rule Sets', icon: <Layers className="h-3.5 w-3.5" />, description: 'Header icon on the Rule Sets sidebar — collapses the middle column to give the table more room.' },
        { name: 'Show Rule Instances / Show Rule Sets', icon: <Trees className="h-3.5 w-3.5" />, description: 'Flashing buttons in the detail header that restore a hidden column.' },
        { name: 'Search sets…', icon: <Search className="h-3.5 w-3.5" />, description: 'Filters the rule set cards by id or name.' },
        { name: 'New (+)', icon: <Plus className="h-3.5 w-3.5" />, description: 'Admin. Opens the New Rule Set dialog (Name, Division, one or more Rule Types, Enable this rule set).' },
        { name: 'Add Rules', icon: <ListPlus className="h-3.5 w-3.5" />, description: 'Admin. Lists catalog rules not yet in the set, each with an Add button.' },
        { name: 'Edit', icon: <Pencil className="h-3.5 w-3.5" />, description: 'Admin. Changes the selected set’s name, division, type, and enabled state.' },
        { name: 'Copy', icon: <CopyIcon className="h-3.5 w-3.5" />, description: 'Admin. Duplicates the set — Share rules (same references) or Copy rules (independent instances).' },
        { name: 'Delete', icon: <Trash2 className="h-3.5 w-3.5" />, description: 'Admin. Removes the set and its memberships; a set a scenario resolves to cannot be deleted.' },
        { name: 'Coverage warning', icon: <AlertTriangle className="h-3.5 w-3.5" />, description: 'Amber triangle in the Rule Sets header when a division + type has no enabled set; hover to list the missing combinations.' },
      ]} />
    </>
  )
}
