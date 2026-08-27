import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function ScenarioImport() {
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>Import PBS material</strong> button (Import icon) at the top of the
        scenario list panel. Its tooltip is <strong>Import PBS material</strong>.
      </HelpStep>

      <HelpStep n={2}>
        In the <strong>Import PBS Material</strong> dialog, choose a <strong>Roster Period</strong>.
        The <strong>Start</strong> and <strong>End</strong> dates are filled from the selected
        period and are read-only. Tick the material types to pull — <strong>Crew</strong>,{' '}
        <strong>Roster</strong>, <strong>RosterGround</strong>, <strong>Pairing</strong>, and{' '}
        <strong>Flight</strong> — at least one is required.
      </HelpStep>

      <HelpStep n={3}>
        Click <strong>Confirm</strong> to start the import. The dialog shows the overall import
        progress (percent and elapsed time) plus a per-material table with{' '}
        <strong>Fetch</strong> / <strong>Transform</strong> / <strong>Write</strong> stages.
      </HelpStep>

      <HelpStep n={4}>
        When the import finishes, a result table shows each material&apos;s status and counts
        (Add / Update / Delete / OK / Fail / Skip) with Fetch / Trans / DB / Total timings. The
        success toast reports the imported connector count and elapsed time; if any material
        failed you get a warning listing how many failed.
      </HelpStep>

      <HelpNote>
        The <strong>S3 Pairing</strong> import is a separate button (Download icon) next to the
        Import PBS material button. It opens the <strong>S3 Pairing Import</strong> dialog where
        you pick a <strong>PRG file</strong>, choose an existing PO scenario or a new pairing
        scenario (with name, date range, and division), and click <strong>Import PO</strong>.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Import PBS material button', description: 'Opens the Import PBS Material dialog.' },
        { name: 'Roster Period', description: 'Selects the roster period; fills the read-only Start / End dates.' },
        { name: 'Material scope', description: 'Crew / Roster / RosterGround / Pairing / Flight checkboxes — at least one required.' },
        { name: 'Confirm', description: 'Starts the import. Shows progress while running, then the result table.' },
        { name: 'Progress table', description: 'Per-material Fetch / Transform / Write stages with status (Waiting / Running / Done / Failed) and timing.' },
        { name: 'Result table', description: 'Per-material Status, Add, Update, Delete, OK, Fail, Skip, Fetch, Trans, DB, Total.' },
        { name: 'S3 Pairing button', description: 'Download icon — opens the S3 Pairing Import dialog for a PRG pairing file.' },
      ]} />
    </>
  )
}
