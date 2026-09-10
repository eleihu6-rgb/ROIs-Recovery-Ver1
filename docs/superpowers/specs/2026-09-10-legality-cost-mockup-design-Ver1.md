# Legality Cost HTML Mockup - Ver1

Status: approved by Ryan ("mock up, pls"); standalone Ver1 implemented.

## Scope

Create a standalone, interactive HTML prototype matching the existing Legality
screen and supplied screenshot. Do not change the production application,
database, rule configuration, or previous cost mockups. Preserve Ver1 when
producing subsequent versions.

## Layout and Interaction

- Retain the compact application header and Legality sidebar. Sidebar order:
  Rule Sets, Rule Templates, Cost Sets, Cost Templates.
- Cost Sets opens three content columns: categorized Cost Instances tree,
  searchable Cost Sets list, and selected set's cost table.
- Initially select Daily Recovery, containing all 17 currently modeled cost
  entries. Additional sets are explicitly synthetic examples, not live data.
- Mirror rule interactions: search, category expansion/filtering, set selection,
  create/edit/copy/delete set, add/remove membership, instance copying,
  metadata editing, parameter editing, and row expansion.
- Set copying offers shared existing instances or new independent copies.
- Template entries cannot be deleted. Referenced instances must be removed from
  sets before deletion. Removing membership does not delete an instance.
- Cost Templates shows the template catalogue using the same row language.
- Collapsed rows show numeric ID, description, reference, category, unit,
  rate/status, updated-by, parameter count, and compact action icons.
- Expanded rows show editable parameters first, then that cost's own Calculation
  Workbench with scenario inputs, calculation breakdown, and result.
- Recalculate is the cost equivalent of Recheck; it does not run Rust legality.
- Use local prototype state only, with no claims of production persistence.

## Numbering

The existing rule route uses max(instance)+1 per function, padded to three
digits; instance 001 identifies the protected template. Mirror this for costs:
numeric cost type / instance, for example 1002/001, 1002/002, 1002/003.
Allocate prototype type groups 1000-series crew pay, 2000-series logistics,
3000-series operational impact. Preserve a mapping to the prior P/L/X IDs.
These are prototype identifiers, not a database ID migration.

Source: live-server/src/routes/rule/legality.ts, copy and delete routes;
gantt/src/components/legality/rule-instances-view.tsx and
legality-column-widths.ts. Rule catalogue copy is currently hidden in the UI;
the cost prototype intentionally exposes it to satisfy the requested workflow.

## Calculations

Reuse the existing cost model without changing earlier mockups. GH defaults to
85 hours, marginal 85-90 credit at 1.2x, above 90 at 1.5x; GH, base rate,
boundaries and multipliers are editable, with add/delete tier rows.

Airport standby credit is max(0, departure - Y - report) * X, defaults X=0.5
and Y=1 hour. Add pairing credit and reconcile baseline standby credit before
calculating incremental GH pay. No additional fixed airport activation fee.

Each other cost uses its applicable fixed, quantity, minimum, banded, or booking
calculation, not a generic GH workbench. Unpriced items remain visibly unpriced
until configured. Operational costs remain distinguishable from crew costs.
The 17 entries do not claim full reference-document coverage or verified tariffs.

## Verification and Delivery

Run existing model regressions and focused Playwright checks against the HTML:
navigation, filters, set operations, membership, 001 protection, sequential
copy IDs, parameter edits, tier add/delete, per-cost calculation results and
invalid inputs. Capture and inspect desktop/mobile screenshots in the same run
under docs/assets/screenshots/crew-recovery, using non-overwriting Ver suffixes.
Deliver an absolute clickable HTML link and exact test results. This is design
review material, not a production integration delivery.
