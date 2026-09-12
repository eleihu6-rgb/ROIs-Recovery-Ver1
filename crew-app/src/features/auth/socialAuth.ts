// Google / Apple / Facebook sign-in — the ONLY module that knows about the
// providers (mirrors how `airlines.ts` isolates the carrier-portal differences).
//
// A provider needs two things to work in a build:
//   1. its native SDK pod (exposed as a React Native native module), and
//   2. its client credentials, injected through the app's native settings the
//      same way `EKRosterApiBaseURL` / `F8RosterApiBaseURL` already are.
//
// Neither ships yet (Ryan, 2026-09-12: ship the UI + wiring now, add the SDKs at
// provisioning). So this module never fakes a sign-in: when a provider is not
// provisioned it throws SocialAuthUnavailableError naming exactly what is
// missing, and the login page shows that sentence to the person who tapped.
//
// See docs/superpowers/specs/2026-09-12-crew-app-guest-and-social-login-design.md
// for the provisioning checklist (client IDs, URL schemes, Apple capability).

import { NativeModules } from 'react-native';
import type { IdentityProfile, SocialProvider } from './identity';

/** Raised when the build has no SDK / credentials for the tapped provider. */
export class SocialAuthUnavailableError extends Error {
  readonly provider: SocialProvider;
  readonly missing: string[];

  constructor(provider: SocialProvider, missing: string[]) {
    super(
      `${labelFor(provider)} sign-in is not set up in this build yet ` +
        `(needs ${missing.join(' + ')}).`,
    );
    this.name = 'SocialAuthUnavailableError';
    this.provider = provider;
    this.missing = missing;
  }
}

interface ProviderAdapter {
  /** Human label for messages ("Google"). */
  label: string;
  /** Native-settings keys that must carry a value (e.g. the iOS client id). */
  configKeys: readonly string[];
  /** Native module the SDK registers, and the method that runs the flow. */
  nativeModule: string;
  nativeMethod: string;
  /** Map the SDK's success payload onto our profile. */
  toProfile: (result: unknown) => IdentityProfile;
}

function labelFor(provider: SocialProvider): string {
  return ADAPTERS[provider].label;
}

/** Native settings bag (Info.plist values surface here, as `airlines.ts` uses). */
function nativeSettings(): Record<string, unknown> {
  const settings = NativeModules.SettingsManager?.settings as
    | Record<string, unknown>
    | undefined;
  return settings ?? {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const found = text(value);
    if (found) {
      return found;
    }
  }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const ADAPTERS: Record<SocialProvider, ProviderAdapter> = {
  google: {
    label: 'Google',
    // Set from Info.plist (GoogleIosClientId = the iOS OAuth client id).
    configKeys: ['GoogleIosClientId'],
    nativeModule: 'RNGoogleSignin',
    nativeMethod: 'signIn',
    toProfile: result => {
      const user = record(record(result).user ?? record(result).data);
      const displayName = firstText(user.name, user.givenName);
      return {
        provider: 'google',
        displayName: displayName ?? firstText(user.email) ?? 'Google user',
        email: firstText(user.email),
        photoUrl: firstText(user.photo, user.picture),
      };
    },
  },
  apple: {
    label: 'Apple',
    // Apple needs no client id — only the "Sign in with Apple" capability on the
    // app id, which is why nothing is listed here.
    configKeys: [],
    nativeModule: 'RNAppleAuthentication',
    nativeMethod: 'signInWithApple',
    // Apple returns fullName ONLY on the very first authorisation for a user, so
    // every later sign-in legitimately falls back to the email (or "Apple user").
    toProfile: result => {
      const value = record(result);
      const fullName = record(value.fullName);
      const composed = [fullName.givenName, fullName.familyName]
        .map(part => text(part))
        .filter((part): part is string => part !== null)
        .join(' ');
      const displayName = firstText(composed, value.nickname, value.email);
      return {
        provider: 'apple',
        displayName: displayName ?? 'Apple user',
        email: firstText(value.email),
        photoUrl: null, // Apple never returns one.
      };
    },
  },
  facebook: {
    label: 'Facebook',
    // Set from Info.plist (FacebookAppId = the Facebook app id).
    configKeys: ['FacebookAppId'],
    nativeModule: 'FBLoginManager',
    nativeMethod: 'loginWithPermissions',
    toProfile: result => {
      const value = record(result);
      const profile = record(value.profile ?? value);
      const picture = record(record(profile.picture).data);
      const displayName = firstText(profile.name);
      return {
        provider: 'facebook',
        displayName: displayName ?? firstText(profile.email) ?? 'Facebook user',
        email: firstText(profile.email),
        photoUrl: firstText(picture.url, profile.picture),
      };
    },
  },
};

/** What this build is missing for `provider` ([] = ready to sign in). */
export function providerMissing(provider: SocialProvider): string[] {
  const adapter = ADAPTERS[provider];
  const missing = adapter.configKeys.filter(key => !text(nativeSettings()[key]));
  const module = NativeModules[adapter.nativeModule] as
    | Record<string, unknown>
    | undefined;
  if (!module || typeof module[adapter.nativeMethod] !== 'function') {
    missing.push(adapter.nativeModule);
  }
  return missing;
}

/** True when this build can actually run `provider`'s sign-in. */
export function isProviderConfigured(provider: SocialProvider): boolean {
  return providerMissing(provider).length === 0;
}

// Each SDK reports "the person dismissed the sheet" with its own code; a cancel
// is not an error worth a pop-up, so the caller checks this and stays silent.
const CANCEL_CODES = new Set([
  'SIGN_IN_CANCELLED',
  'CANCELED',
  'CANCELLED',
  '1001',
  'ASAuthorizationErrorCanceled',
]);

export function isSocialAuthCancel(error: unknown): boolean {
  const code = text(record(error).code);
  return code !== null && CANCEL_CODES.has(code);
}

/**
 * Run the provider's real sign-in flow and return the person's identity.
 * Throws SocialAuthUnavailableError when this build lacks the SDK/credentials,
 * and the provider's own error otherwise (cancellations included).
 */
export async function signInWith(provider: SocialProvider): Promise<IdentityProfile> {
  const missing = providerMissing(provider);
  if (missing.length) {
    throw new SocialAuthUnavailableError(provider, missing);
  }
  const adapter = ADAPTERS[provider];
  const module = NativeModules[adapter.nativeModule] as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  const result = await module[adapter.nativeMethod]();
  return adapter.toProfile(result);
}
