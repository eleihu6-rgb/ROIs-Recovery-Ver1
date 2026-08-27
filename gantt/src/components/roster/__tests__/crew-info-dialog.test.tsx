import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrewInfoDialog } from '../crew-info-dialog'
import { useUiStore } from '@/stores/ui-store'

const { getInfo } = vi.hoisted(() => ({ getInfo: vi.fn() }))

vi.mock('@/services/crew-api', () => ({
  crewApi: { getInfo },
}))

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children, footer }: { open: boolean; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <div data-testid="app-dialog"><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

const info = {
  crew: {
    id: 1,
    crewId: 'C001',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    preferredName: null,
    gender: 'F',
    division: 'P',
    filiale: 'F8',
    status: 1,
    remarks: 'Test crew',
    seniorityNum: '12',
    retireDt: '2030-01-01',
    termDt: '2031-01-01',
    avatar: 'avatar.png',
  },
  ranks: [{
    id: 10,
    crewId: 'C001',
    rank: 'CA',
    division: 'P',
    effDt: '2020-01-01',
    expDt: null,
    probationEndDt: '2021-01-01',
    position: 'CAPTAIN',
    preCumulatedExpDays: 20,
    fleetGrp: 'A',
    acType: 'A320',
  }],
  bases: [
    {
      id: 11,
      crewId: 'C001',
      base: 'YVR',
      effDt: '2020-01-01',
      expDt: null,
      isPrimeBase: 1,
      effDtUtc: '2020-01-01T00:00:00.000Z',
      expDtUtc: null,
    },
    { id: 16, crewId: 'C001', base: 'YYZ', effDt: '2022-01-01', expDt: null },
  ],
  fleets: [{ id: 12, crewId: 'C001', fleetSpecific: 'A320', effDt: '2020-01-01', expDt: null }],
  qualifications: [{
    id: 13,
    crewId: 'C001',
    qualification: 'ETOPS',
    effDt: '2020-01-01',
    renewedDt: null,
    expDt: null,
    fleetSpecific: 'A320',
    acType: 'A320',
    rank: 'CA',
    position: 'CAPTAIN',
    isValid: 1,
    remarks: 'hidden',
    airport: 'YVR',
    remarkDetails: 'hidden',
    bases: 'YVR',
    ranks: 'CA',
    fleets: 'A320',
    teams: 'TEAM-A',
    nextPlannedDate: '2024-01-01',
    displayFlag: 1,
    status: 'ACTIVE',
    projectDate: '2020-01-01',
    recordStatus: 'ACTIVE',
    baseMonth: '2020-01-01',
  }],
  certifications: [{
    id: 15,
    crewId: 'C001',
    certificate: 'MED',
    certificateNo: 'M-1',
    effDt: '2020-01-01T10:00:00.000Z',
    invalidDt: null,
    expDt: '2025-01-01T10:00:00.000Z',
    tmpIssueCountry: 'CA',
    tmpIssueAuthority: 'Authority',
    referenceNo: 'REF',
    referenceId: 99,
    isValid: 1,
    remarks: 'hidden',
    interfaceCrewCertId: 'hidden',
    isPrimary: 1,
    nationality: 'CA',
    surname: 'Lovelace',
    titleName: 'Ms',
    givenName: 'Ada',
  }],
  teams: [{
    id: 14,
    crewId: 'C001',
    team: 'TEAM-A',
    effDt: '2020-01-01',
    expDt: null,
    isValid: 1,
    remarks: 'hidden',
    source: 'NOC',
    teamTaskId: 'hidden',
  }],
}

const renderDialog = (): { root: Root; container: HTMLDivElement } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<CrewInfoDialog />))
  return { root, container }
}

describe('CrewInfoDialog', () => {
  beforeEach(() => {
    getInfo.mockReset().mockResolvedValue(info)
    act(() => useUiStore.getState().openCrewInfo('C001'))
  })

  afterEach(() => {
    act(() => useUiStore.getState().closeCrewInfo())
    document.body.innerHTML = ''
  })

  it('loads one-page crew info with filtered and sorted records', async () => {
    const { root, container } = renderDialog()
    await act(async () => Promise.resolve())

    expect(getInfo).toHaveBeenCalledWith('C001')
    expect(container.textContent).toContain('Ada Lovelace')
    expect(container.textContent).not.toContain('Basic Info')
    expect(container.textContent).not.toContain('Crew Records')
    expect(container.textContent).toContain('Seniority')
    expect(container.textContent).not.toContain('Seniority Num')
    expect(container.textContent).not.toContain('Crew ID')
    expect(container.querySelector('[data-testid^="crew-info-tab-"]')).toBeNull()
    expect(container.textContent).not.toContain('Status')
    expect(container.textContent).toContain('12')
    expect(container.textContent).not.toContain('Retire Dt')
    expect(container.textContent).not.toContain('Term Dt')
    expect(container.textContent).not.toContain('Avatar')
    expect(container.querySelector('[data-testid="crew-info-table-base"]')?.textContent).not.toContain('Is Prime Base')
    expect(container.querySelector('[data-testid="crew-info-table-rank"]')?.textContent).not.toContain('Probation End Dt')
    expect(container.querySelector('[data-testid="crew-info-table-rank"]')?.textContent).not.toContain('Division')
    expect(container.querySelector('[data-testid="crew-info-table-base"] tbody tr')?.textContent).toContain('2022-01-01')
    expect(container.textContent).toContain('ETOPS')
    expect(container.querySelector('[data-testid="crew-info-table-qualification"]')?.textContent).toContain('ETOPS')
    expect(container.querySelector('[data-testid="crew-info-table-qualification"]')?.textContent).not.toContain('Renewed Dt')
    expect(container.querySelector('[data-testid="crew-info-table-certification"]')?.textContent).toContain('2025-01-01')
    expect(container.querySelector('[data-testid="crew-info-table-certification"]')?.textContent).not.toContain('interfaceCrewCertId')
    expect(container.querySelector('[data-testid="crew-info-table-qualification"]')?.textContent).not.toContain('Fleet Specific')
    expect(container.querySelector('[data-testid="crew-info-table-team"]')?.textContent).not.toContain('Team Task Id')

    act(() => root.unmount())
  })
})
