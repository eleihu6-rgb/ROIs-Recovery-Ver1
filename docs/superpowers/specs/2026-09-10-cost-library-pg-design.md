# Cost Library PostgreSQL and UI Design

Approved: Ryan approved the five-table proposal and requested development,
repeatable SQL for other databases, and multiple agents with GPT-5.5 testing.

## Scope

Implement approved Legality Cost mockup as authenticated production React UI
with PostgreSQL persistence and server-side calculation workbenches. No recovery
automation, payroll import, Rust changes or existing rule migration in this task.
Use configured remote SIT schema from live-server .env; do not write UAT or other
databases. Provide explicit repeatable migration/seed commands for those targets.

## Tables (SQL owner: root)

All five tables have bigint identity id and created_by/created_at/updated_by/
updated_at. FK delete RESTRICT, no is_deleted, no hard-coded schema.

- cost_type: type_code integer unique, name text, category_code text,
  calculator_code text, parameter_schema_json jsonb (allowed calculator codes),
  next_instance_no integer default 2. Lock row for sequence allocation.
- cost_instance: cost_type_id FK, instance_no integer, name text,
  source_instance_id nullable self FK, enabled boolean. Unique(type, instance).
- cost_revision: cost_instance_id FK, revision_no integer, calculator_code text,
  effective_from timestamptz, effective_to nullable timestamptz, currency_code
  text, unit_code text, unit_price numeric(18,6) nullable, params_json jsonb,
  applicability_json jsonb, reference text, gh_policy_revision_id nullable self
  FK. Unique(instance,revision), unique(id,cost_instance_id). Immutable after
  creation through application. Validate parameter schema, tiers and references.
- cost_set: name text, description text, division text, enabled boolean,
  is_default boolean, version integer for optimistic locking; at most one default.
- cost_set_member: cost_set_id FK, cost_instance_id FK, cost_revision_id FK,
  enabled boolean, sort_order integer; unique(set,instance), composite FK
  (cost_revision_id,cost_instance_id) to revision(id,cost_instance_id).

Template = instance_no 1; display e.g. 1002/001, copies 002/003. Revisions are
different from instance numbers. Sets pin exact revisions; saving a new revision
must not silently update other sets. Copying sets supports shared references or
independent instances and remaps internal standby -> GH revision references.
No deletion of protected templates or referenced instances/revisions. Instance
tree can access items not in the current set. No ambiguous automatic sum of all
instances: workbenches calculate one configured cost, not aggregate set totals.

## Shared HTTP Contract (backend and UI agents)

Base `/api/cost-library` (frontend existing API client uses `/cost-library`).
Usual `{code,data,message}` envelope. Authenticate all; reads use Legality view
permission, writes and calculations follow existing Legality permission pattern
without granting new access to non-admins by default. Reuse existing helpers.

GET `/catalog`: `{types: CostType[], instances: CostInstance[], sets: CostSet[]}`.
CostType: `{id,typeCode,name,categoryCode,calculatorCode,parameterSchemaJson}`.
CostInstance: `{id,costTypeId,typeCode,instanceNo,name,categoryCode,enabled,
sourceInstanceId,latestRevision: CostRevision}`.
CostRevision: `{id,costInstanceId,revisionNo,calculatorCode,effectiveFrom,
effectiveTo,currencyCode,unitCode,unitPrice:number|null,paramsJson,
applicabilityJson,reference,ghPolicyRevisionId:number|null,createdBy,createdAt}`.
CostSet: `{id,name,description,division,enabled,isDefault,version,
members:[{costInstanceId,costRevisionId,enabled,sortOrder}]}`.
GET `/instances/:id/revisions`: CostRevision[].
POST `/instances/:id/copy`: new CostInstance (membership managed explicitly).
PATCH `/instances/:id`: `{name,enabled}` -> updated instance.
DELETE `/instances/:id`: 409 if protected or referenced; otherwise deletes own
  revisions and instance transactionally (no reverse-FK breaking).
POST `/instances/:id/revisions`: revision fields excluding IDs/audit plus
  `{expectedRevisionNo:number}` -> new CostRevision, 409 on stale save.
POST `/sets`: `{name,description,division,enabled}` -> CostSet, initially includes
  latest revision of every instance.
PATCH `/sets/:id`: `{name,description,division,enabled,expectedVersion}` -> CostSet.
PUT `/sets/:id/members`: `{revisionIds:number[],expectedVersion}` -> CostSet.
POST `/sets/:id/copy`: `{name,mode:'shared'|'independent'}` -> CostSet.
DELETE `/sets/:id`: deletes members+set, no instance deletion.
POST `/calculate`: `{revisionId:number,inputs: object}` ->
  `{amount:number|null,currencyCode,status:'priced'|'unpriced'|'disabled',
    breakdown: {label:string,value:string}[],formula:string}`.
Inputs: `quantity`, `beforeCredit`, `addedCredit`, `removedCredit`, `reportAt`,
`departureAt`, `pairingCredit`, `baselineStandbyCredit`, `delayBefore`,
`delayAfter`, `hourlyRate` (optional crew-specific rate override).
Report/departure ISO datetimes with offset; duration in minutes, credit hours as
decimal. Reject negative/nonfinite inputs and removed credit exceeding baseline.

## Calculator Parameters

Codes: quantity, fixed, minimum, guarantee, standby, bands, booking.
GH params: `{guaranteeHours:85,tiers:[{upToHours:90,multiplier:1.2},
{upToHours:null,multiplier:1.5}]}`; row add/delete, contiguous increasing tiers.
Standby params `{creditFactor:0.5,departureCutoffMinutes:60}`; referenced GH
revision computes incremental cash from reconciled credit; no fixed callout fee.
minimum `{minimumQuantity:4}`; bands `{threshold:120,upperRate:25}`;
booking `{originalAmount:140,refundAmount:140,changeFee:0}`.
Pay(after)-Pay(before) at GH=85/rate100, before84/add6.75 =>712.50;
before70/add6.75 =>0. Standby 07:00->10:00, pairing5.75 =>1 standby hour,
6.75 assignment hours. Unpriced stays null, not zero. Round final cash to cents,
do not round intermediate credits; use existing decimal library if available.

## UI and Verification

Cost Sets/Templates after Rule Templates. Reuse compact Legality styling and
AppDialog; no iframe/mockup injection. Server-backed loading/error/empty states.
Tree, sets, memberships, templates/copies, revisions, expandable parameters and
per-cost workbenches. All prices and options from API/configuration, not UI seeds.
Expose revision choice in membership; clearly distinguish selected set revision
from latest catalogue revision. Calculations use saved displayed revision.

Focused Vitest for every calculator and API write/permission/error flow. Remote
PG migration twice + row preservation, FK checks, real service/integration tests.
Real UI Playwright covers each workflow and saved values after reload, desktop/
mobile screenshots per run with non-overwriting versions. No mocked API receipts
claimed as persistent integration. GPT-5.5 owns test execution, root reviews.
