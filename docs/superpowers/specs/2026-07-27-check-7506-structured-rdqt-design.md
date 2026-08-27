# check-7506 structured R/D/Q/T contract

Date: 2026-07-27
Status: implemented upstream in `rule-engine-rs` (`c75b4d3` — feat: forward all 7503 and 7506 parameters)

## Problem

`rule7506` (`legality-recheck-core.mjs`) emits structured stdin:

```
R <TAB> bases <TAB> ranks <TAB> fleets <TAB> teams <TAB> Assignments
Q <TAB> crew <TAB> BASE|RANK|FLEET <TAB> value <TAB> eff_ord <TAB> exp_ord|-1
T <TAB> crew <TAB> team
D <TAB> crew <TAB> duty <TAB> start_secs <TAB> end_secs <TAB> offset_min
```

An older `check-7506` only accepted legacy flat rows
`crew\tduty\tstart\tend\toffset` plus CLI `--checked-groups`. Structured lines
were skipped → scenario 679 stored **0** 7506 violations (e.g. crew 379 SIM+FLY
same YVR local day with `Assignments=FLY|SIM`).

## Resolution

`rule-engine-rs` `check-7506` now auto-detects R/D/Q/T input, reads Assignments
from the `R` row, scopes crews via `Q`/`T`, and keeps legacy flat TSV for
`check-7506-checkin.mjs`.

Parent note: `rule7506` forwards all D rows; the binary filters by
`R.Assignments` (comment in `legality-recheck-core.mjs` aligned).

## Ops follow-up

Rebuild/deploy release `check-7506` on SIT, then re-run scenario 679 legality so
crew 379's SIM+FLY day persists as a 7506 finding.
