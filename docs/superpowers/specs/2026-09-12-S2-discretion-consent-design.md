# S2 FDP discretion consent

The controller sends one immutable before/after FDP proposal to every crew assigned to the affected pairing duty. Existing crew-app Alerts presents the proposal and explicit Yes/No replies; controller Recovery displays each response. Pending, No, expired or changed-duty requests never satisfy consent. Agreement does not authorize an illegal FDP extension.

## Architecture

Reuse Live `crew_notification` as the durable request/audit transport and the existing crew-app notification/discretion contract. A request row contains immutable proposal fields, recipient, authenticated requester, source fingerprint, expiration and a one-time decision. Notification read status remains separate from consent. Existing `pairing_segment.duty_fdp_discretion_min` and `duty_discretion_type` remain execution owners; this work does not write them or change legality limits. No database schema migration or parallel crew communication service.

Controller JWT endpoints create/read a proposal. Crew endpoints authenticate with the existing mobile credential verifier and scope every lookup/update by airline plus authenticated crew ID. Every assigned recipient is derived server-side; caller lists cannot omit crew. Source fingerprint includes pairing, duty segments, physical flights, and affected crews' current roster so changes invalidate prior agreement. Repeated decisions are idempotent only for the same decision/key; competing decisions cannot overwrite a response. New requests have new IDs and never inherit old agreement.

Controller component is mounted per duty in the existing Edit Duty Nodes dialog. Recovery FDP entry remains a separate Case2 integration boundary. It exposes Send request, Refresh feedback and per-crew state. All-Yes enables Return to controller review, which closes the duty dialog without roster mutation. Execution remains blocked pending a fresh authoritative regulatory assessment; a caller-provided allowed flag is never accepted. The returned consentComplete field establishes agreement only. The scope deliberately does not invent a commander authorization limit or claim notifications are delivered to a closed device.

## Verification and risks

Focused Vitest covers ownership, recipients, stale state, pending/rejection and concurrent/replayed decisions. Jest covers the existing mobile client envelope and Yes/No rendering. Actual controller Playwright and iOS simulator runs must prove send → details → reply → feedback with versioned screenshots. Case 1 IDs are excluded from all fixture writes. Polling is the existing delivery mechanism; a stored request is not push-delivery evidence. Full rule-engine integration and execution are separately gated and must remain explicitly blocked if unavailable.

Validation receipt: [S2 discretion consent evidence](../../test-cases/crew-recovery/2026-09-12-S2-discretion-consent-evidence-Ver1.md).
