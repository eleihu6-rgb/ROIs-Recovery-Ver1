# Crew App — Real Google / Apple / Facebook sign-in (provisioning + wiring)

Date: 2026-09-12 · Module: `crew-app/` (React Native, `royce-travel-rn`)
State: **UI + session plumbing shipped and pushed; the three providers are NOT
provisioned, so no real social sign-in works yet.** Guest login does work
end-to-end and is independent of everything below.
Shipped in: commit `2a6ce5e` on `main` (pushed, pre-push UI gate PASS).
Design: `docs/superpowers/specs/2026-09-12-crew-app-guest-and-social-login-design.md`
Context: `docs/dev-context/2026-09-12-rois-ai-crew-app-guest-social-login.md`

---

## 0. The ask, in one line

Ryan must hand over three sets of credentials from the provider consoles; a
developer then adds three pods, wires the callbacks, and swaps the placeholder
bridge calls for the packages' JS APIs. Everything else already exists.

## 1. What is already shipped (do not rebuild this)

| Piece | Where | What it does today |
| --- | --- | --- |
| Login block | `src/features/auth/LoginScreen.tsx` | `Login As Crew` → `Or` divider → Google/Apple/Facebook marks → `Login as Guest` (guest wears the same button style as the crew login) |
| Provider layer | `src/features/auth/socialAuth.ts` | The only module that knows the providers. `providerMissing()` / `isProviderConfigured()` / `signInWith()` / `isSocialAuthCancel()`; throws `SocialAuthUnavailableError` naming what is missing — **never fakes a success** |
| Session model | `src/features/auth/authSlice.ts` | `mode: 'crew' \| 'guest'`, `provider`, `displayName`, `email`, `photoUrl`; `loginAsGuest`, `loginWithIdentity`, `selectIsGuest` |
| Persistence | `src/features/auth/sessionStore.ts` | Identity sessions live in AsyncStorage (no password ⇒ no Keychain). Session is written first; hygiene (crew keys, EK snapshot, Keychain) is best-effort |
| Brand marks | `src/features/auth/ProviderGlyph.tsx` | Google (4-colour G), Apple (black), Facebook (blue disc) — the one sanctioned exception to the app's outline-icon rule |
| Profile surfaces | `src/features/v2/{ProfileScreen,PersonalInfoScreen}.tsx` | Show the provider name/email/chip; a guest gets "Sign in with your airline" |
| Tests | `__tests__/features/guestLogin.test.tsx` (11) | Includes the unprovisioned-provider message and the Keychain-refusal regression |
| Sim flow | `.maestro/guest_login.yaml` | Guest entry → Home → Profile → Personal information |

Current user-visible behaviour of a social tap: an alert —
*"Google sign-in is not set up in this build yet (needs GoogleIosClientId + RNGoogleSignin)."*
That is deliberate (`§No-Illusion`): no simulated identity, no fake session.

## 2. What Ryan has to provide

**Bundle-ID trap first:** this app signs with two different bundle identifiers,
and Google/Facebook credentials are bound to the bundle id.

- simulator/dev: `org.reactjs.native.example.RoyceTravelTemplate`
- device/release: `com.eleihuus.roycetravel`
  (`PRODUCT_BUNDLE_IDENTIFIER[sdk=iphoneos*]`, `ios/RoyceTravelTemplate.xcodeproj/project.pbxproj:526`)

So Google needs **one iOS client ID per bundle id** (or one per build config),
and both reversed-client URL schemes must be registered.

| # | Value needed | Where it comes from | Where it lands |
| --- | --- | --- | --- |
| 1 | Google **iOS client ID** for each bundle id (+ the reversed form `com.googleusercontent.apps.<id>`) | Google Cloud Console → Credentials → OAuth client ID → iOS | `Info.plist` key `GoogleIosClientId` (see §3) + reversed scheme appended to the existing `CFBundleURLTypes` |
| 2 | Google **web client ID** (server client) | same console → OAuth client ID → Web | `GoogleSignin.configure({ webClientId })` — needed only if we later verify the ID token server-side (§6.1) |
| 3 | Facebook **App ID** + **Client Token** | developers.facebook.com → App → Settings → Basic | `Info.plist` keys `FacebookAppID` (read by our layer as `FacebookAppId`) / `FacebookClientToken`; `fb<appid>` added to `CFBundleURLTypes`; `LSApplicationQueriesSchemes` entries |
| 4 | Facebook **login flavour**: Limited Login (iOS 14+/ATT) or classic | product decision | changes the SDK call and whether we read a JWT (`AuthenticationToken`) or `Profile.getCurrentProfile()` |
| 5 | Apple: **Team ID** with *Sign in with Apple* enabled on the app id (both bundle ids) | Apple Developer portal → Identifiers → Sign in with Apple | Xcode capability + `*.entitlements`; **no key in Info.plist** |
| 6 | A **physical device + sandbox Apple ID** for the Apple proof | — | Apple sign-in cannot be validated on a simulator (§6.3) |

