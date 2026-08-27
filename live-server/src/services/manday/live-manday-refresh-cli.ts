export interface LiveMandayRefreshArgs {
  startDt?: string
  endDt?: string
  recentDays?: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const dateString = (date: Date): string => date.toISOString().slice(0, 10)

export const liveMandayRefreshUsage = (): string => [
  'usage:',
  '  tsx scripts/live-manday-refresh.ts --start=YYYY-MM-DD --end=YYYY-MM-DD',
  '  tsx scripts/live-manday-refresh.ts --recent-days=60',
].join('\n')

export function parseArgs(argv: string[]): LiveMandayRefreshArgs {
  const startDt = argv.find((arg) => arg.startsWith('--start='))?.split('=')[1]
  const endDt = argv.find((arg) => arg.startsWith('--end='))?.split('=')[1]
  const recentRaw = argv.find((arg) => arg.startsWith('--recent-days='))?.split('=')[1]

  if ((startDt && !endDt) || (!startDt && endDt)) {
    throw new Error('--start and --end must be provided together')
  }
  if (startDt && !DATE_RE.test(startDt)) throw new Error('--start must be YYYY-MM-DD')
  if (endDt && !DATE_RE.test(endDt)) throw new Error('--end must be YYYY-MM-DD')
  if (startDt && endDt && startDt > endDt) throw new Error('--start must be on or before --end')

  let recentDays: number | undefined
  if (recentRaw != null) {
    const parsedRecentDays = Number(recentRaw)
    if (!Number.isInteger(parsedRecentDays) || parsedRecentDays <= 0) {
      throw new Error('--recent-days must be a positive integer')
    }
    recentDays = parsedRecentDays
  }
  if (startDt && recentDays) {
    throw new Error('--recent-days cannot be combined with --start/--end')
  }

  return { startDt, endDt, recentDays }
}

export function resolveWindow(args: LiveMandayRefreshArgs, now = new Date()): { startDt: string; endDt: string } {
  if (args.startDt && args.endDt) return { startDt: args.startDt, endDt: args.endDt }
  const days = args.recentDays ?? 60
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  return { startDt: dateString(start), endDt: dateString(end) }
}
