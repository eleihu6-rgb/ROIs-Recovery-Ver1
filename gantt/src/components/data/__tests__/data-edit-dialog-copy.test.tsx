import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataEditDialog } from '../data-edit-dialog'
import { dataApi } from '@/services/data-api'

vi.mock('@rois/ui', async () => {
  const ReactModule = await import('react')
  return {
    AppDialog: ({ open, title, description, children, footer }: {
      open: boolean; title?: React.ReactNode; description?: React.ReactNode
      children: React.ReactNode; footer: React.ReactNode
    }) =>
      open
        ? ReactModule.createElement('div', { 'data-testid': 'mock-app-dialog' },
            ReactModule.createElement('span', { 'data-testid': 'mock-app-dialog-title' }, title),
            description != null
              ? ReactModule.createElement('span', { 'data-testid': 'mock-app-dialog-description' }, description)
              : null,
            children,
            footer,
          )
        : null,
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      ReactModule.createElement('button', props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      ReactModule.createElement('input', props),
    toast: {
      error: vi.fn(),
      success: vi.fn(),
    },
    cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  }
})

vi.mock('@/utils/notify', () => ({
  notify: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/services/data-api', () => ({
  dataApi: {
    save: vi.fn().mockResolvedValue({ committed: 1 }),
    validate: vi.fn().mockResolvedValue([]),
  },
}))

const renderDialog = (props?: Partial<Parameters<typeof DataEditDialog>[0]>): Root => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <DataEditDialog
        entityId="base"
        row={null}
        initialValues={{
          id: 17,
          filiale: 'F8',
          base: 'YVR',
          name: 'Vancouver',
          displayOrder: 3,
          createdBy: 'system',
        }}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        {...props}
      />,
    )
  })

  return root
}

const renderCrewBaseCopyDialog = (): Root => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <DataEditDialog
        entityId="crew_base"
        row={null}
        initialValues={{
          id: 29,
          crewId: '12345',
          base: 'YVR',
          effDt: '2026-07-01',
          expDt: '2026-07-31',
        }}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
  })

  return root
}

/** Drive a React controlled input to a new value (native setter + input event). */
const setInputValue = (testId: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
  if (!input) throw new Error(`input ${testId} not found`)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const titleText = (): string | null =>
  document.querySelector('[data-testid="mock-app-dialog-title"]')?.textContent ?? null

describe('DataEditDialog copy mode', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('submits copied values as a create without rowId or audit fields', async () => {
    const root = renderDialog()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-edit-save"]')?.click()
    })

    expect(dataApi.save).toHaveBeenCalledWith([
      expect.objectContaining({
        entityId: 'base',
        action: 'create',
        after: expect.objectContaining({
          filiale: 'F8',
          base: 'YVR',
          name: 'Vancouver',
          displayOrder: 3,
        }),
      }),
    ])
    expect(dataApi.save).not.toHaveBeenCalledWith([
      expect.objectContaining({
        rowId: expect.any(Number),
      }),
    ])
    const [[changes]] = vi.mocked(dataApi.save).mock.calls
    expect(changes[0].after).not.toHaveProperty('id')
    expect(changes[0].after).not.toHaveProperty('createdBy')

    act(() => {
      root.unmount()
    })
  })

  it('keeps readonly business keys in the copied create payload', async () => {
    const root = renderCrewBaseCopyDialog()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-edit-save"]')?.click()
    })

    const [[changes]] = vi.mocked(dataApi.save).mock.calls
    expect(changes[0].after).toEqual(expect.objectContaining({
      crewId: '12345',
      base: 'YVR',
      effDt: '2026-07-01',
      expDt: '2026-07-31',
    }))
    expect(changes[0].after).not.toHaveProperty('id')

    act(() => {
      root.unmount()
    })
  })

  it('shows a Copy title when opened with initial values', () => {
    const root = renderDialog()
    expect(titleText()).toBe('Copy Base')
    act(() => { root.unmount() })
  })

  it('shows a Copy title when mode=copy is passed explicitly', () => {
    const root = renderDialog({ mode: 'copy', initialValues: undefined })
    expect(titleText()).toBe('Copy Base')
    act(() => { root.unmount() })
  })

  it('shows an Add title for a fresh create', () => {
    const root = renderDialog({ initialValues: undefined })
    expect(titleText()).toBe('Add Base')
    act(() => { root.unmount() })
  })

  it('shows an Edit title when editing an existing row', () => {
    const root = renderDialog({ row: { id: 7, base: 'YVR', name: 'Vancouver', filiale: 'F8' } as never, initialValues: undefined })
    expect(titleText()).toBe('Edit Base')
    act(() => { root.unmount() })
  })

  it('shows the copied source row id in the description', () => {
    const root = renderDialog()
    expect(document.querySelector('[data-testid="mock-app-dialog-description"]')?.textContent).toBe('Copied from Row #17')
    act(() => { root.unmount() })
  })
})

describe('DataEditDialog validation feedback', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('highlights invalid fields and notifies the specific problem on client-side validation failure', async () => {
    const { notify } = await import('@/utils/notify')
    const root = renderDialog()

    // base is required — clear it to force a client-side validation error.
    setInputValue('data-edit-field-base', '')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-edit-save"]')?.click()
    })

    const baseInput = document.querySelector<HTMLInputElement>('[data-testid="data-edit-field-base"]')
    expect(baseInput?.className).toContain('border-destructive')
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Base is required'))
    expect(dataApi.save).not.toHaveBeenCalled()

    act(() => { root.unmount() })
  })

  it('surfaces server-side validation issues on the offending field', async () => {
    const { notify } = await import('@/utils/notify')
    vi.mocked(dataApi.save).mockRejectedValueOnce(new Error('Validation failed'))
    vi.mocked(dataApi.validate).mockResolvedValueOnce([
      {
        severity: 'error',
        code: 'duplicate_key',
        entityId: 'base',
        field: 'base',
        message: "Base 'YVR' already exists for filiale 'F8'",
      },
    ] as never)

    const root = renderDialog()
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-edit-save"]')?.click()
    })

    expect(dataApi.validate).toHaveBeenCalled()
    const baseInput = document.querySelector<HTMLInputElement>('[data-testid="data-edit-field-base"]')
    expect(baseInput?.className).toContain('border-destructive')
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining("Base 'YVR' already exists"))

    act(() => { root.unmount() })
  })
})
