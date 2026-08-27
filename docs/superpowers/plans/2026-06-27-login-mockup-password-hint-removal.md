# Login Mockup Password Hint Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

- [ ] **Goal:** Remove login credential disclosure hints from all login mockup HTML variants under `docs/mockups/login/`.
- [ ] **Architecture:** Apply surgical HTML-only edits to the mockup files that render login hint copy, removing the hint block while preserving the surrounding divider and layout. Verify by direct text search across the mockup directory after edits.
- [ ] **Tech Stack:** Static HTML, inline CSS

## Global Constraints

- Scope only `docs/mockups/login/*`.
- Do not change runtime app login pages, backend auth, or E2E credentials.
- Remove any credential disclosure block from login mockups.
- Preserve overall panel layout unless a small spacing adjustment is required.

---

### Task 1: Remove Mockup Credential Hints

**Files:**
- Modify: `docs/mockups/login/login-mockup-v2.html`
- Modify: `docs/mockups/login/login-mockup-v3.html`
- Modify: `docs/mockups/login/login-mockup-v4.html`
- Modify: `docs/mockups/login/login-mockups.html`

**Interfaces:**
- Consumes: existing login mockup HTML structures
- Produces: login mockups with no visible test-account or password-hint block

- [ ] **Step 1: Inspect the hint blocks**

```html
<div class="divider"></div>
<div class="hint">
  Test accounts: <span>admin</span> / <span>user01</span> &mdash; password: <span>123456</span>
</div>
```

- [ ] **Step 2: Remove the hint block and keep the divider/layout**

```html
<div class="divider"></div>
```

- [ ] **Step 3: Verify no login mockup still exposes a credential hint**
Run:

```bash
rg -n 'Test accounts|Test:|Test password|pw:|password: <span>|Our2027' docs/mockups/login/*.html
```

Expected: no matches

- [ ] **Step 4: Commit**

```bash
git add docs/mockups/login/login-mockup-v2.html \
  docs/mockups/login/login-mockup-v3.html \
  docs/mockups/login/login-mockup-v4.html \
  docs/mockups/login/login-mockups.html \
  docs/superpowers/specs/2026-06-27-login-mockup-password-hint-removal-design.md \
  docs/superpowers/plans/2026-06-27-login-mockup-password-hint-removal.md
git commit -m "docs: remove login mockup password hints"
```
