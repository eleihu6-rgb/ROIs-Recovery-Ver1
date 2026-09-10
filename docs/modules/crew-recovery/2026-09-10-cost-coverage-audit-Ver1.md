# Crew Cost Coverage and Standby Calculation Audit

Date: 2026-09-10
Version: 1
Status: Review findings; no runtime changes made.

## Conclusion

The HTML mockup is not a complete implementation of the reference cost inventory. It has 17 catalogue entries, 15 with demonstration prices and two unpriced. Having an entry does not mean its contractual calculation is complete. The written design covers a broader inventory of source concepts and proposed extensions; it must not be confused with executable coverage.

The fixed standby fee was sourced from R2 section 1.4, which explicitly labels its USD 250 airport / USD 200 home callout figures as illustrative and specifies "Per crew member called." This is a defensible example tariff, not evidence that standby is universally paid per activation. R1 and R3 do not establish that universal rule either.

The mockup should have exposed this limitation more directly in the standby definition. Its `crew()` calculation adds P03 once, and does not derive elapsed standby or resulting credit. Merely switching P03 to the generic quantity template still passes quantity 1 from that calculation and retains a callout unit, so it does not implement an hourly standby policy.

## Source and Implementation Anchors

- R2: `/Users/kimi/Downloads/Crew-Recovery-Case-Samples-Ethiopian-Airlines-Ver10.docx`, sections 1.2-1.4, T4-01 and section 3.
- R1: `/Users/kimi/Downloads/JetBlue Recovery Manager Crew IP Recommendations v5.1.docx`, sections 4.3.1, 6.2, 6.5-6.9 and Appendix 9.1.
- R3: `/Users/kimi/Downloads/IFLIGHT RECOVERY CREW.pdf`, pages 2-3. Supplied analytical narrative, not independently validated contract authority.
- Design inventory: `docs/superpowers/specs/2026-09-10-0917-crew-recovery-cost-library-design-Ver1.md`, section 5.
- Mockup implementation: `docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/model.js`, `defaults()`, `cost()` and `crew()`.

## Coverage Findings

| Area | Represented in the mockup | Missing or incomplete |
|---|---|---|
| Core crew payments | GH overage, airport/home activation, recall, short-notice change, augmentation | Contract-specific standby credit, additional reserve-day pay, voluntary pickup, emergency/footprint payments |
| Credit and protection | Synthetic GH/tier formula; manual added/removed credit | Pay-protected release/reassignment, duty/trip rigs, deadhead credit, paid-absence treatment, full contract-derived credit |
| Position and service | Lead-cabin and language entries, both unpriced | Actual applicability and credit rules; reduced-complement compensation |
| Accommodation | Hotel, day room, per diem, simple replacement booking delta | Supplier billing windows, tax/inclusions, elapsed/calendar allowance rules, cancellation bands |
| Positioning | Own/other-airline seats and generic vehicle transfer | Separate hotel transfer, ticket/transport amendment or cancellation rules, complete return-to-base package |
| Other crew expenditure | Some components above | Crew-meal/catering changes; applicable compensatory day-off obligation (the latter is a proposed design extension) |
| Related non-crew expenditure | Illustrative delay curve and ferry sector | Passenger overnight/care, rebooking/cancellation, eligible compensation, tech stop, ACMI |
| Economic effects | Distinguished in written design | Foregone contribution and seat displacement are not implemented as separate evaluation outputs |
| Non-cash preferences | Reserve/roster counts and synthetic legal margin in case fixtures | Full team-split, off-plan, move-up, excess-language, travel-placement and layover-scarcity policy coverage |

Do not add non-cash preferences or credit units directly to a cash subtotal. Some missing concepts are composite actions, baseline obligations or design extensions rather than independent chargeable fees. Production coverage requires a source-to-type-to-formula-to-test matrix, not just a count of menu entries.

## United/AFA Example Supplied by Ryan

Treat this as a user-supplied contract example until its agreement version, clause, applicability and exceptions are checked against the governing source. This review does not assert an independently verified current United contract rule.

Inputs supplied:

- Standby report: 07:00.
- Assigned pairing departure: 10:00.
- Credit cutoff: one hour before departure, therefore 09:00.
- Creditable standby duration: 120 minutes.
- Standby credit factor: 0.5.
- Pairing value: 5:45, or 345 minutes.

Calculation for this example:

```text
standby_minutes = max(0, departure - 60 minutes - standby_report)
standby_credit_minutes = standby_minutes * 0.5
assignment_credit_minutes = standby_credit_minutes + pairing_credit_minutes

120 * 0.5 = 60 minutes
60 + 345 = 405 minutes = 6:45
```

This produces credit, not a USD callout payment. Keep pay credit and contractual flight-time credit as explicitly identified outputs; do not silently treat either as actual operated block time or substitute it for statutory flight/duty inputs.

Cash must then follow the applicable pay agreement. The incremental recovery amount is the payable obligation after recovery minus the baseline payable obligation. The baseline must include any standby credit/pay already owed without this assignment. Do not charge all 6:45 as additional recovery credit automatically.

Whether this credit counts inside GH, is paid outside GH, triggers a premium, or interacts with protection/minima must be an explicit agreement rule. A guarantee does not by itself imply a higher rate above the guarantee.

## Recommended Standby Model Correction

Separate the standby activity from its payment/credit components. Supported policies should include fixed activation fee, elapsed-time cash allowance, fractional standby credit added to pairing credit, minimum credited value, and contract-defined combinations. Fixed fee may be absent or zero; it must not be added by default when the agreement only grants credit.

Expose these configuration fields:

- Applicability: standby type, contract, crew group, flies / no assignment / released outcome.
- Eligible interval: report/start event, cutoff event, offset, actual versus scheduled time basis, cross-midnight dates and timezone.
- Credit: factor, rounding, minimum/maximum and treatment of pairing value.
- Pay: inside/outside guarantee, applicable rate table, premium thresholds, stacking or replacement.
- Baseline: standby-only obligation and already committed credit/pay, retained when comparing alternatives.

Regression examples should include Ryan's 07:00/10:00 -> 6:45 case, no-flight outcome, assignment before the cutoff produces positive time, cross-midnight standby, GH crossing, within-GH credit, and no double counting of an existing standby obligation.

## Verification Limits

The previous 24 passing Playwright checks verify the implemented demonstration behaviour. They do not prove reference coverage or United/AFA contract correctness. No new runtime tests were run for this read-only coverage review; the model and R2 source wording were inspected directly.
