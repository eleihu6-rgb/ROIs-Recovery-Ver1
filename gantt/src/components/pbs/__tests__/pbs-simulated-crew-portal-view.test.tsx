import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PbsSimulatedCrewPortalView } from '../pbs-simulated-crew-portal-view'
import {
  createSimulatedCrewPortalSession,
  fetchSimulatedCrewPortalConfig,
  fetchSimulatedCrewPortalLogs,
  saveSimulatedCrewPortalConfig,
} from '@/services/pbs-simulated-crew-portal-api'
import { useShellStore } from '@/stores/shell-store'

vi.mock('@/services/pbs-simulated-crew-portal-api', () => ({
  createSimulatedCrewPortalSession: vi.fn(),
  fetchSimulatedCrewPortalConfig: vi.fn(),
  fetchSimulatedCrewPortalLogs: vi.fn(),
  saveSimulatedCrewPortalConfig: vi.fn(),
}))

vi.mock('@rois/ui', () => ({
  AppDialog: ({
    open,
    children,
    footer,
    title,
    'data-testid': testId,
  }: {
    open: boolean
    children: React.ReactNode
    footer?: React.ReactNode
    title?: string
    'data-testid'?: string
  }) => open ? (
    <div data-testid={testId} role="dialog">
      <h2>{title}</h2>
      {children}
      <div>{footer}</div>
    </div>
  ) : null,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({
    children,
    colSpan,
  }: {
    children: React.ReactNode
    colSpan?: number
  }) => <td colSpan={colSpan}>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}))

vi.mock('@/utils/notify', () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

const mockedCreateSession = vi.mocked(createSimulatedCrewPortalSession)
const mockedFetchConfig = vi.mocked(fetchSimulatedCrewPortalConfig)
const mockedFetchLogs = vi.mocked(fetchSimulatedCrewPortalLogs)
const mockedSaveConfig = vi.mocked(saveSimulatedCrewPortalConfig)

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

const renderView = (): { container: HTMLElement; root: Root } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<PbsSimulatedCrewPortalView />)
  })
  return { container, root }
}

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PbsSimulatedCrewPortalView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useShellStore.setState({ activePbsItem: 'simulated-crew-portal' })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    mockedFetchConfig.mockResolvedValue({
      portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
      loginTtlSeconds: 300,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('requires a crew code before simulating', async () => {
    const { container, root } = renderView()
    const simulate = container.querySelector<HTMLButtonElement>('[data-testid="pbs-simulated-crew-portal-submit"]')
    expect(simulate).not.toBeNull()

    act(() => {
      simulate?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Crew code is required.')
    expect(mockedCreateSession).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('opens the returned portal URL in a new tab', async () => {
    mockedCreateSession.mockResolvedValue({
      url: 'https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid',
      expiresAt: '2026-08-17T10:00:00.000Z',
    })
    const { container, root } = renderView()
    const crewInput = container.querySelector<HTMLInputElement>('[data-testid="pbs-simulated-crew-code-input"]')
    const simulate = container.querySelector<HTMLButtonElement>('[data-testid="pbs-simulated-crew-portal-submit"]')
    expect(crewInput).not.toBeNull()
    expect(simulate).not.toBeNull()

    setInputValue(crewInput!, 'B79185')
    await act(async () => {
      simulate?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(mockedCreateSession).toHaveBeenCalledWith('B79185')
    expect(window.open).toHaveBeenCalledWith(
      'https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid',
      '_blank',
      'noopener,noreferrer',
    )

    act(() => root.unmount())
  })

  it('saves portal configuration with normalized values', async () => {
    mockedSaveConfig.mockResolvedValue({
      portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
      loginTtlSeconds: 600,
    })
    const { container, root } = renderView()
    await flush()
    const portalInput = container.querySelector<HTMLInputElement>('[data-testid="pbs-simulated-portal-url-input"]')
    const ttlInput = container.querySelector<HTMLInputElement>('[data-testid="pbs-simulated-token-ttl-input"]')
    const saveButton = container.querySelector<HTMLButtonElement>('[data-testid="pbs-simulated-portal-config-save"]')
    expect(portalInput).not.toBeNull()
    expect(ttlInput).not.toBeNull()
    expect(saveButton).not.toBeNull()

    setInputValue(portalInput!, 'https://crew-f8-usva-sit.roiscloud.com/pbs/')
    setInputValue(ttlInput!, '600')
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(mockedSaveConfig).toHaveBeenCalledWith({
      portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
      loginTtlSeconds: 600,
    })

    act(() => root.unmount())
  })

  it('loads simulated login logs in the log dialog', async () => {
    mockedFetchLogs.mockResolvedValue({
      logs: [{
        id: '12',
        adminUser: 'Admin User',
        adminUserCode: 'admin',
        crewCode: 'B79185',
        crewName: 'Mary Nasso',
        result: 'SUCCESS',
        loginTime: '2026-08-17T10:00:00.000Z',
      }],
    })
    const { container, root } = renderView()
    const logButton = container.querySelector<HTMLButtonElement>('[data-testid="pbs-simulated-crew-portal-log-btn"]')
    expect(logButton).not.toBeNull()

    await act(async () => {
      logButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    await flush()

    expect(document.body.textContent).toContain('Mary Nasso')
    expect(document.body.textContent).toContain('B79185')
    expect(document.body.textContent).toContain('Admin User')

    act(() => root.unmount())
  })
})
