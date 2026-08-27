-- PBS: 移除 pbs_user.base / pbs_user.rank，改为从 live crew_base / crew_rank 查询。
-- 消费者（dashboard-profile / pairing-specific-date / reserve-coverage /
-- days-off-export / bid-feedback-input-loader）已改为 join live crew_base / crew_rank。
alter table pbs_user drop column if exists base;
alter table pbs_user drop column if exists rank;
drop index if exists idx_pbs_user_base;
drop index if exists idx_pbs_user_rank;
