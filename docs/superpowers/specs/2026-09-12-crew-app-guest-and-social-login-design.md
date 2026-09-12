# Crew App — Guest Login + Social Sign-In (Google / Apple / Facebook)

Date: 2026-09-12 · Owner: Ryan (product) · Module: `crew-app/` (React Native, `royce-travel-rn`)
Status: approved design, implementation in progress

## Problem

Today the crew app can only be entered through an airline crew portal: `auth.loggedIn`
is set exclusively by a portal login (`Capture` for TG/PR, `EkRoster` for EK/F8/ET),
and `sessionStore` persists the roster credentials in the Keychain. A person who is not
a crew member of a wired airline — a visitor, a new joiner whose national carrier is not
integrated, or a crew member evaluating the app — cannot open it at all, and therefore
cannot use the parts of the product that do not depend on a roster.

## Demand (Ryan, 2026-09-12)

1. On the login page, below the current **Log in** button, add an **Or** separator and
   **Login as Guest**. Reference crop: purple *Log in* button → `Or` → three brand marks.
2. Support sign-in with **Google**, **Apple**, or **Facebook**.
3. The user name obtained from Google/Apple/Facebook appears on the **Profile** page.
4. Guest login **skips the airline login and the roster pull**, but every other feature
   (iOS Calendar sync, alarms, meetings, time zone, Explore, R'Bot) still works.

Decisions confirmed by Ryan (all "recommended" options):

- **1a** — ship the login UI + provider layer now; real native sign-in lands when the
  credentials are provisioned (see *Provisioning* below). No unverifiable pods in the build.
- **2a** — a guest/social session honours the existing **Keep me logged in** checkbox.
- **3a** — the guest Profile carries a **Sign in with your airline** row (plus a Home hint)
  that returns the crew to the airline login. No backend change.

## Design

### Session model

`authSlice` gains an explicit session mode and identity facts:

```ts
type AuthMode = 'crew' | 'guest';
type IdentityProvider = 'guest' | 'google' | 'apple' | 'facebook';

mode: AuthMode;                    // 'crew' = portal session (today's behaviour)
provider: IdentityProvider | null; // how the session was established
displayName: string | null;        // from the identity provider, else 'Guest'
email: string | null;              // provider-granted only
photoUrl: string | null;           // provider-granted only
```

A guest session is a **normal logged-in session** (`loggedIn: true`, `mode: 'guest'`),
so `RootNavigator` needs no change and every device/store-backed feature keeps working.
It simply never passes through `Capture`/`EkRoster` and never sets a roster.

`sessionStore` persists identity sessions in AsyncStorage **without** the Keychain
(there is no password); the crew path is unchanged. `clearSession()` clears both.

### Login page (mirrors Ryan's reference crop)

```
[         Login As Crew        ]     ← renamed from "Log in" (Ryan 2026-09-12)
──────────────  Or  ───────────
      (G)      ()      (f)            ← Google · Apple · Facebook, brand marks only
[        Login as Guest       ]      ← the SAME button as Login As Crew
```

The three brand marks are third-party logos (the one place a multicolour glyph is
legitimate); everything else stays Altair-sage + neutrals with the single accent.

Review round 2 (Ryan, 2026-09-12, after seeing it on the simulator):

1. The crew button reads **Login As Crew** — the old "Log in" did not say what it
   signed you in to, next to a guest path that is a different kind of entry.
2. **Login as Guest wears the crew button itself** (`styles.loginBtn`), not a
   smaller outlined look: one fill, one radius, one height, one label weight, so
   the pair cannot drift and the two entries read as equals. A test asserts the
   resolved styles match.
3. The helper line under the guest button is **removed** — the empty roster states
   and the Profile's "Sign in with your airline" row already explain the mode.

### Social providers

`socialAuth.ts` is the only place that knows about Google/Apple/Facebook:

- `providerStatus(provider)` → `{ configured: boolean; missing: string[] }`, read from
  native configuration (`Info.plist` / `NativeModules.SettingsManager.settings`), never
  from a hardcoded secret.
- `signInWith(provider)` → `IdentityProfile` when the SDK + credentials are present;
  otherwise throws `SocialAuthUnavailableError` naming exactly what is missing. **No
  simulated success** — a tapped button that cannot work says so.

The login button surfaces that message verbatim.

### Guest-aware surfaces

| Surface | Guest behaviour |
|---|---|
| Home | existing empty-trip placeholder + one "Browsing as a guest" strip with a link to the airline login |
| Schedule | existing empty-month placeholder |
| Profile | identity name + provider chip ("Guest" / "Google" / …) instead of the crew row; **Sign in with your airline** row |
| Personal Information | identity block (name · email · provider) instead of Airline · Crew ID · Base |
| Alarms / Meetings / Time zone / Explore / R'Bot | unchanged — they run off the device and the store |

## Provisioning (blocks only real social sign-in)

| Provider | Needs from Ryan | SDK to add when it lands |
|---|---|---|
| Google | iOS OAuth **client ID** + reversed-client-ID URL scheme | `@react-native-google-signin/google-signin` |
| Apple | Apple Developer team with the *Sign in with Apple* capability on the app ID | `@invertase/react-native-apple-authentication` |
| Facebook | **App ID** + `fb<appid>` URL scheme (Limited Login for iOS) | `react-native-fbsdk-next` |

Apple sign-in cannot be fully exercised on a simulator (needs a device/sandbox Apple ID);
that proof will be a device run.

## Verification

- Jest: login block renders (Or + guest + 3 providers); guest login sets a guest session
  and pulls **no** roster; guest session restores from storage; identity name reaches the
  Profile; an unconfigured provider explains itself instead of faking success.
- `npx tsc --noEmit`.
- iOS simulator: login page → Login as Guest → Home → Profile, plus the airline path
  still working for a real crew (no PR/TG mixing), with versioned screenshots under
  `docs/assets/screenshots/crew-app/`.

## Out of scope

Linking a social identity to a crew record by email (needs live-server work), and the
native SDK installation itself (awaiting credentials).
