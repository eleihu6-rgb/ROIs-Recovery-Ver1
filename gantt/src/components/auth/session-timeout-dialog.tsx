import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Clock, LogOut, RefreshCw } from 'lucide-react'

/**
 * Session timeout warning dialog.
 *
 * Shown when the user has been idle for 1 hour (no API requests).
 * Displays a 3-minute countdown. If no action taken, forces logout.
 * User can click "Stay Logged In" to reset the idle timer.
 *
 * Design: modal overlay with urgent but not alarming styling.
 * Uses semantic theme colors for full multi-theme support.
 */
export const SessionTimeoutDialog = () => {
  const show = useAuthStore((s) => s.showTimeoutWarning)
  const expiresAt = useAuthStore((s) => s.warningExpiresAt)
  const dismiss = useAuthStore((s) => s.dismissWarning)
  const logout = useAuthStore((s) => s.logout)

  const [remaining, setRemaining] = useState(180) // seconds

  // Countdown tick
  useEffect(() => {
    if (!show || !expiresAt) return

    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setRemaining(left)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [show, expiresAt])

  const handleStay = useCallback(() => {
    dismiss()
  }, [dismiss])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  if (!show) return null

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const progressPct = expiresAt ? Math.max(0, (expiresAt - Date.now()) / (3 * 60 * 1000)) * 100 : 0
  const isUrgent = remaining <= 30

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25">
      <div className="w-full max-w-sm animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
          {/* Progress bar — shows remaining time visually */}
          <div className="h-1 bg-muted">
            <div
              className="h-full transition-all duration-1000 ease-linear"
              style={{
                width: `${progressPct}%`,
                backgroundColor: isUrgent ? 'hsl(var(--destructive))' : 'hsl(var(--ring))',
              }}
            />
          </div>

          <div className="p-5">
            {/* Icon + Title */}
            <div className="mb-4 flex items-start gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: isUrgent ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--ring) / 0.1)',
                }}
              >
                <Clock
                  className="h-4.5 w-4.5"
                  style={{
                    color: isUrgent ? 'hsl(var(--destructive))' : 'hsl(var(--ring))',
                  }}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Session Timeout
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  You have been inactive for over 1 hour. For security, your session will expire automatically.
                </p>
              </div>
            </div>

            {/* Countdown display */}
            <div className="mb-4 flex items-center justify-center gap-2 rounded-md border border-border/50 bg-muted/40 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Auto logout in
              </span>
              <span
                className="font-mono text-lg font-bold tabular-nums"
                style={{
                  color: isUrgent ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))',
                }}
              >
                {timeStr}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleLogout}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-border bg-background text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
              <button
                onClick={handleStay}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded bg-primary text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
