begin;

alter table pbs_bid_pairing_configured_favorite
    drop column if exists tiers;

alter table pbs_bid_days_off_favorite
    drop column if exists tiers;

alter table pbs_bid_line_favorite
    drop column if exists tiers;

commit;
