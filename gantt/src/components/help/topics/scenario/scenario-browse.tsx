import { HelpStep, HelpNote, HelpScreenshot, HelpControlsRef } from '../../help-article'

export default function ScenarioBrowse() {
  return (
    <>
      <HelpStep n={1}>
        Open the <strong>Scenario</strong> tab. The left panel lists all your scenarios.
        Use the <strong>search bar</strong> at the top (placeholder <strong>Search scenarios…</strong>)
        to filter by ID, name, or user — the list updates as you type.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/scenario-list.png"
        alt="Scenario list panel showing a list of scenarios with status icons"
        caption="Each row shows the type badge, scenario ID, name, a status icon, and a second line with the date range, updated-by, optimized result count, and update age."
      />
      <HelpStep n={2}>
        Use the <strong>Type</strong> dropdown (<strong>All Types</strong> / <strong>PO</strong> /{' '}
        <strong>RO</strong>) and the <strong>Status</strong> dropdown (<strong>All Status</strong> /{' '}
        <strong>Draft</strong> / <strong>Running</strong> / <strong>Done</strong> /{' '}
        <strong>Failed</strong>) to narrow the list. Click any row to open that scenario&apos;s
        detail panel on the right.
      </HelpStep>

      <HelpNote>
        The <strong>status icon</strong> updates <strong>in real time</strong> while a run is in
        progress — you can watch it change from a spinning Running icon to Done or Failed without
        refreshing.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Search bar', description: 'Searches scenarios by ID, name, or user as you type.' },
        { name: 'Type dropdown', description: 'Filters by scenario type: All Types, PO, or RO.' },
        { name: 'Status dropdown', description: 'Filters by status: All Status, Draft, Running, Done, or Failed.' },
        { name: 'Pagination', description: 'ChevronLeft / ChevronRight icon buttons with the page / total page count between them — shown when there are more scenarios than fit on one page.' },
        { name: 'Status icon', description: 'Pencil (Draft), spinning LoaderCircle (Running), CheckCircle2 (Done), AlertCircle (Failed), UploadCloud (Published).' },
        { name: 'S3 Pairing button', description: 'Download icon in the panel header (tooltip: S3 Pairing) — imports a PRG pairing file from S3.' },
        { name: 'Import PBS material button', description: 'Import icon in the panel header — opens the PBS material import dialog.' },
        { name: '+ (Create new scenario)', description: 'Plus icon in the panel header — creates a new Draft scenario.' },
      ]} />
    </>
  )
}
