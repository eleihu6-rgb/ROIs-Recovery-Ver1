import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, ExternalLink, History, RefreshCw, Save } from 'lucide-react'
import {
  AppDialog,
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@rois/ui'
import { getHttpErrorStatus } from '@/services/http-client'
import {
  createSimulatedCrewPortalSession,
  fetchSimulatedCrewPortalConfig,
  fetchSimulatedCrewPortalLogs,
  saveSimulatedCrewPortalConfig,
  type SimulatedCrewPortalLogItem,
} from '@/services/pbs-simulated-crew-portal-api'
import { notify } from '@/utils/notify'
import { useShellStore } from '@/stores/shell-store'

const MAX_PORTAL_URL_LENGTH = 50
const MAX_LOGIN_TTL_SECONDS = 3600

interface PortalConfigFormErrors {
  portalPublicUrl?: string
  loginTtlSeconds?: string
}

const normalizePortalUrlInput = (value: string): { value?: string; error?: string } => {
  const trimmed = value.trim()

  if (!trimmed) {
    return { error: 'Portal URL is required.' }
  }

  let normalized = ''
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'Portal URL must use http or https.' }
    }
    normalized = url.toString().replace(/\/+$/, '')
  } catch {
    return { error: 'Portal URL must be a valid URL.' }
  }

  if (normalized.length > MAX_PORTAL_URL_LENGTH) {
    return { error: 'Portal URL must be 50 characters or fewer.' }
  }

  return { value: normalized }
}

const parseTokenTtlInput = (value: string): { value?: number; error?: string } => {
  const trimmed = value.trim()

  if (!trimmed) {
    return { error: 'Token TTL Seconds is required.' }
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LOGIN_TTL_SECONDS) {
    return { error: 'Token TTL Seconds must be an integer from 1 to 3600.' }
  }

  return { value: parsed }
}

const formatDateTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const resultBadgeClassName = (result: string): string => {
  if (result.toUpperCase() === 'SUCCESS') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  }
  return 'border-red-300 bg-red-50 text-red-700'
}

const LogDialog = ({
  open,
  loading,
  logs,
  onOpenChange,
  onRefresh,
}: {
  open: boolean
  loading: boolean
  logs: SimulatedCrewPortalLogItem[]
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
}): ReactNode => (
  <AppDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Simulated Crew Portal Log"
    icon={<History className="h-4 w-4" />}
    className="sm:max-w-[860px]"
    bodyClassName="p-0"
    footer={(
      <>
        <Button variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
          <RefreshCw className={['mr-1.5 h-3.5 w-3.5', loading ? 'animate-spin' : ''].join(' ')} />
          Refresh
        </Button>
        <Button size="sm" onClick={() => onOpenChange(false)}>Close</Button>
      </>
    )}
    data-testid="pbs-simulated-crew-portal-log-dialog"
  >
    <div className="max-h-[520px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/60">
          <TableRow>
            <TableHead className="w-[180px]">Admin User</TableHead>
            <TableHead className="w-[120px]">Crew Code</TableHead>
            <TableHead>Crew Name</TableHead>
            <TableHead className="w-[120px]">Result</TableHead>
            <TableHead className="w-[190px]">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                {loading ? 'Loading logs...' : 'No simulated login logs.'}
              </TableCell>
            </TableRow>
          ) : logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium text-foreground">
                <div className="truncate">{log.adminUser}</div>
                <div className="mt-0.5 truncate text-2xs text-muted-foreground">{log.adminUserCode}</div>
              </TableCell>
              <TableCell className="font-mono text-xs">{log.crewCode}</TableCell>
              <TableCell>{log.crewName}</TableCell>
              <TableCell>
                <Badge variant="outline" className={resultBadgeClassName(log.result)}>
                  {log.result}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{formatDateTime(log.loginTime)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </AppDialog>
)

