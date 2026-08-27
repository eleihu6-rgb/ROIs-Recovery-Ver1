import { HelpStep, HelpNote, HelpWarning, HelpControlsRef } from '../../help-article'

export default function SettingsSignout() {
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>sign-out (door) icon</strong> in the top-right corner of the navigation bar.
        The button has no text label — hover over it to see the <strong>Sign Out</strong> tooltip.
        You are immediately signed out and taken back to the login screen.
      </HelpStep>

      <HelpWarning>
        Any unsaved changes on the Live screen are lost when you sign out.
        Press <kbd>Ctrl+S</kbd> to save before signing out.
      </HelpWarning>

      <HelpNote>
        For security, your session is monitored for inactivity. After <strong>60 minutes</strong> with no
        activity, a <strong>Session Timeout</strong> dialog appears with a <strong>3-minute</strong> countdown.
        If you do nothing, you are signed out automatically when the countdown reaches zero. Click{' '}
        <strong>Stay Logged In</strong> to reset the timer, or <strong>Sign Out</strong> to end the session
        immediately.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Sign Out icon', description: 'Door icon in the top-right corner. Hover to see the Sign Out tooltip. Ends your session immediately and redirects to the login screen.' },
        { name: 'Session Timeout dialog', description: 'Appears after 60 minutes of inactivity. Shows a 3-minute countdown, then signs you out automatically.' },
      ]} />
    </>
  )
}
