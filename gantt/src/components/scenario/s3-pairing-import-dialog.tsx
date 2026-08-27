import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'
import {
  AppDialog,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rois/ui'
import { GanttEnglishDateRangePicker } from '@/components/common/gantt-date-fields'
import type { S3PairingImportInput, S3PairingPoTarget } from '@/services/scenario-api'

interface Option {
  value: string
  label: string
}

interface S3PairingImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  poTargets: S3PairingPoTarget[]
  divisionOptions: Option[]
  importing: boolean
  onImport: (input: S3PairingImportInput) => void | Promise<void>
}

const today = (): string => new Date().toISOString().slice(0, 10)

const Field = ({ label, children }: { label: string; children: ReactNode }): ReactNode => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <span className="text-2xs font-medium text-muted-foreground">{label}</span>
    {children}
  </div>
)

export const S3PairingImportDialog = ({
  open,
  onOpenChange,
  poTargets,
  divisionOptions,
  importing,
  onImport,
}: S3PairingImportDialogProps): ReactNode => {
  const [file, setFile] = useState<File | null>(null)
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing')
  const [targetScenarioId, setTargetScenarioId] = useState('')
  const [clearBeforeImport, setClearBeforeImport] = useState(false)
  const [newScenarioName, setNewScenarioName] = useState('')
  const [newStrDtLoc, setNewStrDtLoc] = useState(today)
  const [newEndDtLoc, setNewEndDtLoc] = useState(today)
  const [newDivision, setNewDivision] = useState('')

  useEffect(() => {
    if (targetScenarioId || poTargets.length === 0) return
    setTargetScenarioId(String(poTargets[0].id))
  }, [poTargets, targetScenarioId])

  const datesValid = newStrDtLoc !== '' && newEndDtLoc !== '' && newStrDtLoc <= newEndDtLoc
  const existingReady = targetMode === 'existing' && targetScenarioId !== ''
  const newReady = targetMode === 'new' && datesValid && newDivision !== ''
  const canImport = !!file && !importing && (existingReady || newReady)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null
    setFile(selected && /\.prg$/i.test(selected.name) ? selected : null)
  }

  const handleImport = (): void => {
    if (!file || !canImport) return
    if (targetMode === 'existing') {
      void onImport({
        file,
        targetMode,
        targetScenarioId: Number(targetScenarioId),
        clearBeforeImport,
      })
      return
    }

    void onImport({
      file,
      targetMode,
      clearBeforeImport: false,
      newScenarioName: newScenarioName.trim() || undefined,
      newStrDtLoc,
      newEndDtLoc,
      newDivision,
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next: boolean) => { if (!importing) onOpenChange(next) }}
      data-testid="s3-pairing-import-dialog"
      className="sm:max-w-[560px]"
      dismissable={!importing}
      icon={<Download className="h-4 w-4" />}
      title="S3 Pairing Import"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            data-testid="s3-pairing-import-cancel"
            disabled={importing}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            data-testid="s3-pairing-import-confirm"
            disabled={!canImport}
            onClick={handleImport}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {importing ? 'Importing...' : 'Import PO'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1 text-xs">
        <Field label="PRG file">
          <Input
            data-testid="s3-pairing-file"
            type="file"
            accept=".PRG,.prg"
            className="h-8 text-xs"
            onChange={handleFileChange}
          />
        </Field>

        <Field label="Target">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={targetMode === 'existing'}
                onChange={() => setTargetMode('existing')}
              />
              <span>Existing PO Scenario</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                data-testid="s3-target-mode-new"
                type="radio"
                checked={targetMode === 'new'}
                onChange={() => setTargetMode('new')}
              />
              <span>New Pairing Scenario</span>
            </label>
          </div>
        </Field>

        {targetMode === 'existing' ? (
          <>
            <Field label="PO Scenario">
              <Select value={targetScenarioId} onValueChange={setTargetScenarioId}>
                <SelectTrigger data-testid="s3-target-scenario" className="h-8 text-xs">
                  <SelectValue placeholder="Select PO scenario" />
                </SelectTrigger>
                <SelectContent>
                  {poTargets.map((target) => (
                    <SelectItem key={target.id} value={String(target.id)} className="text-xs">
                      #{target.id} {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={clearBeforeImport}
                onChange={(event) => setClearBeforeImport(event.target.checked)}
              />
              <span>Clear selected PO scenario before import</span>
            </label>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-foreground">New Pairing Scenario</div>
            <Field label="Scenario name">
              <Input
                className="h-8 text-xs"
                value={newScenarioName}
                placeholder="S3 Pairing <filename>"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setNewScenarioName(event.target.value)}
              />
            </Field>
            <Field label="Date range">
              <GanttEnglishDateRangePicker
                ariaLabel="New pairing scenario date range"
                endValue={newEndDtLoc}
                pickerClassName="flex-1"
                pickerButtonClassName="h-8 w-full"
                separator={<span className="shrink-0 text-2xs text-muted-foreground">to</span>}
                startValue={newStrDtLoc}
                onEndValueChange={setNewEndDtLoc}
                onStartValueChange={setNewStrDtLoc}
              />
            </Field>
            <Field label="Division">
              <Select value={newDivision} onValueChange={setNewDivision}>
                <SelectTrigger data-testid="s3-new-division" className="h-8 text-xs">
                  <SelectValue placeholder="Select division" />
                </SelectTrigger>
                <SelectContent>
                  {divisionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
