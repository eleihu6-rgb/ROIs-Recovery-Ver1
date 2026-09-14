import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
import { DiscretionConsentComposer } from '../discretion-consent-panel'
vi.mock('@/services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
const oldWindow = { reportUtc: '2026-09-28T04:00:00Z', releaseUtc: '2026-09-28T15:15:00Z', fdpMin: 660 }
const currentWindow = { ...oldWindow, releaseUtc: '2026-09-28T17:15:00Z', fdpMin: 780 }
const proposal = { airline: 'F8', pairingId: 42, dutySeq: 1, ruleSetId: 1, before: oldWindow, after: oldWindow,
  reason: 'Original crew proposal', expiresUtc: '2026-09-28T03:00:00Z', extensionRequestedMin: 60 }
const feedback = { proposalId: 'old', requests: [{ crewId: 'S21001', state: 'pending' }], consentComplete: false, proceedAllowed: false, proceedReason: 'Pending' }
beforeEach(() => vi.clearAllMocks())
describe('controller immutable crew agreement', () => {
  it('reopens the actual sent snapshot even if the current duty has changed', async () => {
    vi.mocked(api.get).mockResolvedValue({ airline: 'F8', before: currentWindow, after: currentWindow,
      previousProposal: proposal, previous: { ...feedback, requests: [{ crewId: 'S21001', state: 'superseded' }] } } as never)
    const host = document.createElement('div'); const root = createRoot(host)
    await act(async () => root.render(<DiscretionConsentComposer pairingId={42} dutySeq={1} ruleSetId={1} onReturnToReview={vi.fn()} />))
    expect(host.textContent).toContain('FDP 11h 00m')
    expect(host.textContent).not.toContain('FDP 13h 00m')
    expect(host.textContent).toContain('Sent proposal')
    expect(host.textContent).toContain('Duty changed')
    await act(async () => ([...host.querySelectorAll('button')].find(b => b.textContent === 'Prepare new request')!).click())
    expect(host.textContent).toContain('FDP 13h 00m')
    expect(host.textContent).not.toContain('Sent proposal')
    await act(async () => root.unmount())
  })
  it('refreshes every recipient and returns to review only after all Yes without regulatory execution', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ airline: 'F8', before: oldWindow, after: oldWindow, previousProposal: proposal, previous: feedback } as never)
      .mockResolvedValueOnce({ ...feedback, requests: [{ crewId: 'S21001', state: 'accepted' }], consentComplete: true,
        proceedReason: 'Independent regulatory validation is still required.' } as never)
    const onReview = vi.fn(); const host = document.createElement('div'); const root = createRoot(host)
    await act(async () => root.render(<DiscretionConsentComposer pairingId={42} dutySeq={1} ruleSetId={1} onReturnToReview={onReview} />))
    const review = () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Return to controller review')!
    expect(review().disabled).toBe(true)
    await act(async () => ([...host.querySelectorAll('button')].find(b => b.textContent === 'Refresh crew feedback')!).click())
    expect(host.textContent).toContain('Yes')
    expect(review().disabled).toBe(false)
    expect(host.textContent).toContain('Independent regulatory validation is still required.')
    await act(async () => review().click())
    expect(onReview).toHaveBeenCalledTimes(1)
    expect(api.post).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
