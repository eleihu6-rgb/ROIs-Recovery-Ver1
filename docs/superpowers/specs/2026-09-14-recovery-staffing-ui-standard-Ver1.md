# Recovery staffing presentation standard — Cases 1–4

User direction: standardize all Case 4 staffing methods, not only standby.

## Shared product flow

Persisted open pairing → select remaining rank → find candidates → compare methods,
crew, legality and library costs → Detail / Preview → Apply draft → Save.

Every crew method uses the same existing PlanGroup table: All / Executable /
Filtered tabs, crew identity/name/rank, cancellation/addition/stability/cost columns,
execution checkbox, row Preview and Detail, and clickable Cost breakdown. Shared
RecoveryDetailDialog retains the before/after table; RecoveryPreviewDock standardizes
the compact Live Gantt summary. The wrapper supplies table/detail components to the
open-seat workspace (no runtime circular import, no duplicate presentation).

The left rail is the same PlanTree too: By strategy and By cost tier, method counts,
cheapest-method star. The tier represents the method's lowest priced executable
candidate; choosing it keeps all candidates in that method. Unpriced/non-executable
options are excluded; no cross-currency conversion/comparison. Before pairing
creation, keep Pairing Options first and staffing methods unavailable.

## Real differences retained

Open-seat assignment has no displaced source crew. Available crew adds a pairing;
standby keeps its callout-marked task; move-up releases the real donor seat and must
show Partial. Missing costs remain Unpriced. Stability uses the existing weighted
formula over the same loaded roster scope for candidates. Legality uses the selected
ruleset and is rechecked before execution. Construction/save/lock semantics remain.

## Protection and verification

No changes to legacy candidate discovery or execution operations. Existing shared
preview markup is extracted, not a new recovery engine. Read-only UI tests use the
planner-created pairing 152689 (ET895/ET894 Sep17, 738) and isolated C4 crews; do not
reset it or reuse Cases 1–3 crews for Case 4. Verify three methods’ cost/detail/preview
and legacy recovery entry; no roster or pairing writes are needed for this UI fix.
