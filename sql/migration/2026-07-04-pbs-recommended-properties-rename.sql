-- Rename PBS Portal recommended property metadata away from the old favorite wording.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'pbs_bid_property'
      and column_name = 'default_favorite_order'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'pbs_bid_property'
      and column_name = 'recommended_order'
  ) then
    alter table pbs_bid_property
      rename column default_favorite_order to recommended_order;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'pbs_bid_property'
      and column_name = 'recommended_order'
  ) then
    alter table pbs_bid_property
      add column recommended_order smallint;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'pbs_bid_property'
      and column_name = 'default_favorite_usage_count'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'pbs_bid_property'
      and column_name = 'recommended_usage_count'
  ) then
    alter table pbs_bid_property
      rename column default_favorite_usage_count to recommended_usage_count;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'pbs_bid_property'
      and column_name = 'recommended_usage_count'
  ) then
    alter table pbs_bid_property
      add column recommended_usage_count integer;
  end if;
end $$;

comment on column pbs_bid_property.recommended_order is 'PBS Portal 推荐排序，空表示非推荐';
comment on column pbs_bid_property.recommended_usage_count is '推荐来源报表中的使用次数';
