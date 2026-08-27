# Rule 7503/7506 Full Parameter Forwarding Implementation Plan

1. Add focused PBS parser tests for 7503/7506 structured rows, formal
   `Crew Teams`, scalar fallback fields, and no legacy `Teams` compatibility
   for 7503.
2. Add focused PBS builder tests proving `wocl_rules` and
   `one_checkin_rules` are forwarded into PyO3.
3. Add focused PyO3 tests for structured-row precedence over scalar fields,
   qualification/team scope matching, missing crew-team context, and 7506
   assignment-code matching when assignment group differs.
4. Parse 7503/7506 rows into native structured kwargs in
   `rule_params.py`, preserving scalar fields only as empty-structured-list
   fallback.
5. Add PyO3 `wocl_rules` and `one_checkin_rules` constructor fields, scoped
   matching using 7504-style qualification/team semantics, structured-row
   precedence, and scalar fallback.
6. Run focused PBS/PyO3 tests, Rust build checks, whitespace checks, and report
   unavailable or pre-existing environment checks explicitly.
