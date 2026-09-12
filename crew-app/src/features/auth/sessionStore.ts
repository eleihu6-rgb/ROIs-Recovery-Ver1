import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  discardEkRosterSnapshot,
  loadEkRosterSavedSession,
} from './ekRosterSnapshot';
import type { AuthMode, IdentityProvider } from './identity';

// Persistence for the crew login session (doc/App Flow Ver1, "Keep Login").
// The password is stored in the device Keychain (secure); the airline + crew id
// + the keep-login flag live in AsyncStorage.
//
// A guest / social session (mode 'guest') has NO password and NO crew id, so it
// persists entirely in AsyncStorage: the mode flag plus the identity block the
// provider handed back (name/email/photo — none of them secret).

const K_AIRLINE = '@royce_airline';
const K_CREW = '@royce_crewId';
const K_KEEP = '@royce_keepLogin';
const K_MODE = '@royce_auth_mode';
const K_IDENTITY = '@royce_identity';
const KEYCHAIN_SERVICE = 'com.royce.crewportal';

export interface SavedSession {
  airline: string;
  /** Roster-resolved carrier (EK for crew K1003); absent for TG/PR sessions. */
  carrier?: string | null;
  crewId: string;
  password: string;
  keepLogin: boolean;
  /** 'crew' (absent = a record written before identity sessions existed) or the
   *  guest / social path that never touches an airline portal. */
  mode?: AuthMode;
  provider?: IdentityProvider | null;
  displayName?: string | null;
  email?: string | null;
  photoUrl?: string | null;
}

export async function saveSession(s: SavedSession): Promise<void> {
  if (!s.keepLogin) {
    await clearSession();
    return;
  }
  if (s.mode === 'guest') {
    await saveIdentitySession(s);
    return;
  }
  // A crew login owns the device session: drop any guest/social block so the
  // next launch cannot come back as the previous visitor.
  await clearIdentitySession();
  try {
    await AsyncStorage.multiSet([
      [K_AIRLINE, s.airline],
      [K_CREW, s.crewId],
      [K_KEEP, 'true'],
    ]);
    await Keychain.setGenericPassword(s.crewId, s.password, { service: KEYCHAIN_SERVICE });
  } catch {
    // Non-fatal: a failed persist just means the crew logs in again next time.
  }
}

async function saveIdentitySession(s: SavedSession): Promise<void> {
  try {
    // Write the session FIRST. The cleanup below is hygiene, not the payload, and
    // on real devices it can fail on its own (an iOS Keychain call can refuse
    // with "a required entitlement isn't present" — observed on an iOS 26
    // simulator). Doing the cleanup first meant one such failure silently threw
    // the whole guest session away, so the next launch asked for login again.
    await AsyncStorage.multiSet([
      [K_MODE, 'guest'],
      [
        K_IDENTITY,
        JSON.stringify({
          provider: s.provider ?? 'guest',
          displayName: s.displayName ?? null,
          email: s.email ?? null,
          photoUrl: s.photoUrl ?? null,
        }),
      ],
    ]);
  } catch (e) {
    // Non-fatal: a failed persist just means the visitor logs in again next time.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[sessionStore] guest session persist failed', e);
    }
    return;
  }
  // The guest path owns the session now: drop the crew record AND the EK roster
  // snapshot, which is otherwise restored ahead of everything else and would
  // silently sign the next launch back in as the previous crew. Best-effort —
  // none of it may take the guest session down with it.
  try {
    await AsyncStorage.multiRemove([K_AIRLINE, K_CREW, K_KEEP]);
  } catch {
    // ignore
  }
  try {
    await discardEkRosterSnapshot();
  } catch {
    // ignore
  }
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // A stale crew credential is harmless: the crew path also requires its
    // @royce_keepLogin flag, which the multiRemove above has just cleared.
  }
}

async function clearIdentitySession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([K_MODE, K_IDENTITY]);
  } catch {
    // ignore
  }
}

/** Parse the stored identity block; anything malformed means "no session". */
async function loadIdentitySession(): Promise<SavedSession | null> {
  const mode = await AsyncStorage.getItem(K_MODE);
  if (mode !== 'guest') {
    return null;
  }
  let provider: IdentityProvider = 'guest';
  let displayName: string | null = null;
  let email: string | null = null;
  let photoUrl: string | null = null;
  try {
    const raw = await AsyncStorage.getItem(K_IDENTITY);
    const value = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (typeof value.provider === 'string') {
      provider = value.provider as IdentityProvider;
    }
    displayName = typeof value.displayName === 'string' ? value.displayName : null;
    email = typeof value.email === 'string' ? value.email : null;
    photoUrl = typeof value.photoUrl === 'string' ? value.photoUrl : null;
  } catch {
    // Keep the anonymous guest session rather than dropping the login.
  }
  return {
    // A guest belongs to no airline (empty code renders our own Altair mark).
    airline: '',
    crewId: '',
    password: '',
    keepLogin: true,
    mode: 'guest',
    provider,
    displayName,
    email,
    photoUrl,
  };
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    // An identity session wins over the roster stores — it is the most recent
    // login and it deliberately removed the crew record when it was written.
    const identity = await loadIdentitySession();
    if (identity) {
      return identity;
    }
    const ekSession = await loadEkRosterSavedSession();
    if (ekSession) {
      return ekSession;
    }
    const [[, airline], [, crewId], [, keep]] = await AsyncStorage.multiGet([
      K_AIRLINE,
      K_CREW,
      K_KEEP,
    ]);
    if (keep !== 'true' || !crewId) {
      return null;
    }
    const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!creds) {
      return null;
    }
    return {
      airline: airline || 'TG',
      crewId,
      password: creds.password,
      keepLogin: true,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await discardEkRosterSnapshot();
  } catch {
    // EK snapshot cleanup is independent from the legacy TG/PR session keys.
  }
  try {
    await AsyncStorage.multiRemove([K_AIRLINE, K_CREW, K_KEEP]);
  } catch {
    // ignore
  }
  // Best-effort: a Keychain that refuses (missing entitlement) must not reject
  // the logout — the stored session is already gone by this point.
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // ignore
  }
  await clearIdentitySession();
}
