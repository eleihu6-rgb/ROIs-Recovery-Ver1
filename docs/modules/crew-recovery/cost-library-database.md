# Cost Library Storage and Database Synchronization

## Model

`cost_type` defines the numeric catalogue and supported calculator codes.
`cost_instance` identifies template 001 and independently numbered copies.
`cost_revision` stores an immutable saved configuration: rate, currency, unit,
effective interval, calculator parameters, applicability and GH dependency.
`cost_set` names a collection; `cost_set_member` pins an exact revision.

Identity primary keys are database-local. Display type/instance codes are stable
business identifiers, never FK values. The membership composite FK guarantees
that its revision belongs to its instance. Referenced configurations cannot be
deleted. Copy numbers are allocated with a type-row lock, not an unlocked MAX.

Changing a rate creates another revision. Sets keep the revision selected for
them until explicitly updated. Copying a set with independent configurations
also remaps standby-to-GH references when both configurations are copied.

No monetary aggregate is implied by membership: multiple matching alternatives
must be resolved before recovery cost aggregation. This delivery calculates
individual configured workbenches, not automatic recovery selection. Workbench
scenario inputs/results are not payroll records. Future persisted recovery
decisions must retain their exact configuration revisions and input evidence.

## Files

- Schema: `sql/migration/2026-09-10-cost-library.sql`
- Initial catalogue: `sql/seed/2026-09-10-cost-library.sql`
- Installer: `live-server/scripts/install-cost-library.mjs`

The seed contains 17 illustrative templates and a new default Daily Recovery
set. It is not a set of verified airline tariffs. It inserts missing defaults
without replacing configured prices or revisions. Initial membership is added
only when the default set is first created; rerunning does not restore members
that a user deliberately removed.

## Install on the Configured SIT Database

From `live-server/` (connection supplied through the existing .env):

```sh
node --env-file=.env scripts/install-cost-library.mjs --schema f8_sit_live
node --env-file=.env scripts/install-cost-library.mjs --schema f8_sit_live --apply --verify-repeat
```

The first command runs a transaction and rolls it back. The second commits and
runs again, requiring identical business-row digests on the second pass. Both
perform PostgreSQL EXPLAIN and membership/dependency integrity checks.
Sequence counters may advance on conflict; identity gaps are expected and do
not change display instance numbers or any business rows.

## Synchronize Another Environment

Supply that environment's `DATABASE_URL` securely in the process environment,
then pass its explicit application schema. For example, after approval to deploy
to UAT:

```sh
node scripts/install-cost-library.mjs --schema f8_uat_live
node scripts/install-cost-library.mjs --schema f8_uat_live --apply --verify-repeat
```

Never paste credentials into SQL, documentation or command history. This task
does not execute the UAT commands. The installer requires an existing application
schema containing `rule`; it refuses public/system schemas. No existing crew,
roster, rule, or payroll data is rewritten.

For a SQL-only deployment, run both files on one connection/transaction with the
target search_path explicitly set. Use fail-fast execution, such as psql's
`ON_ERROR_STOP=1` and `--single-transaction`; the seed uses transaction-local
temporary tables. Take the normal database backup before deployment. Rollback of
a failed install is transactional; after users save configurations, rollback
must not drop the five tables and discard their work.

These scripts synchronize schema and missing defaults, not destructive copies
of environment-specific settings. Promoting already-customized prices between
databases requires a separately reviewed data package mapped by type/instance/
revision business keys, never by identity IDs.
