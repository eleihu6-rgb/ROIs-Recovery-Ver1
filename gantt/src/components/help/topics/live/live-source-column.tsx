import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'
import { Download, FileUp, PenLine, ListTree, Cpu } from 'lucide-react'

export default function LiveSourceColumn() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Every roster and pairing task carries a <strong>Source</strong> that records where it
        came from. You see the value in the <strong>Source</strong> column of the{' '}
        <strong>Bulk Delete Roster Flights</strong> dialog (Live and Scenario), where you can
        also filter by it.
      </p>

      <HelpStep n={1}>
        <strong>IMP — Imported.</strong> Brought in from an external system (the PBS material
        import or the connector). In Live, imported flying rows are immutable —{' '}
        <strong>Edit Task</strong>, <strong>Swap Task</strong> and drag-move are disabled, but
        you can still <strong>Delete</strong> them.
      </HelpStep>

      <HelpStep n={2}>
        <strong>MA — Manual.</strong> Created or adjusted by hand in the Gantt — for example a
        ground task you added, or a duty you moved between crew.
      </HelpStep>

      <HelpStep n={3}>
        <strong>PA — Pre-Assignment.</strong> The pre-assigned seed carried into a Scenario
        before the optimizer runs — the starting roster the engine works from (the
        “Before opt” credit). Live does not show PA.
      </HelpStep>

      <HelpStep n={4}>
        <strong>CR — Optimizer.</strong> Placed by the optimization run — the produced roster
        inside a Scenario, and the rows written back to Live when you import an optimized
        roster. In the bulk-delete dialog, CR (and MA) rows are deletable.
      </HelpStep>

      <HelpNote>
        In Live the common sources are <strong>IMP</strong>, <strong>MA</strong> and{' '}
        <strong>CR</strong>; in a Scenario you additionally see <strong>PA</strong>. The Source
        filter in the bulk-delete dialog lists exactly the values present.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Source column', icon: <ListTree className="h-3.5 w-3.5" />, description: 'Shows each task’s origin — Imported, Manual, Pre-Assignment, or Optimizer.' },
        { name: 'IMP', icon: <FileUp className="h-3.5 w-3.5" />, description: 'Imported from the PBS material import or the connector.' },
        { name: 'MA', icon: <PenLine className="h-3.5 w-3.5" />, description: 'Manual — created or adjusted by hand in the Gantt.' },
        { name: 'PA', icon: <ListTree className="h-3.5 w-3.5" />, description: 'Pre-Assignment — the seed carried into a Scenario before optimization.' },
        { name: 'CR', icon: <Cpu className="h-3.5 w-3.5" />, description: 'Optimizer — placed by the optimization run.' },
        { name: 'Source filter', icon: <Download className="h-3.5 w-3.5" />, description: 'In Bulk Delete, narrows the rows to one or more source values.' },
      ]} />
    </>
  )
}