## 3. Where the config is read (already wired)

`socialAuth.ts` reads provider config from `NativeModules.SettingsManager.settings`,
i.e. **Info.plist** — the same channel the app already uses for its roster URLs:

`crew-app/ios/RoyceTravelTemplate/Info.plist` already contains

```xml
<key>EKRosterApiBaseURL</key><string>$(EK_ROSTER_API_BASE_URL)</string>
<key>F8RosterApiBaseURL</key><string>$(F8_ROSTER_API_BASE_URL)</string>
```

so the established pattern for per-build values is an Info.plist key fed by an
xcconfig variable. Add, the same way:

```xml
<key>GoogleIosClientId</key><string>$(GOOGLE_IOS_CLIENT_ID)</string>
<key>FacebookAppId</key><string>$(FACEBOOK_APP_ID)</string>
```

Do **not** invent a second config mechanism. A missing/empty value is exactly
what makes the button say "not set up", so the key names in the alert
(`GoogleIosClientId`, `FacebookAppId`, `RNGoogleSignin`, `RNAppleAuthentication`,
`FBLoginManager`) are the diagnostic — keep them accurate if you rename anything.

## 4. Implementation plan

### Phase A — native dependencies

```bash
cd crew-app
npm i @react-native-google-signin/google-signin @invertase/react-native-apple-authentication react-native-fbsdk-next
cd ios && pod install && cd ..
```

Reference: Google Sign-In for iOS needs iOS 12+, Apple sign-in iOS 13+; this app
is on `platform :ios, min_ios_version_supported` (`ios/Podfile:8`). Google needs
an Xcode *Run Script* phase for the `-ObjC` linker flag only if you see undefined
symbols.

### Phase B — iOS configuration (three separate things)

1. **URL schemes.** `Info.plist` already has a `CFBundleURLTypes` array (it
   carries `comgooglemaps` today). Append the Google reversed-client-ID scheme
   and the Facebook `fb<appid>` scheme to that array — do not replace it.
2. **AppDelegate callback.** `ios/RoyceTravelTemplate/AppDelegate.mm` has **zero**
   `openURL` handlers today (verified: `grep -c openURL` → `0`), so Google and
   Facebook cannot complete the round trip until one is added:

   ```objc
   - (BOOL)application:(UIApplication *)app openURL:(NSURL *)url
               options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options {
     return [RCTLinkingManager application:app openURL:url options:options];
   }
   ```

   plus the Facebook SDK handler if `react-native-fbsdk-next` asks for it. Apple's
   sheet is in-process and needs no URL handling.
3. **Requested capabilities.** Add *Sign in with Apple* in Xcode for the app
   target (writes `*.entitlements`); this requires the paid team from §2 row 5.

### Phase C — swap the placeholder bridge calls for the packages' JS APIs

`socialAuth.ts` currently calls raw native modules by name
(`ADAPTERS[provider].nativeModule/nativeMethod`). Those strings were written
**without the pods installed and are unverified** — treat them as a seam, not as
truth. The safe shape when the SDKs land is to call each package's JS API inside
`signInWith()` and leave the `toProfile` mappers alone:

| provider | call instead of the raw bridge | notes |
| --- | --- | --- |
| google | `GoogleSignin.configure({ iosClientId }); const r = await GoogleSignin.signIn();` | `configure()` **must** run before `signIn()` (module init or app bootstrap, not the button handler). Modern versions return `{ type: 'success', data: { user } }`; the mapper already accepts `result.user ?? result.data.user` |
| apple | `await appleAuth.performRequest({ requestedOperation: appleAuth.Operation.LOGIN })` | mapper accepts `{ fullName: { givenName, familyName }, email }`. Apple returns `fullName` **only on the very first authorisation** for that Apple ID — later sign-ins legitimately fall back to email or "Apple user"; do not treat that as a bug |
| facebook | `const r = await LoginManager.logInWithPermissions(['public_profile','email'])` then `await Profile.getCurrentProfile()` (or the Limited Login token if §2 row 4 says so) | mapper accepts `{ profile }` or a flat `{ name, email, picture }` |

Keep `providerMissing()` honest: if you switch to a package JS API, the
"missing" signal must still fire when the package or the client id is absent, or
the login page will claim a capability the build does not have.

### Phase D — tests and verification

Add to `__tests__/features/guestLogin.test.tsx` (or a sibling `socialAuth.test.ts`)
with the native module mocked:

1. success → `signInWith` returns the mapped profile and the Profile page shows
   the provider name (`profile-crew-name`) and email (`profile-crew-meta`);
2. each provider's **cancel** code → `isSocialAuthCancel` is true and no alert is
   raised (no dead-end pop-up when the crew dismisses the sheet);
3. missing config → `SocialAuthUnavailableError` and `auth.loggedIn` stays false.

Then run the module's mandatory gates — see §5.

## 5. Definition of done

