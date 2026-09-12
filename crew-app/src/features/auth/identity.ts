// Identity sessions that are NOT an airline crew-portal login (doc/App Flow Ver1).
//
// Two ways in without an airline portal:
//   guest    — anonymous; the crew id / roster stay empty.
//   social   — Google / Apple / Facebook; carries the person's name (and the
//              email/photo when the provider grants them) so Profile has a face.
//
// Both are ordinary logged-in sessions: `mode` is the only thing the rest of the
// app keys off, so every feature that runs off the device or the store (alarms,
// meetings/calendar, time zone, Explore, R'Bot) works unchanged, while the
// roster-backed surfaces stay empty.

export type AuthMode = 'crew' | 'guest';

/** How the current session was established. `guest` is the anonymous path. */
export type IdentityProvider = 'guest' | 'google' | 'apple' | 'facebook';

/** The providers offered on the login page, in the order they are shown. */
export const SOCIAL_PROVIDERS = ['google', 'apple', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<IdentityProvider, string> = {
  guest: 'Guest',
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
};

/** What a provider hands back after a successful sign-in. */
export interface IdentityProfile {
  provider: SocialProvider;
  /** Human name as the provider reports it ("Ryan Lim"). */
  displayName: string;
  email: string | null;
  photoUrl: string | null;
}

/** True when the session has no airline roster behind it. */
export function isGuestMode(mode: AuthMode | null | undefined): boolean {
  return mode === 'guest';
}

/** The name to show for a session: the provider's name, else "Guest". */
export function sessionDisplayName(
  displayName: string | null | undefined,
  provider: IdentityProvider | null | undefined,
): string {
  const name = displayName?.trim();
  if (name) {
    return name;
  }
  return provider ? PROVIDER_LABELS[provider] : 'Guest';
}