export const PbsSimulatedCrewPortalView = (): ReactNode => {
  const setPbsItem = useShellStore((state) => state.setPbsItem)
  const [portalPublicUrl, setPortalPublicUrl] = useState('')
  const [loginTtlSeconds, setLoginTtlSeconds] = useState('300')
  const [configErrors, setConfigErrors] = useState<PortalConfigFormErrors>({})
  const [configLoadError, setConfigLoadError] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [crewCode, setCrewCode] = useState('')
  const [crewCodeError, setCrewCodeError] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logs, setLogs] = useState<SimulatedCrewPortalLogItem[]>([])

  const returnToPeriodForForbidden = useCallback((): void => {
    notify.error('You do not have permission to simulate crew portal login.')
    setPbsItem('period')
  }, [setPbsItem])

  const loadConfig = useCallback(async (): Promise<void> => {
    setConfigLoading(true)
    setConfigLoadError(null)
    try {
      const config = await fetchSimulatedCrewPortalConfig()
      setPortalPublicUrl(config.portalPublicUrl)
      setLoginTtlSeconds(String(config.loginTtlSeconds))
      setConfigErrors({})
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      setConfigLoadError('Portal configuration could not be loaded. You can still enter values and save.')
    } finally {
      setConfigLoading(false)
    }
  }, [returnToPeriodForForbidden])

  const loadLogs = useCallback(async (): Promise<void> => {
    setLogLoading(true)
    try {
      const response = await fetchSimulatedCrewPortalLogs()
      setLogs(response.logs)
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      notify.error('Simulated crew portal logs could not be loaded. Try again.')
    } finally {
      setLogLoading(false)
    }
  }, [returnToPeriodForForbidden])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const openLogs = (): void => {
    setLogOpen(true)
    void loadLogs()
  }

  const saveConfig = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const normalizedUrl = normalizePortalUrlInput(portalPublicUrl)
    const parsedTtl = parseTokenTtlInput(loginTtlSeconds)
    const nextErrors: PortalConfigFormErrors = {}

    if (normalizedUrl.error) nextErrors.portalPublicUrl = normalizedUrl.error
    if (parsedTtl.error) nextErrors.loginTtlSeconds = parsedTtl.error

    setConfigErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !normalizedUrl.value || parsedTtl.value === undefined) {
      return
    }

    setConfigSaving(true)
    try {
      const saved = await saveSimulatedCrewPortalConfig({
        portalPublicUrl: normalizedUrl.value,
        loginTtlSeconds: parsedTtl.value,
      })
      setPortalPublicUrl(saved.portalPublicUrl)
      setLoginTtlSeconds(String(saved.loginTtlSeconds))
      setConfigLoadError(null)
      notify.success('Portal configuration saved.')
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      notify.error('Portal configuration could not be saved. Check the fields and try again.')
    } finally {
      setConfigSaving(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmedCrewCode = crewCode.trim()

    if (!trimmedCrewCode) {
      setCrewCodeError('Crew code is required.')
      return
    }

    setCrewCodeError(null)
    setSimulating(true)
    try {
      const session = await createSimulatedCrewPortalSession(trimmedCrewCode)
      window.open(session.url, '_blank', 'noopener,noreferrer')
      notify.success('Simulated crew portal opened in a new tab.')
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      notify.error(err instanceof Error ? err.message : 'Simulated crew portal could not be opened.')
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="h-full overflow-auto bg-background" data-testid="pbs-simulated-crew-portal-view">
      <div className="border-b border-border bg-background">
        <div className="flex h-11 items-center justify-between px-4">
          <h1 className="text-sm font-semibold text-foreground">Simulated Crew Portal</h1>
          <Button data-testid="pbs-simulated-crew-portal-log-btn" variant="outline" size="sm" onClick={openLogs}>
            <History className="mr-1.5 h-3.5 w-3.5" />
            Log
          </Button>
        </div>
      </div>

      <div className="p-4">
        <section className="max-w-[720px] overflow-hidden rounded-sm border border-border bg-background">
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Portal Configuration</h2>
          </div>
          <form className="space-y-4 p-4" onSubmit={(event) => void saveConfig(event)}>
            {configLoadError ? (
              <div
                data-testid="pbs-simulated-portal-config-error"
                role="alert"
                className="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{configLoadError}</span>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
              <label className="block min-w-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Portal URL
                <Input
                  data-testid="pbs-simulated-portal-url-input"
                  aria-invalid={configErrors.portalPublicUrl ? 'true' : undefined}
                  aria-describedby={configErrors.portalPublicUrl ? 'pbs-simulated-portal-url-error' : undefined}
                  className="mt-1 h-8 text-xs normal-case tracking-normal text-foreground"
                  placeholder="https://crew-f8-usva-sit.roiscloud.com/pbs"
                  value={portalPublicUrl}
                  disabled={configLoading}
                  onChange={(event) => {
                    setPortalPublicUrl(event.target.value)
                    if (configErrors.portalPublicUrl) {
                      setConfigErrors((current) => ({ ...current, portalPublicUrl: undefined }))
                    }
                  }}
                />
                {configErrors.portalPublicUrl ? (
                  <span id="pbs-simulated-portal-url-error" className="mt-1 block text-2xs normal-case tracking-normal text-destructive">
                    {configErrors.portalPublicUrl}
                  </span>
                ) : null}
              </label>

              <label className="block min-w-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Token TTL Seconds
                <Input
                  data-testid="pbs-simulated-token-ttl-input"
                  aria-invalid={configErrors.loginTtlSeconds ? 'true' : undefined}
                  aria-describedby={configErrors.loginTtlSeconds ? 'pbs-simulated-token-ttl-error' : undefined}
                  className="mt-1 h-8 text-xs normal-case tracking-normal text-foreground"
                  inputMode="numeric"
                  placeholder="300"
                  value={loginTtlSeconds}
                  disabled={configLoading}
                  onChange={(event) => {
                    setLoginTtlSeconds(event.target.value)
                    if (configErrors.loginTtlSeconds) {
                      setConfigErrors((current) => ({ ...current, loginTtlSeconds: undefined }))
                    }
                  }}
                />
                {configErrors.loginTtlSeconds ? (
                  <span id="pbs-simulated-token-ttl-error" className="mt-1 block text-2xs normal-case tracking-normal text-destructive">
                    {configErrors.loginTtlSeconds}
                  </span>
                ) : null}
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="pbs-simulated-portal-config-save"
                type="submit"
                size="sm"
                disabled={configLoading || configSaving}
              >
                {configSaving ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                {configSaving ? 'Saving...' : 'Save Configuration'}
              </Button>
              {configLoading ? (
                <span className="text-xs text-muted-foreground">Loading configuration...</span>
              ) : null}
            </div>
          </form>
        </section>

        <section className="mt-4 max-w-[720px] overflow-hidden rounded-sm border border-border bg-background">
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Simulate Portal Login</h2>
          </div>
          <form className="space-y-4 p-4" onSubmit={(event) => void submit(event)}>
            <label className="block max-w-xl text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Crew
              <Input
                data-testid="pbs-simulated-crew-code-input"
                aria-invalid={crewCodeError ? 'true' : undefined}
                aria-describedby={crewCodeError ? 'pbs-simulated-crew-code-error' : undefined}
                className="mt-1 h-8 text-xs normal-case tracking-normal text-foreground"
                placeholder="Crew code"
                value={crewCode}
                onChange={(event) => {
                  setCrewCode(event.target.value)
                  if (crewCodeError) setCrewCodeError(null)
                }}
              />
              {crewCodeError ? (
                <span id="pbs-simulated-crew-code-error" className="mt-1 block text-2xs normal-case tracking-normal text-destructive">
                  {crewCodeError}
                </span>
              ) : null}
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="pbs-simulated-crew-portal-submit"
                type="submit"
                size="sm"
                disabled={simulating}
              >
                {simulating ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                )}
                Simulate
              </Button>
            </div>
          </form>
        </section>
      </div>

      <LogDialog
        open={logOpen}
        loading={logLoading}
        logs={logs}
        onOpenChange={setLogOpen}
        onRefresh={() => void loadLogs()}
      />
    </div>
  )
}
