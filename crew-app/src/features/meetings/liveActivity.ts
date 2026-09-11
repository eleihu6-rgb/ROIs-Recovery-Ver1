import { NativeModules, Platform } from 'react-native';

// Bridge to the native MeetingLiveActivityModule (Swift / ActivityKit). Starts a
// Dynamic Island Live Activity that counts down to a meeting's start. No-op when
// the native module isn't present (Android, iOS < 16.1, or a build predating the
// widget extension that renders the island UI).

interface LiveActivityNativeModule {
  /** Start (or replace) the countdown for a meeting. startISO = absolute start. */
  startCountdown(payload: { id: string; title: string; startISO: string }): Promise<void>;
  /** End any active meeting countdown activity. */
  endAll(): Promise<void>;
  /** Whether the user has Live Activities enabled for this app. */
  isEnabled(): Promise<boolean>;
}

const native: LiveActivityNativeModule | undefined = NativeModules.MeetingLiveActivityModule;

export function isLiveActivityAvailable(): boolean {
  return Platform.OS === 'ios' && native != null;
}

export async function startMeetingCountdown(meeting: {
  id: string;
  title: string;
  startISO: string;
}): Promise<void> {
  if (!native) {
    return;
  }
  try {
    await native.startCountdown({
      id: meeting.id,
      title: meeting.title || 'Meeting',
      startISO: meeting.startISO,
    });
  } catch {
    // Best-effort — the alarm still fires even if the island countdown fails.
  }
}

export async function endMeetingCountdown(): Promise<void> {
  if (!native) {
    return;
  }
  try {
    await native.endAll();
  } catch {}
}
