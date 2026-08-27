-- SGPO-593 新增系统参数 MIN_LEGAL_COMPLEMENT_RULES
-- mysql
-- 说明：
-- 1. 按 param_name 做幂等控制，避免重复插入
-- 2. id 使用当前表 max(id) + 1，避免与已有样例 id 冲突

-- 步骤1：执行前检查，确认目标参数当前不存在
select *
from system_parameter
where param_name = 'MIN_LEGAL_COMPLEMENT_RULES';

-- 步骤2：插入系统参数
insert into system_parameter
    (id, param_name, param_values, app_ids, param_desc, modified_by)
select next_id,
       'MIN_LEGAL_COMPLEMENT_RULES',
       'SQ:7410|7450',
       null,
       '最小配比涉及的法规',
       'ROIS'
from (
    select coalesce(max(id), 0) + 1 as next_id
    from system_parameter
) t
where not exists (
    select 1
    from system_parameter
    where param_name = 'MIN_LEGAL_COMPLEMENT_RULES'
);

-- 步骤3：执行后检查
select *
from system_parameter
where param_name = 'MIN_LEGAL_COMPLEMENT_RULES';
