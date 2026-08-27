# Login Mockup Password Hint Removal Design

## Goal

Remove the bottom credential disclosure hint from the login mockup snapshot pages so no mockup displays a test password such as `Our2027` or other sample passwords.

## Scope

- `docs/mockups/login/login-mockup-v2.html`
- `docs/mockups/login/login-mockup-v3.html`
- `docs/mockups/login/login-mockup-v4.html`
- `docs/mockups/login/login-mockups.html` if it contains the same rendered hint

This change is limited to mockup/demo HTML under `docs/mockups/login/`. It does not change runtime app login pages, backend auth, or E2E credentials.

## Chosen Approach

Use the broader cleanup:

1. Remove the credential hint from all login mockup variants.
2. Ensure the v4-style snapshot page is included in that cleanup.

This avoids leaving older mockups with exposed sample passwords and keeps all login snapshot variants aligned.

## UI Behavior

- Delete the bottom hint block that exposes test usernames/passwords.
- Keep the divider and overall panel layout intact unless a file needs a small spacing adjustment after hint removal.
- Do not replace the removed password hint with another credential disclosure.

## Verification

- Search `docs/mockups/login/` for `Our2027`, `Test password`, `pw:`, and `password:` to confirm no login mockup still exposes sample credentials.
- Visually inspect the edited mockup HTML snippets to confirm the panel structure remains coherent.

## Risks

- Some mockup variants may use slightly different hint wording, so cleanup must be text-pattern based plus direct file inspection.
- `login-mockups.html` may aggregate variants; if it renders the same hint, it must be updated too.
