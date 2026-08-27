-- PBS Portal default favorite properties derived from CLASS-BidsReport_March2026.txt.

alter table pbs_bid_property
  add column if not exists default_favorite_order smallint;

alter table pbs_bid_property
  add column if not exists default_favorite_usage_count integer;

comment on column pbs_bid_property.default_favorite_order is 'PBS Portal 系统默认收藏排序，空表示非默认收藏';
comment on column pbs_bid_property.default_favorite_usage_count is '默认收藏来源报表中的使用次数';

update pbs_bid_property
set
  default_favorite_order = null,
  default_favorite_usage_count = null,
  updated_at = now()
where bid_type in ('DaysOff', 'Pairing', 'Line');

update pbs_bid_property as property
set
  default_favorite_order = defaults.default_favorite_order,
  default_favorite_usage_count = defaults.default_favorite_usage_count,
  updated_at = now()
from (
  values
    ('DaysOff', 201, 1, 1583),
    ('DaysOff', 203, 2, 175),
    ('DaysOff', 202, 3, 65),
    ('DaysOff', 205, 4, 34),
    ('Pairing', 102, 1, 2094),
    ('Pairing', 101, 2, 1186),
    ('Pairing', 106, 3, 625),
    ('Pairing', 103, 4, 332),
    ('Pairing', 105, 5, 295),
    ('Line', 402, 1, 63),
    ('Line', 401, 2, 59),
    ('Line', 404, 3, 56),
    ('Line', 405, 4, 29)
) as defaults(bid_type, property_code, default_favorite_order, default_favorite_usage_count)
where property.bid_type = defaults.bid_type
  and property.property_code = defaults.property_code;
