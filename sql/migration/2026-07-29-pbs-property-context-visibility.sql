-- ============================================================
-- PBS property visibility by bid context
-- Source of truth for Current / StandingLineholder / StandingReserve catalogs.
-- ============================================================

begin;

create table if not exists pbs_bid_property_context (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    property_id          bigint       not null,
    bid_context          varchar(24)  not null,
    is_visible_in_portal smallint     not null default 0,
    display_order        integer,
    constraint fk_pbs_bid_property_context_property
      foreign key (property_id) references pbs_bid_property(id),
    constraint ck_pbs_bid_property_context
      check (bid_context in ('Current', 'StandingLineholder', 'StandingReserve')),
    constraint ck_pbs_bid_property_context_visible
      check (is_visible_in_portal in (0, 1)),
    constraint uq_pbs_bid_property_context
      unique (property_id, bid_context)
);

create index if not exists idx_pbs_bid_property_context_catalog
    on pbs_bid_property_context (bid_context, is_visible_in_portal, display_order, property_id);

comment on table pbs_bid_property_context is
  'PBS 条件按 Current/Standing 上下文的 Portal 可见配置，是条件目录显示的唯一数据源';
comment on column pbs_bid_property_context.property_id is
  '稳定属性定义 id，关联 pbs_bid_property.id';
comment on column pbs_bid_property_context.bid_context is
  '目录上下文：Current/StandingLineholder/StandingReserve';
comment on column pbs_bid_property_context.is_visible_in_portal is
  '当前上下文 Portal 展示开关：1=展示 0=隐藏';
comment on column pbs_bid_property_context.display_order is
  '当前上下文 Portal 展示排序';
insert into pbs_bid_property_context (
  property_id,
  bid_context,
  is_visible_in_portal,
  display_order,
  created_by,
  updated_by
)
select
  property.id,
  context.bid_context,
  case
    when context.bid_context = 'Current'
      and (
        (property.bid_type = 'DaysOff' and property.property_code in (201, 204))
        or (property.bid_type = 'Pairing' and property.property_code in (102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168, 428))
        or (property.bid_type = 'Line' and property.property_code in (407, 408, 427, 429))
        or (property.bid_type = 'Reserve' and property.property_code = 301)
      )
      then 1
    when context.bid_context = 'StandingLineholder'
      and (
        (property.bid_type = 'DaysOff' and property.property_code in (201, 204))
        or (property.bid_type = 'Pairing' and property.property_code in (103, 107, 110, 112, 116, 117, 122, 129, 163, 168, 428))
        or (property.bid_type = 'Line' and property.property_code in (407, 408, 427, 429))
      )
      then 1
    when context.bid_context = 'StandingReserve'
      and property.bid_type = 'Reserve'
      and property.property_code = 301
      then 1
    else 0
  end,
  property.display_order,
  'migration',
  'migration'
from pbs_bid_property property
cross join (
  values
    ('Current'::varchar(24)),
    ('StandingLineholder'::varchar(24)),
    ('StandingReserve'::varchar(24))
) as context(bid_context)
on conflict (property_id, bid_context) do nothing;

commit;
