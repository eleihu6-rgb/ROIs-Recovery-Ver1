# Ver 2 source checks

Read-only source review on 2026-09-14. A supporting agent located the patterns; the primary agent inspected the relevant Rust fields, applicability validator, parameter table, severity labels and confirmation dialog before using the findings.

| Topic | Source | Confirmed behavior / design consequence |
|---|---|---|
| Rule 8056 scope | `rule-engine-rs/src/lib.rs::Rule8056Rule` | Bases, ranks, fleets, teams are explicit fields; use this applicability pattern, not spacing logic, for the new roster rule. |
| Parameter table | `gantt/src/components/legality/legality-param-table.tsx` | Header + rows, applicability tint, horizontal scrolling for wide rules, UI-only row number. |
| Mandatory scope | `gantt/src/utils/param-format.ts` | Applicability values cannot be empty; `*` means all. Ver 2 extends the explicit envelope consistently to authored roster rules. |
| Enforcement labels | `gantt/src/utils/severity-labels.ts` | Soft=1/INFO, Overridable=2/WARNING, Hard=3/ERROR. |
| Current override UI | `gantt/src/components/roster/rule-confirm-dialog.tsx` | Cancel / Continue Anyway when nonblocking; no password or reason input in the inspected dialog. Password authorization is a new design requirement. |
| Existing days-off building blocks | `rule-engine-rs/src/lib.rs::count_days_off`, `check_min_days_off_app`; `rule-engine-rs/src/rules/rule7508.rs` | Partial candidates, with distinct period/free-day semantics. See the preserved Ver 1 inventory for details. |
| Existing-violation treatment | `rule-engine-rs/src/lib.rs::check_min_days_off_app` | Optimizer may suppress an all-preassigned shortfall; this is not proof of the requested baseline-identity/no-new-or-worsened policy. |

The 8056/006 migration documents the full historical parameter order: Bases, Ranks, Fleets, Crew Teams, Attribute A, Label A, Assignment Group A, Qualifier A, Airport A, Roles A, Is Requested A, Attribute B, Label B, Assignment Group B, Qualifier B, Airport B, Roles B, Is Requested B, Space, Unit, Directional, Is Location Equal Base A, Is Location Equal Base B, Utilize Post Duty Rest (`sql/migration/2026-06-14-legacy-rule-param-json-and-pbs-ruleset.sql`). No database values were fetched for this mock.

A Help/source wording mismatch was observed for 8056 post-duty-rest behavior. The design therefore does not inherit that meaning as an authoritative new-rule contract. Matching must verify exact semantics and tests against current code and source policy.

No rule engine, solver, real Gantt flow or password-override implementation was executed. `pbs-engine/` remains absent in this checkout. All mock run measurements and Git identifiers are explicitly demonstrations.
