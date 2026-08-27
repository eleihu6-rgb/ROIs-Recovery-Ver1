# Design: 7508 rest day coverage slack (60s)

**Date:** 2026-08-10  
**Status:** Approved (plan)  
**Scope:** `rule-engine-rs` `rest_covers_day` used by calendar-day SDFD (7508)

## Problem

7508 requires rest (DO/VAC/…) to cover a crew-base-local calendar day `[local_midnight, next_midnight)` before that day can count as SDFD. Airlines encode “full day” rest differently — e.g. end at `23:59:59` or `23:59:00`, or start at `00:01`. F8 DO rows often end one second before the next local midnight, so exact coverage failed and DO days were excluded while blank days with the same surrounding FLY still qualified.

## Decision

Allow up to **60 seconds** missing at the **start and/or end** of the local day in `rest_covers_day`. Mid-day holes are still rejected.

- Constant: `REST_DAY_COVER_SLACK_SECS = 60` in `src/rules/rule7508.rs`
- No DB / gantt DO timestamp rewrite
- No mid-day gap forgiveness (unlike expanding every interval by ±60s)
- Slack is not a `dictionary` / `param_json` business limit (engineering day-boundary tolerance)

## Non-goals

- Rule 7501 rolling-hour SDFD
- Parameterizing slack per airline until a second tolerance is required

## Success

DO shaped `[00:00, 23:59:59]` or `[00:01, next 00:00)` counts as a covering rest day; end short by 61s+ or a mid-day gap does not. Scenario 718 / crew 568 style 672 windows count DO-only days that previously failed the 1s gap.
