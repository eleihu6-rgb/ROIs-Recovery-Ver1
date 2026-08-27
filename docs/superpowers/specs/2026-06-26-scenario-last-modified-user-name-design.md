# Scenario Last Modified User Name Design

## Problem

The Scenario sidebar metadata line shows `system` for modified-by in cases where the user expects the real login user name. The frontend already prefers `updatedByName` and falls back to `updatedBy`, so the visible `system` value indicates the backend audit field is being written as `system`.

## Decision

The metadata line should represent the last authenticated user who modified the scenario. Scenario create, update, duplicate, and status transition routes must derive the audit username from the authenticated JWT payload (`request.authUser.userCode`) instead of trusting an optional request body `username` or defaulting normal user actions to `system`.

## Scope

- Backend: update Scenario write routes to use authenticated user code for audit fields.
- Frontend: keep the existing display behavior: show `updatedByName` when the list API can join to `users.user_name`, otherwise fall back to `updatedBy`.
- Tests: add or update focused backend tests proving Scenario write routes pass the authenticated user to the service. Existing frontend list item tests already cover name display when `updatedByName` exists.

## Non-Goals

- Do not backfill old rows already written with `system`.
- Do not change the Scenario list layout.
- Do not replace service-level audit helpers or add a new audit framework.

## Verification

- Run focused Scenario route/service tests.
- Run TypeScript checks for touched modules.
- If a UI server is available, verify the Scenario list shows a real user name after a user-driven create/update/duplicate/status change.
