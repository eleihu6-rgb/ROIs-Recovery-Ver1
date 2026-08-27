import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { S3PairingImportDialog } from '../s3-pairing-import-dialog'

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <div data-testid="s3-pairing-import-dialog"><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({ children, onClick, disabled, 'data-testid': testId }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; 'data-testid'?: string }) =>
    <button data-testid={testId} disabled={disabled} onClick={onClick}>{children}</button>,
  EnglishDateRangePicker: ({
    endValue,
    onEndValueChange,
    onStartValueChange,
    startValue,
  }: {
    endValue: string
    onEndValueChange: (value: string) => void
    onStartValueChange: (value: string) => void
    startValue: string
  }) => (
    <div>
      <input aria-label="date range start" type="text" value={startValue} onChange={(event) => onStartValueChange(event.target.value)} />
      <input aria-label="date range end" type="text" value={endValue} onChange={(event) => onEndValueChange(event.target.value)} />
    </div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, 'data-testid': testId }: { children: React.ReactNode; 'data-testid'?: string }) => <span data-testid={testId}>{children}</span>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder}</option>,
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
}))

const renderDialog = () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const onImport = vi.fn()
  const onOpenChange = vi.fn()

  act(() => {
    root.render(
      <S3PairingImportDialog
        open
        onOpenChange={onOpenChange}
        importing={false}
        poTargets={[{ id: 800, name: 'PO Target', status: 'DRAFT', strDtLoc: '2026-01-31', endDtLoc: '2026-02-28' }]}
        divisionOptions={[{ value: 'P', label: 'P - Pilot' }]}
        onImport={onImport}
      />,
    )
  })

  return { container, onImport, onOpenChange }
}

describe('S3PairingImportDialog', () => {
  it('requires a PRG file before Import PO is enabled', () => {
    const { container } = renderDialog()

    expect(container.textContent).toContain('S3 Pairing Import')
    expect((container.querySelector('[data-testid="s3-pairing-import-confirm"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables import for an existing PO scenario when a PRG file is selected', () => {
    const { container } = renderDialog()
    const file = new File(['PRG'], 'sample.PRG')

    act(() => {
      Object.defineProperty(container.querySelector('[data-testid="s3-pairing-file"]'), 'files', { value: [file] })
      container.querySelector<HTMLInputElement>('[data-testid="s3-pairing-file"]')?.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect((container.querySelector('[data-testid="s3-pairing-import-confirm"]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('requires date range and division for new target mode without showing base', () => {
    const { container } = renderDialog()

    act(() => {
      ;(container.querySelector('[data-testid="s3-target-mode-new"]') as HTMLInputElement).click()
    })

    expect(container.textContent).toContain('New Pairing Scenario')
    expect(container.textContent).toContain('Date range')
    expect(container.textContent).toContain('Division')
    expect(container.textContent).not.toContain('Base')
    expect(container.querySelector('[data-testid="s3-new-base"]')).toBeNull()
    expect((container.querySelector('[data-testid="s3-pairing-import-confirm"]') as HTMLButtonElement).disabled).toBe(true)
  })
})
