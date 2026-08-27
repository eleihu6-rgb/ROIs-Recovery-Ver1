import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'
import { ListChecks, Search, Plus, Copy as CopyIcon, Trash2, Maximize2, Trees } from 'lucide-react'

export default function LegalityRuleTemplates() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        The <strong>Rule Templates</strong> view is the master rule catalog — the system&apos;s original
        rule definitions (templates) and the copies that rule sets actually use.
      </p>

      <HelpStep n={1}>
        <strong>Open the catalog.</strong> In the <strong>Legality</strong> tab, choose{' '}
        <strong>Rule Templates</strong> from the sidebar. The header reads{' '}
        <em>Master rule catalog · template (001) entries · read-only for non-admins</em>. The same
        catalog also appears as the <strong>Rule Instances</strong> tree on the left of the{' '}
        <strong>Rule Sets</strong> view.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Templates vs copies.</strong> A <strong>Template</strong> is the system&apos;s original{' '}
        instance-<span className="font-mono">001</span> entry — marked with a <strong>Template</strong>{' '}
        badge (and an amber star in the catalog tree). Every other instance is a <strong>Copy</strong>{' '}
        created for a rule set. Templates are read-only for non-admins; admins can still edit a
        template&apos;s parameters.
      </HelpStep>

      <HelpStep n={3}>
        <strong>The four-level hierarchy.</strong> The catalog tree organises rules as{' '}
        <strong>reference › category › function › instance</strong>. Reference and category nodes expand
        and collapse (top-level references start open); function rows pair the numeric function id with
        its description; instance rows show the instance code (for example{' '}
        <span className="font-mono">001</span>). Click an instance to load its parameter table on the
        right.
      </HelpStep>

      <HelpStep n={4}>
        <strong>Search.</strong> The <strong>Search rules…</strong> box filters the catalog by function
        id, reference, category, description, or instance. Matching branches auto-expand and hits are
        highlighted.
      </HelpStep>

      <HelpStep n={5}>
        <strong>Inspect a rule.</strong> In the <strong>Rule Templates</strong> table, each row lists
        the rule&apos;s <strong>Category</strong>, <strong>Div</strong>, <strong>Severity</strong>,{' '}
        <strong>Source</strong> (Template or Copy), <strong>Update By</strong> (who last edited the
        rule — the editor&apos;s code, stored directly on the rule), and <strong>Params</strong> count.
        Click <strong>View</strong> (admins: <strong>Edit</strong>) — or double-click the row — to
        expand the parameter table beneath it. Admins get the in-place parameter editor; everyone else
        sees a read-only table. The <strong>Maximize</strong> icon opens the parameters in a separate
        window.
      </HelpStep>

      <HelpStep n={6}>
        <strong>Admin actions.</strong> Hovering an instance in the catalog tree reveals{' '}
        <strong>Add to set</strong> (plus — adds it to the selected rule set),{' '}
        <strong>Copy to new instance</strong> (creates an editable copy), and{' '}
        <strong>Delete this instance</strong>. Templates cannot be deleted, and a rule that any Rule Set
        uses cannot be deleted either.
      </HelpStep>

      <HelpNote>
        The <strong>Add to set</strong> action needs a rule set selected first — choose one in the{' '}
        <strong>Rule Sets</strong> sidebar. A rule already in the selected set shows the plus button
        disabled.
      </HelpNote>

      <HelpTip>
        Copying a template is how you make a set-specific variant: the copy starts as instance{' '}
        <span className="font-mono">001</span> of the same function and you can then edit its parameters
        independently.
      </HelpTip>

      <HelpNote>
        From the <strong>Alert Center</strong> on a Live or Scenario roster pane, click any{' '}
        <strong>Rule ID</strong> (for example <span className="font-mono">8002/006</span>) to jump
        here with that rule&apos;s parameter table pre-expanded — useful for tracing a recheck
        message back to the rule that produced it.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Rule Templates', icon: <ListChecks className="h-3.5 w-3.5" />, description: 'Sidebar item opening the master rule catalog — template (001) entries, read-only for non-admins.' },
        { name: 'Rule Instances tree', icon: <Trees className="h-3.5 w-3.5" />, description: 'Left column of the Rule Sets view: reference › category › function › instance hierarchy.' },
        { name: 'Search rules…', icon: <Search className="h-3.5 w-3.5" />, description: 'Filters the catalog; matching branches auto-expand and hits are highlighted.' },
        { name: 'View / Edit', icon: <ListChecks className="h-3.5 w-3.5" />, description: 'Expands the row to show the parameter table — editable for admins, read-only otherwise.' },
        { name: 'Add to set', icon: <Plus className="h-3.5 w-3.5" />, description: 'Admin. Adds the instance to the selected rule set (disabled if none selected or already present).' },
        { name: 'Copy to new instance', icon: <CopyIcon className="h-3.5 w-3.5" />, description: 'Admin. Duplicates the rule into a new editable instance.' },
        { name: 'Delete this instance', icon: <Trash2 className="h-3.5 w-3.5" />, description: 'Admin. Removes a copy; templates and rules used by a Rule Set cannot be deleted.' },
        { name: 'Maximize', icon: <Maximize2 className="h-3.5 w-3.5" />, description: 'Opens the rule’s parameters in a separate window.' },
      ]} />
    </>
  )
}
