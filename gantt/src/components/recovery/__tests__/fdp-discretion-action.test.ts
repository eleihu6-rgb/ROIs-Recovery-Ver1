import { describe, expect, it } from 'vitest'
import {
  deriveFdpConsentStatus,
  fdpConsentActionLabel,
  fdpConsentNeedsFallback,
  fdpConsentStatusLabel,
  humanizeConsentError,
  FDP_CONSENT_EXECUTION_NOTE,
  type FdpConsentFeedback,
} from '../fdp-discretion-action'

const feedback = (states: string[]): FdpConsentFeedback => ({
  proposalId: 'p1',
  requests: states.map((state, index) => ({ crewId: `C${index + 1}`, state })),
  consentComplete: states.every((state) => state === 'accepted'),
  proceedAllowed: false,
  proceedReason: 'pending',
})

describe('FDP discretion communication status', () => {
  it('is not-sent without a proposal and sent while every crew is pending', () => {
    expect(deriveFdpConsentStatus(null)).toBe('not-sent')
    expect(fdpConsentStatusLabel('not-sent', null)).toBe('Not sent yet')
    expect(fdpConsentActionLabel('not-sent')).toBe('Request FDP discretion')
    const sent = feedback(['pending', 'pending', 'pending'])
    expect(deriveFdpConsentStatus(sent)).toBe('sent')
    expect(fdpConsentStatusLabel('sent', sent)).toBe('Sent · waiting for crew')
  })

  it('reports a partial reply, acceptance and rejection distinctly', () => {
    const partial = feedback(['accepted', 'pending', 'pending'])
    expect(deriveFdpConsentStatus(partial)).toBe('partial')
    expect(fdpConsentStatusLabel('partial', partial)).toBe('Sent · 1 of 3 replied')
    expect(deriveFdpConsentStatus(feedback(['accepted', 'accepted']))).toBe('accepted')
    expect(fdpConsentActionLabel('accepted')).toBe('Send again')
    const rejected = feedback(['rejected', 'pending', 'pending'])
    expect(deriveFdpConsentStatus(rejected)).toBe('rejected')
    expect(fdpConsentStatusLabel('rejected', rejected)).toBe('Crew rejected')
    expect(fdpConsentActionLabel('rejected')).toBe('Resend')
  })

  it('lets a rejection outrank expiry and treats rejected/expired as the standby fallback', () => {
    expect(deriveFdpConsentStatus(feedback(['rejected', 'expired']))).toBe('rejected')
    expect(deriveFdpConsentStatus(feedback(['expired', 'pending']))).toBe('expired')
    expect(deriveFdpConsentStatus(feedback(['superseded']))).toBe('superseded')
    expect(fdpConsentNeedsFallback('rejected')).toBe(true)
    expect(fdpConsentNeedsFallback('expired')).toBe(true)
    expect(fdpConsentNeedsFallback('pending' as never)).toBe(false)
    expect(fdpConsentNeedsFallback('accepted')).toBe(false)
  })

  it('keeps the execution caveat as the canonical sentence', () => {
    expect(FDP_CONSENT_EXECUTION_NOTE).toContain('Crew agreement communication only')
    expect(FDP_CONSENT_EXECUTION_NOTE).toContain('Apply remains disabled')
  })
})

describe('humanizeConsentError', () => {
  it('turns the raw Zod "reason" too_small issue into a plain-English sentence', () => {
    const raw = JSON.stringify([
      { code: 'too_small', minimum: 1, type: 'string', inclusive: true, exact: false, message: 'String must contain at least 1 character(s)', path: ['reason'] },
    ])
    const humanized = humanizeConsentError(raw)
    expect(humanized).toBe('Reason for crew is required.')
    // The raw Zod tokens must never survive to the UI.
    expect(humanized).not.toContain('too_small')
    expect(humanized).not.toContain('[')
    expect(humanized).not.toContain('character(s)')
  })

  it('labels multiple issues and de-duplicates, mapping known fields', () => {
    const raw = JSON.stringify([
      { code: 'too_small', message: 'Number must be greater than 0', path: ['extensionRequestedMin'] },
      { code: 'invalid_string', message: 'Invalid datetime', path: ['expiresUtc'] },
    ])
    expect(humanizeConsentError(raw)).toBe('Requested extension Number must be greater than 0. Reply deadline Invalid datetime.')
  })

  it('passes non-JSON business/network messages through unchanged', () => {
    expect(humanizeConsentError('Duty details changed. Reload the authoritative proposal before sending.'))
      .toBe('Duty details changed. Reload the authoritative proposal before sending.')
    expect(humanizeConsentError('Network Error')).toBe('Network Error')
  })
})
