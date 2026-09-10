# Cost Workbench Required Fields

Bounded validation correction requested from the comparison screenshot.
Status: approved by the user's "go".

Display a small Lucide Asterisk icon beside every mandatory field label,
with a Required tooltip and accessible required semantics. Show this indicator
before submission, not only after validation fails. Optional fields have no
mandatory icon. Preserve existing accessible field names used by tests.

The missing field in the screenshot is shared Additional credit (hours).
Crew A/B baseline credits are present; removed credit and hourly-rate override
are optional and must not be marked as missing.

On Calculate or Compare costs, validate required inputs for the active saved
calculator and each active crew before requesting server calculations. Mark
each empty required field with a conspicuous red outline/ring, aria-invalid and
an associated short field-level message; focus the first invalid input. Zero
is a valid supplied value, not a missing value. Clear a field's missing error
when supplied. Keep server validation authoritative for domain rules and retain
the existing stale-result protections. No database or calculator-math changes.

Reuse existing required-field definitions where available; avoid marking all
numeric inputs required. Use theme destructive tokens with sufficient visual
contrast and the local border-color override pattern required by shared CSS.

Validate through real UI Playwright: blank shared additional credit highlights
and focuses that field, missing Crew B baseline marks Crew B only, optional
fields remain neutral, zero passes required validation, filling the field clears
its error and permits the existing comparison. Also cover required standby
timestamps and pairing credit. Capture a new versioned screenshot in the same
run; run Gantt typecheck and UI standard gate. Preserve existing test coverage.

Implementation: `gantt/src/components/cost/cost-workbench.tsx`. Existing input
labels and server calculations are unchanged. Missing-field validation runs
before network requests; required icons and accessible invalid/error states use
the same active field metadata. Verification receipt:
`docs/test-cases/crew-recovery/cost-library-required-fields.md`.
