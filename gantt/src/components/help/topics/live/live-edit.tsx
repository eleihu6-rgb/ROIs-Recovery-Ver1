import { HelpStep, HelpNote, HelpWarning, HelpControlsRef } from '../../help-article'
import {
  MousePointerClick, BoxSelect, Pencil, ArrowLeftRight, Eraser,
  Network, Trash2, Pin, Link2, Plane, Crosshair, CalendarDays, CalendarClock, UserRound, StickyNote,
} from 'lucide-react'

export default function LiveEdit() {
  return (
    <>
      <HelpNote>
        Everything on this page is an <strong>edit</strong>: each one is held as a draft and only
        becomes permanent when you save. See <em>Saving, undoing, and redoing</em> for how drafts
        are committed and reversed.
      </HelpNote>

      <HelpStep n={1}>
        <strong>Select.</strong> Click a task block to select it. Hold <kbd>Ctrl</kbd>{' '}
        (<kbd>⌘</kbd> on macOS) and click to add or remove blocks one at a time. To grab many at
        once, press on empty space and <strong>drag a box</strong> across the blocks — every block
        the box touches is selected when you release. Hold <kbd>Ctrl</kbd> while you drag the box to
        add those blocks to the current selection instead of replacing it. Box-select works in the
        Roster, Pairing, and Flight panes. Press <kbd>Esc</kbd> to clear the selection. The toolbar
        shows a <em>“N sel”</em> count while anything is selected.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Reassign crew by dragging.</strong> In the Roster pane, drag a task block straight
        up or down onto a different crew member&apos;s row to move that assignment to them. Drop it
        on the target row and release — the block re-homes to the new crew.
      </HelpStep>

      <HelpStep n={3}>
        <strong>Edit or swap a flight duty.</strong> Right-click a flight block in the Roster pane
        and choose <strong>Edit Task</strong> to open its detail editor, or <strong>Swap Task</strong>{' '}
        to exchange it with another crew member through the swap dialog. (For ground tasks the menu
        shows <strong>Edit Ground Task</strong> instead — see <em>Creating a ground task</em>.)
        For duties that belong to a pairing the menu also offers <strong>View pairing detail</strong>,{' '}
        <strong>View flight detail</strong> (when a flight id is known), and{' '}
        <strong>Locate Pairing</strong>, and every duty has <strong>Schedule Details</strong>,{' '}
        <strong>Daily Task Calendar</strong>, and <strong>Add Memo</strong> / <strong>Edit Memo</strong>{' '}
        actions.
      </HelpStep>

      <HelpNote>
        Right-clicking the <strong>empty background of a roster row</strong> (not a task block)
        opens a menu for that crew member: <strong>Crew Info</strong>,{' '}
        <strong>Create Ground Task</strong>, <strong>Add Memo</strong>,{' '}
        <strong>Schedule Details</strong>, <strong>Daily Task Calendar</strong>, and{' '}
        <strong>Manday Info</strong>.
      </HelpNote>

      <HelpStep n={4}>
        <strong>Delete.</strong> Select one or more blocks and press <kbd>Del</kbd>{' '}
        (<kbd>Backspace</kbd> also works), or right-click a block and choose <strong>Delete</strong>.
        When you have box-selected several blocks, right-clicking any one of them shows{' '}
        <strong>Delete N Tasks</strong> and removes the whole selection at once. Deleting a block that
        belongs to a pairing removes all of that crew member&apos;s segments of the pairing together,
        not just the one segment you clicked.
      </HelpStep>

      <HelpStep n={5}>
        <strong>Work on a pairing directly.</strong> Right-click a block in the Pairing pane for{' '}
        <strong>View pairing detail</strong> (open Pairing Info), <strong>View flight detail</strong>{' '}
        (when the segment has a flight id), <strong>Edit Duty Nodes</strong>{' '}
        (adjust the pairing&apos;s structure), <strong>Select</strong>, or{' '}
        <strong>Delete Pairing</strong> (remove the whole pairing on save).
      </HelpStep>

      <HelpStep n={6}>
        <strong>Pin rows in place.</strong> Select one or more rows, right-click, and choose{' '}
        <strong>Pin Selected Rows</strong> to keep them at the top while you scroll or sort.{' '}
        <strong>Unpin All</strong> releases them. Pinning is a view aid — it is not a draft edit and
        nothing needs saving.
      </HelpStep>

      <HelpWarning>
        Edits are <strong>drafts</strong> until you save. If you sign out or refresh without saving,
        unsaved edits are lost. Press <kbd>Ctrl+S</kbd> when you are satisfied.
      </HelpWarning>

      <HelpControlsRef items={[
        { name: 'Click / Ctrl+Click', icon: <MousePointerClick className="h-3.5 w-3.5" />, description: 'Select a block, or add/remove blocks from a multi-selection. Esc clears it.' },
        { name: 'Drag a box', icon: <BoxSelect className="h-3.5 w-3.5" />, description: 'Press on empty space and drag to box-select every block the box touches. Hold Ctrl while dragging to add to the current selection. Works in the Roster, Pairing, and Flight panes.' },
        { name: 'Drag to a crew row', icon: <ArrowLeftRight className="h-3.5 w-3.5 rotate-90" />, description: 'Roster pane: drops a task onto another crew member to reassign it to them.' },
        { name: 'Edit Task', icon: <Pencil className="h-3.5 w-3.5" />, description: 'Right-click menu on a Roster flight duty — opens the task detail editor.' },
        { name: 'Swap Task', icon: <ArrowLeftRight className="h-3.5 w-3.5" />, description: 'Right-click menu on a Roster flight duty — exchanges it with another crew member via the swap dialog.' },
        { name: 'View pairing detail', icon: <Link2 className="h-3.5 w-3.5" />, description: 'Right-click menu on a Roster or Pairing duty that belongs to a pairing — opens the Pairing Info dialog.' },
        { name: 'View flight detail', icon: <Plane className="h-3.5 w-3.5" />, description: 'Right-click menu on a Roster or Pairing duty with a flight id — opens Flight Detail for that flight.' },
        { name: 'Locate Pairing', icon: <Crosshair className="h-3.5 w-3.5" />, description: 'Right-click menu on a Roster duty that belongs to a pairing — shows the Pairing pane and brings that pairing to its top row.' },
        { name: 'Schedule Details', icon: <CalendarDays className="h-3.5 w-3.5" />, description: 'Right-click menu on a roster row or duty — opens the crew member’s schedule details for the period.' },
        { name: 'Daily Task Calendar', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Right-click menu on a roster row or duty — opens the crew member’s daily task calendar.' },
        { name: 'Crew Info', icon: <UserRound className="h-3.5 w-3.5" />, description: 'Right-click menu on a roster row background — opens the crew member’s detail card.' },
        { name: 'Manday Info', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Right-click menu on a roster row background — opens the crew member’s manday summary.' },
        { name: 'Add Memo / Edit Memo', icon: <StickyNote className="h-3.5 w-3.5" />, description: 'Right-click menu on a roster row or duty — adds or edits a crew memo for that date range.' },
        { name: 'Delete (Del / Backspace)', icon: <Eraser className="h-3.5 w-3.5" />, description: 'Removes the selected blocks. For a pairing duty, removes all of that crew member’s segments of the pairing.' },
        { name: 'Edit Duty Nodes', icon: <Network className="h-3.5 w-3.5" />, description: 'Right-click menu in the Pairing pane — adjusts the pairing’s structure.' },
        { name: 'Delete Pairing', icon: <Trash2 className="h-3.5 w-3.5" />, description: 'Right-click menu in the Pairing pane — removes the whole pairing on save.' },
        { name: 'Pin Selected Rows / Unpin All', icon: <Pin className="h-3.5 w-3.5" />, description: 'Keeps chosen rows at the top of a pane while you scroll or sort. A view aid, not a saved edit.' },
      ]} />
    </>
  )
}
