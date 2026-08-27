# PBS Search Pairings UI Design

Date: 2026-04-23
Owner: Codex
Status: Draft for review

## 1. Background

Current `Pairing` page already acts as a `generic pairing rules editor`:

- `ADD PAIRING PROPERTIES` is used to configure generic pairing filters.
- `EXISTING PAIRING PROPERTIES` is used to show rules already added into the draft.
- `SEARCH PAIRINGS` is still a placeholder interaction and does **not** match AA / PRD semantics.

According to the PRD, `Search Pairings` is a dedicated module for browsing actual pairings released for the period, including:

- `Pairing ID` exact search
- pairing run-date visibility
- mini calendar display
- conflict prevention with planned absences
- a direct action to bid the searched properties

Reference:

- [PBS 智能排班竞标系统需求规格书.md:46](</Users/lei/Codehub/rois-ai/init-docs/PBS 智能排班竞标系统需求规格书.md:46>)
- [PBS 智能排班竞标系统需求规格书.md:68](</Users/lei/Codehub/rois-ai/init-docs/PBS 智能排班竞标系统需求规格书.md:68>)

This phase does **not** implement backend search yet. It only establishes the UI shell and routing structure so the page matches the intended AA-style workflow and is ready for real data hookup later.

## 2. Goal

Create a dedicated `Search Pairings` page in `pbs-portal`:

- clicking `SEARCH PAIRINGS` from the current `Pairing` page navigates to this page
- the new page uses the existing system shell and shared left workbench
- the right content area is rebuilt from the provided `demo.html / demo.css / common.css`
- the implementation is React + TypeScript + project conventions, not raw HTML copy-paste
- this phase uses mock/stub data only

## 3. Product Semantics

This direction is aligned with AA / PRD.

Why:

- `Search Pairings` is a dedicated pairing search module, not part of the generic property editor itself
- `ADD PAIRING PROPERTIES` remains the place to define generic rules
- `Search Pairings` becomes the separate view where users inspect matching pairings and eventually perform:
  - `Specific Bid`
  - generic rule result preview

This phase only implements the UI shell for that separate module.

## 4. Scope

### In scope

- Add a new `Search Pairings` route/page under the `Pairing` feature domain
- Change the current `SEARCH PAIRINGS` button behavior from fake local filter modal usage to page navigation
- Rebuild the provided demo as React UI on the right side of the shared workbench layout
- Keep the existing left-side `BIDDING CALENDAR` and shared layer context from the current system
- Use local mock/stub data for:
  - search criteria summary
  - result count
  - pairing result cards
  - mini calendar blocks
  - pagination

### Out of scope

- Real backend API integration
- Real query execution
- Real `Pairing ID` search behavior
- Planned absence conflict logic
- Real `Bid These Properties` write-back
- Real synchronization with current `ADD PAIRING PROPERTIES`
- Rebuilding left-side workbench to match the demo HTML

## 5. Route and Navigation

Recommended route:

- `/pairing/search`

Routing behavior:

- `SEARCH PAIRINGS` on `/pairing` navigates to `/pairing/search`
- page stays inside `SharedBiddingWorkbenchLayout`
- top navigation remains within the `Pairing` functional area

Reasoning:

- matches the user request for a full-page jump, not a modal
- better reflects AA’s dedicated search module
- provides clean separation between:
  - generic rule editor
  - pairing search / preview view

## 6. Page Structure

### Left side

Reuse current shared workbench content exactly:

- existing `BIDDING CALENDAR`
- existing layer state
- existing shared layout behavior

No demo-based reimplementation on the left side in this phase.

### Right side

Rebuild the demo into React sections:

1. `SEARCH CRITERIA` header block
2. criteria summary table/list
   - `PRIORITY`
   - `BID`
3. `SEARCH PAIRINGS` action row
4. result summary row
   - result count
   - `BID THESE PROPERTIES`
   - `ADD MORE SEARCH CRITERIA`
5. pairing result cards/list
   - pairing number
   - metadata rows
   - detail rows
   - mini month calendar
6. footer pagination area

## 7. UI Translation Rules

The demo files are source material for visual and structural intent, not direct implementation.

Implementation rules:

- do **not** keep generated `box_1`, `group_17` style class naming
- translate the page into meaningful React components and project naming
- prefer shared UI primitives already used in `pbs-portal`
- keep the visual hierarchy and spacing intent of the demo
- preserve current project look-and-feel where demo is obviously only a rough export

Recommended component split:

- `SearchPairingsPage`
- `SearchPairingsPanel`
- `SearchCriteriaSummary`
- `SearchPairingsToolbar`
- `PairingSearchResultCard`
- `PairingSearchMiniCalendar`
- `SearchPairingsPagination`

## 8. Data Strategy for This UI Phase

This phase is intentionally mock-driven.

The page should use local stub data shaped for the future real API:

- criteria summary items
- result summary
- result card collection
- mini calendar state
- pagination info

The UI should be structured so a future service layer can replace the local mock without reworking the component tree.

## 9. Interaction Rules for This Phase

Working interactions:

- clicking `SEARCH PAIRINGS` navigates to the new page
- local page controls can update local UI state
- pagination can be local-state driven
- `BID THESE PROPERTIES` and `ADD MORE SEARCH CRITERIA` can be UI-only buttons for now

Deferred interactions:

- real search request
- result filtering against actual rules
- write-back into specific layers
- specific bid creation from result cards

## 10. Constraints

- Must not break the current `Pairing` page generic rules editor
- Must not replace the existing shared left calendar with demo markup
- Must not introduce backend dependencies in this phase
- Must follow project React / TS / routing conventions
- Must include regression coverage for:
  - route rendering
  - button navigation
  - basic page UI render

## 11. Acceptance Criteria

- Clicking `SEARCH PAIRINGS` on `/pairing` opens the new `Search Pairings` page
- The page reuses the existing shared left-side workbench
- The right-side panel visually matches the provided demo structure closely enough for product review
- The page is implemented in React components, not static raw HTML
- The page renders from local mock/stub data
- No backend API is required for this phase
- Existing `Pairing` page behavior remains intact

## 12. Key Assumption Requiring Confirmation

For this first UI phase, the new `/pairing/search` page will **not yet consume the currently configured rules from the `/pairing` page**.

Instead:

- clicking `SEARCH PAIRINGS` only navigates to the new page
- the new page renders its own local mock criteria and mock results
- later, when pairing data and backend contracts are ready, we connect the page to real criteria input and real result data

This assumption keeps the first UI phase clean and low-risk, but it should be explicitly confirmed before implementation.
