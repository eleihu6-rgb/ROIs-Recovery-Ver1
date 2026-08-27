# Data Entity Row Actions Design

## Goal

Every Data entity row must expose row actions in this exact left-to-right order:
Edit, Copy, Delete.

## Scope

The requirement applies unconditionally to all configured Data entities, including
Basic pages and Crew Master detail entities. The UI must not hide Copy or Delete
based on registry capability flags.

## UI Behavior

The shared grid row action area renders three action columns: Edit, Copy, and Del.
Copy opens the existing row edit dialog in create mode with editable values copied
from the source row. Readonly columns, the primary key, and audit fields are not
copied into the create payload.

Delete keeps the existing explicit confirmation flow before calling save with
`action: 'delete'`.

## Data Flow

Edit continues to submit `action: 'update'` with the source row id.
Copy submits `action: 'create'` with copied editable values and no row id.
Delete submits `action: 'delete'` with the source row id.

## Backend Contract

Because actions are unconditional in the UI, the live-server Data save service must
handle create and delete for every Data entity exposed by the registry/page map.
Unsupported entity errors are no longer acceptable for Data entities shown in the
UI.

## Risks

Delete is a physical delete. Existing database constraints remain the safety guard
for referenced rows. The API must surface database failures clearly so the UI can
show a failure toast.

## Verification

Add focused frontend tests for action order and Copy prefill/create behavior.
Add focused backend tests for generic create and delete behavior on entities that
were previously unsupported.
