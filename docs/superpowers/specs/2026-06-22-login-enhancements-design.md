# Login Enhancements Design

**Date:** 2026-06-22  
**Status:** Approved  
**Scope:** `live-server` auth route + `gantt` login page + E2E tests

---

## Problem

1. Login is case-sensitive — `sameer` and `Sameer` are different users, causing confusion.
2. All auth failures return the same generic message ("Invalid user code or password"), giving no actionable feedback.
3. The login form UX lacks polish: no show/hide password, no error animation, no field focus flow.

---

## Goals

1. Case-insensitive username matching, across all clients (gantt, pbs-portal, mobile).
2. Distinct, human-readable error messages: user-not-found vs wrong-password.
3. Full UX polish pass on the gantt login page.

---

## Security Note

Returning different messages for "user not found" vs "wrong password" enables **user enumeration**. This is an acceptable tradeoff for an internal crew scheduling tool where accounts are provisioned centrally and the user base is known.

---

## Section 1 — Backend (`live-server/src/routes/auth/auth.ts`)

### 1.1 Case-insensitive lookup

Replace:
```ts
.where(eq(users.userCode, userCode))
```
With a Drizzle raw SQL expression:
```ts
.where(sql`LOWER(${users.userCode}) = LOWER(${userCode})`)
```

No schema change, no migration. Works for every client because the fix is in the data layer.

### 1.2 Distinct error messages

Both cases still return **HTTP 401**. The `message` field distinguishes them:

| Condition | HTTP | `message` |
|---|---|---|
| No matching user | 401 | `"User not found. Check your username and try again."` |
| User found, password wrong | 401 | `"Incorrect password. Please try again."` |

The frontend reads `message` verbatim and displays it — no extra error-code field needed.

---

## Section 2 — Auth store (`gantt/src/stores/auth-store.ts`)

The store already surfaces `err.message` as `error`. No logic change required — backend messages flow through the existing error path automatically.

One addition: the `error` field type stays `string | null`. The component clears it on user input (handled in the UI layer, not the store).

---

## Section 3 — Login page (`gantt/src/components/auth/login-page.tsx`)

### 3.1 Show/hide password toggle

- `Eye` / `EyeOff` icon button inset at the right of the password field.
- Toggles `type="password"` ↔ `type="text"`.
- Button: `absolute right-2.5`, icon `h-3.5 w-3.5 text-white/50 hover:text-white/80`.

### 3.2 Clear error on retype

- Both `onChange` handlers call a shared `clearError()` (sets `error` to `null` in local state overlay, or resets store error).
- Error disappears the instant the user starts typing — no stale red banner while they correct themselves.

### 3.3 Shake animation on error

- CSS `@keyframes login-shake` — horizontal micro-shake (3 cycles, ±4 px, 320 ms).
- Applied to the `<form>` via a key-driven class: increment a `shakeKey` counter each time a new error arrives; `key={shakeKey}` on the animated element forces React to remount the animation.

### 3.4 Card entrance animation

- The card `<div>` gets an inline style: `animation: loginCardIn 280ms ease-out both`.
- `@keyframes loginCardIn`: `from { opacity:0; transform: translateY(8px) }` → `to { opacity:1; transform: translateY(0) }`.
- One-shot on mount, does not repeat.

### 3.5 Button loading state

- During `loading`: button shows `Loader2` spinner + "Signing in…" text (already present).
- Add `animate-pulse` opacity cycling to the disabled button background for a shimmer feel.

### 3.6 Enter key focus flow

- In the username `<input>`, intercept `onKeyDown`: if `key === 'Enter'` and password field is empty, `preventDefault()` and `passwordRef.current?.focus()`.
- Normal form submission fires when password is non-empty (default Enter behaviour on a `<form>`).

### 3.7 Hint text update

Replace the current account hint that hard-codes `Ryan` with:
```
Usernames are not case-sensitive.
Test password: Our2027
```
Remove the `admin` mention (admin has a different password and is not a demo account).

---

## Section 4 — Testing

### 4.1 Backend unit tests (`live-server/src/routes/auth/auth.test.ts`)

| Test | Assertion |
|---|---|
| Login with `sameer` (lowercase) | 200 OK, returns token |
| Login with `SAMEER` (uppercase) | 200 OK, returns same user |
| Login with `Sameer` (PascalCase) | 200 OK |
| Non-existent user | 401, `message` contains "User not found" |
| Wrong password (existing user) | 401, `message` contains "Incorrect password" |

### 4.2 E2E (`e2e/tests/gantt/login-page-redesign.spec.ts`)

| Test | Assertion |
|---|---|
| `ryan` (lowercase) logs in | Reaches gantt shell, `sessionStorage` has `userCode` |
| Unknown user error | Error banner text contains "User not found" |
| Wrong password error | Error banner text contains "Incorrect password" |
| Show/hide toggle | Clicking eye icon changes `input[type]` from `password` → `text` → `password` |
| Error clears on retype | After failed login, typing clears the error banner |

---

## Files Changed

| File | Change |
|---|---|
| `live-server/src/routes/auth/auth.ts` | ILIKE lookup + distinct messages |
| `live-server/src/routes/auth/auth.test.ts` | New cases (case-insensitive + error message assertions) |
| `gantt/src/components/auth/login-page.tsx` | All UX enhancements (3.1–3.7) |
| `e2e/tests/gantt/login-page-redesign.spec.ts` | New regression cases |
