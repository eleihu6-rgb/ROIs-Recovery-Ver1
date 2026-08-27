import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'
import {
  Pencil, ArrowLeftRight, Link2, Plane, Crosshair, Trash2, StickyNote,
  CalendarDays, CalendarClock, UserRound, SquarePlus, Pin, PinOff,
} from 'lucide-react'

export default function LiveContextMenu() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Right-clicking in the Gantt opens a <strong>context menu</strong> of actions for the
        task or crew under the cursor. The Live and Scenario roster panes share several
        actions; each view also offers its own.
      </p>

      <HelpStep n={1}>
        <strong>Live — a roster duty.</strong> Right-click a task block in a Live roster pane
        to open its duty menu. Flight duties offer <strong>Edit Task</strong> and{' '}
        <strong>Swap Task</strong> (a ground task shows <strong>Edit Ground Task</strong>{' '}
        instead).         Duties that belong to a pairing add <strong>View pairing detail</strong> and{' '}
        <strong>Locate Pairing</strong>; when the duty has a flight id, the menu also offers{' '}
        <strong>View flight detail</strong>. When the Flight pane is open,{' '}
        <strong>Locate Flight</strong> floats that flight to the top of the Flight pane.
        Every duty also has <strong>Schedule Details</strong>,{' '}
        <strong>Daily Task Calendar</strong>, <strong>Delete</strong> (or{' '}
        <strong>Delete N Tasks</strong> when several are box-selected), and{' '}
        <strong>Add Memo</strong> / <strong>Edit Memo</strong>.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Live — a crew row background.</strong> Right-click the empty background of a
        roster row (not a task block) to act on the crew member as a whole:{' '}
        <strong>Crew Info</strong>, <strong>Create Ground Task</strong>,{' '}
        <strong>Add Memo</strong>, <strong>Schedule Details</strong>,{' '}
        <strong>Daily Task Calendar</strong>, and <strong>Manday Info</strong>.
      </HelpStep>

      <HelpStep n={3}>
        <strong>Scenario — the roster pane.</strong> Right-clicking inside a Scenario roster
        pane is deliberately lighter: there is no Edit / Swap / Ground Task / Memo (those are
        Live-only). A paired duty offers <strong>View pairing detail</strong>,{' '}
        <strong>View flight detail</strong>, and <strong>Locate Pairing</strong>; with the
        scenario edit lock you also get <strong>Remove from crew</strong> (or{' '}
        <strong>Delete task</strong> for a standalone task). The row background offers{' '}
        <strong>Crew Info</strong>, <strong>Manday Info</strong>, <strong>Schedule Details</strong>,{' '}
        and <strong>Daily Task Calendar</strong>.
      </HelpStep>

      <HelpStep n={4}>
        <strong>Pin rows in place.</strong> In either view, select one or more rows,
        right-click, and choose <strong>Pin Selected Rows</strong> to keep them at the top
        while you scroll or sort; <strong>Unpin All</strong> releases them. Pinning is a view
        aid — it is not a draft edit.
      </HelpStep>

      <HelpNote>
        In a Scenario, some roster actions need the edit lock. If an item is missing from the
        menu, the scenario is locked, or your role does not have the capability.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Edit Task', icon: <Pencil className="h-3.5 w-3.5" />, description: 'Live roster flight duty — opens the task detail editor.' },
        { name: 'Edit Ground Task', icon: <Pencil className="h-3.5 w-3.5" />, description: 'Live roster ground duty — opens the ground task editor.' },
        { name: 'Swap Task', icon: <ArrowLeftRight className="h-3.5 w-3.5" />, description: 'Live roster flight duty — exchanges it with another crew member.' },
        { name: 'View pairing detail', icon: <Link2 className="h-3.5 w-3.5" />, description: 'Roster or pairing duty that belongs to a pairing — opens Pairing Info.' },
        { name: 'View flight detail', icon: <Plane className="h-3.5 w-3.5" />, description: 'Live or Scenario — roster/pairing duty with a flight id — opens Flight Detail for that flight.' },
        { name: 'Locate Pairing', icon: <Crosshair className="h-3.5 w-3.5" />, description: 'Floats the pairing to the top of the Pairing pane.' },
        { name: 'Locate Flight', icon: <Plane className="h-3.5 w-3.5" />, description: 'Shown only when the Flight pane is open — floats the flight’s row to the top of the Flight pane and selects it.' },
        { name: 'Remove from crew / Delete task', icon: <Trash2 className="h-3.5 w-3.5" />, description: 'Scenario — removes the duty from the crew (needs the edit lock).' },
        { name: 'Schedule Details', icon: <CalendarDays className="h-3.5 w-3.5" />, description: 'Lists every task for the crew and roster period.' },
        { name: 'Daily Task Calendar', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Week-at-a-glance calendar for the crew.' },
        { name: 'Manday Info', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Daily Credit / BH for the viewport calendar month.' },
        { name: 'Crew Info', icon: <UserRound className="h-3.5 w-3.5" />, description: 'All crew records (base, rank, fleet, qualifications, certifications, team).' },
        { name: 'Create Ground Task', icon: <SquarePlus className="h-3.5 w-3.5" />, description: 'Live — opens the ground task dialog for this crew.' },
        { name: 'Add Memo / Edit Memo', icon: <StickyNote className="h-3.5 w-3.5" />, description: 'Live — adds or edits a crew memo for this duty.' },
        { name: 'Delete / Delete N Tasks', icon: <Trash2 className="h-3.5 w-3.5" />, description: 'Removes the duty (or the whole box-selection) on save.' },
        { name: 'Pin Selected Rows / Unpin All', icon: <Pin className="h-3.5 w-3.5" />, description: 'Keeps rows at the top while scrolling or sorting.' },
      ]} />
    </>
  )
}