```bash
cd crew-app
# bump APP_VERSION by 1 in src/version.ts FIRST (module rule: every code change)
npx tsc --noEmit                       # must be clean
npx jest                               # all suites; new provider tests included
maestro test .maestro/guest_login.yaml # guest path must not regress
maestro test .maestro/et_login.yaml    # real airline path must not regress
maestro test .maestro/pr_sched_roster_views.yaml   # second carrier, no mixing
```

A real social sign-in additionally needs **one Maestro/simulator run per
provider** that taps the button, completes the sheet, and asserts the name on
Profile — plus a **device run for Apple** (§6.3). Capture a screenshot from that
same run into
`docs/assets/screenshots/crew-app/crew-app-social-login-Ver<N>-<provider>.png`
(version-suffix on every re-validation; never overwrite). Then update the spec
and save context with `./save-context.sh rois-ai crew-app-social-login`.

## 6. Risks and gotchas

### 6.1 Nobody verifies the identity (the real one to think about)

`signInWith()` trusts whatever the SDK returns **on the device** and stores the
name/email in plain AsyncStorage. There is no token verification and no backend
session, and a "social" session today grants exactly the same access as
anonymous *guest* — i.e. no roster, no crew data. That is fine while the identity
is cosmetic (Profile display). **The moment a social identity gates anything
real** — crew data, a roster link, an absence submission — the ID token must be
verified server-side (`webClientId` audience for Google, Apple's public keys,
Facebook's token debugger) and turned into a server session. Do not skip this by
trusting the client payload.

### 6.2 Google/Facebook cannot be done in a WebView

Google blocks OAuth in embedded webviews (`disallowed_useragent`), Apple requires
native `ASAuthorization`, Facebook restricts embedded logins. The app already
ships `react-native-webview` for the ROIS portal capture — that path must NOT be
reused for social sign-in.

### 6.3 Apple cannot be finished on a simulator

Needs a physical device + sandbox Apple ID, and the capability from §2 row 5.
Plan the proof accordingly; do not mark Apple "verified" off a simulator run.

### 6.4 The iOS Keychain entitlement failure (already bit us once)

On an iOS 26 simulator the Keychain rejected calls with *"Internal error when a
required entitlement isn't present."* It silently destroyed a guest session
because the persist path cleared a stale credential **before** writing. The
pattern to keep: **write the payload first, hygiene best-effort afterwards**
(`src/features/auth/sessionStore.ts`). Facebook's SDK stores tokens in the
Keychain, so the same class of failure can surface in the social path — never
let it break the session, and prefer a device for token persistence.

### 6.5 Smaller ones

- Cancellation is not an error: the SDKs use different codes
  (`SIGN_IN_CANCELLED`, `ASAuthorizationErrorCanceled`, `1001`, `1002`…); extend
  `CANCEL_CODES` rather than showing an alert on a dismiss.
- Facebook Limited Login (iOS 14+) returns a JWT instead of a profile object —
  if the product wants it, the mapper needs the `AuthenticationToken` path.
- App Review: an app offering Google/Facebook sign-in must offer Apple too (App
  Store guideline 4.8). Shipping all three together is the safer route.
- A provider that is configured in the console but missing from the build (pod
  not installed) fails at `providerMissing()` with a clear message — that is the
  intended failure mode, not a bug.

## 7. Out of scope / decisions still open

1. **Linking a social identity to a crew record by email** so a social sign-in
   pulls a roster. Ryan chose "no backend" on 2026-09-12 (option 3a: Profile's
   *Sign in with your airline* row). Re-opening this is a live-server change and
   must go through the source-of-truth migration gate.
2. Whether a guest/social session should ever get roster-adjacent features
   (absence, check-in) — today those require a crew id and say so.
3. Whether social identities should survive **logout** — today `logout()` clears
   them with the rest of the session (`clearIdentitySession`).

## 8. Machine notes for the next session

- Verified on iPhone Air, iOS 26.5 (`50EBA799-7D94-4136-98BA-A24DEA041922`),
  Metro on 8081, live-server on 3000 (`scripts/live-server-supervisor.sh`).
- Before repeating a login flow: `xcrun simctl keychain <udid> reset` (the app's
  Keychain survives `clearState`).
- AsyncStorage on this app lands in
  `<app container>/Library/Application Support/org.reactjs.native.example.RoyceTravelTemplate/RCTAsyncLocalStorage_V1/manifest.json`
  — that file is the fastest way to prove a session persisted (the app's
  `Library/Preferences/*.plist` holds legacy leftovers and misled one
  investigation already).
- The image reference Ryan sent on 2026-09-12 13:28 was a macOS "SpringBoard quit
  unexpectedly" crash dialog, not a UI design; the 13:21 Snipaste crop is
  pixel-identical to the 13:11 one.
- **Nobody has visually reviewed the shipped screenshots yet** (this session's
  image input is disabled; they were checked by OCR + pixel geometry only):
  `docs/assets/screenshots/crew-app/crew-app-guest-login-Ver{1,2}-*.png`.
