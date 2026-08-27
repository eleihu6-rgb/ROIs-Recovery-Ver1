import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginPage } from '../login-page'

const { authState } = vi.hoisted(() => ({
  authState: {
    login: vi.fn(),
    loading: false,
    error: null,
  },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (state: typeof authState) => T): T => selector(authState),
}))

vi.mock('@/services/public-config-service', () => ({
  publicConfigService: {
    fetch: vi.fn().mockResolvedValue({ airline: 'F8' }),
  },
}))

describe('LoginPage security copy', () => {
  beforeEach(() => {
    authState.login.mockReset()
    authState.loading = false
    authState.error = null
  })

  it('does not render the demo password hint', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<LoginPage />)
    })

    expect(container.textContent).toContain('Usernames are not case-sensitive.')
    expect(container.textContent).not.toContain('Test password')
    expect(container.textContent).not.toContain('Our2027')
    expect(container.querySelector('[data-testid="login-user-code"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="login-password"]')).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('allows browser autofill and syncs silent DOM values before submit', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<LoginPage />)
    })

    const form = container.querySelector<HTMLFormElement>('#altair-login-form')!
    const userCodeInput = container.querySelector<HTMLInputElement>('[data-testid="login-user-code"]')!
    const passwordInput = container.querySelector<HTMLInputElement>('[data-testid="login-password"]')!

    const submitButton = container.querySelector<HTMLButtonElement>('[data-testid="login-sign-in"]')!

    expect(form.getAttribute('autocomplete')).toBe('on')
    expect(userCodeInput.getAttribute('autocomplete')).toBe('section-altair username')
    expect(passwordInput.getAttribute('autocomplete')).toBe('section-altair current-password')
    expect(userCodeInput.readOnly).toBe(false)
    expect(passwordInput.readOnly).toBe(false)
    expect(submitButton.disabled).toBe(true)

    await act(async () => {
      userCodeInput.value = 'Ryan'
      passwordInput.value = 'Our2027'
      await new Promise((resolve) => window.setTimeout(resolve, 300))
    })

    expect(userCodeInput.value).toBe('Ryan')
    expect(passwordInput.value).toBe('Our2027')
    expect(submitButton.disabled).toBe(false)

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(authState.login).toHaveBeenCalledWith('Ryan', 'Our2027')

    await act(async () => {
      root.unmount()
    })
  })
})
