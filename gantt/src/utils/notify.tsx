import { toast } from '@rois/ui'
import { CheckCircle2, XCircle, AlertTriangle, Info, Copy, Check } from 'lucide-react'
import { useState } from 'react'

/**
 * Themed toast notifications — ui-ux-pro-max compliant.
 * Uses semantic theme colors only (no raw Tailwind colors).
 */

const copyToClipboard = (text: string) => {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

const fallbackCopy = (text: string) => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      className="shrink-0 rounded p-0.5 opacity-50 transition-all duration-100 hover:bg-accent/40 hover:opacity-100 active:scale-95"
      onClick={handleCopy}
      title="Copy message"
    >
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

const renderToast = (
  message: string,
  icon: React.ReactNode,
  type: 'success' | 'error' | 'warning' | 'info',
  showCopy: boolean,
) => {
  return toast.custom(() => (
    <div className={[
      'flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs shadow-lg',
      type === 'success' ? 'border-primary/30 bg-primary/10 text-primary' : '',
      type === 'error' ? 'border-destructive/30 bg-destructive/10 text-destructive' : '',
      type === 'warning' ? 'border-ring/30 bg-ring/10 text-ring' : '',
      type === 'info' ? 'border-muted-foreground/30 bg-muted/50 text-foreground' : '',
    ].join(' ')}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex-1 leading-snug">{message}</span>
      {showCopy && <CopyBtn text={message} />}
    </div>
  ), { duration: type === 'error' ? 8000 : 4000 })
}

export const notify = {
  success: (message: string) =>
    renderToast(message, <CheckCircle2 className="h-4 w-4" />, 'success', false),

  error: (message: string) =>
    renderToast(message, <XCircle className="h-4 w-4" />, 'error', true),

  warning: (message: string) =>
    renderToast(message, <AlertTriangle className="h-4 w-4" />, 'warning', true),

  info: (message: string) =>
    renderToast(message, <Info className="h-4 w-4" />, 'info', false),
}
