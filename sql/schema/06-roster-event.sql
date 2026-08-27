-- =============================================================================
-- roster_event: Immutable event log for roster operations
-- =============================================================================
-- Events are append-only and never updated; no updated_by / updated_at fields
-- Tracks: roster changes, pairing assignments, crew status updates, etc.
-- =============================================================================

CREATE TABLE roster_event (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  airline     char(2)        NOT NULL,             -- airline code (e.g., 'CA', 'TG')
  topic       varchar(50)    NOT NULL,             -- event category (e.g., 'roster', 'pairing')
  event_type  varchar(50)    NOT NULL,             -- event subtype (e.g., 'created', 'updated', 'deleted')
  entity_type varchar(30)    NOT NULL,             -- entity kind (e.g., 'roster_entry', 'pairing_assignment')
  entity_id   bigint         NOT NULL,             -- ID of the affected entity
  ref         jsonb,                               -- contextual refs: {"pairing_id": 16, "crew_ids": [101, 102]}
  created_at  timestamptz    NOT NULL DEFAULT now(),
  created_by  varchar(50)    NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_roster_event_airline_id
  ON roster_event (airline, event_id);

CREATE INDEX idx_roster_event_created_at
  ON roster_event (created_at);
