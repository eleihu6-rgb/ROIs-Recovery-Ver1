-- Add dep_arp / arv_arp to roster_flight for ground assignment location tracking.
-- Ground tasks (pairing_id IS NULL) store startLocation / endLocation from the
-- F8 rosterGround API here. Flight tasks leave these NULL (use flight/pairing_segment).
ALTER TABLE roster_flight
  ADD COLUMN IF NOT EXISTS dep_arp varchar(3),
  ADD COLUMN IF NOT EXISTS arv_arp varchar(3);
