-- Store imported crew team memberships by upstream team code instead of team.id.

alter table crew_team
    add column if not exists team varchar(50);

do $$
begin
    if exists (
        select 1
          from information_schema.columns
         where table_schema = current_schema()
           and table_name = 'crew_team'
           and column_name = 'team_id'
    ) then
        update crew_team ct
           set team = coalesce(t.team, ct.team_id::text)
          from team t
         where ct.team is null
           and ct.team_id = t.id;

        update crew_team
           set team = team_id::text
         where team is null
           and team_id is not null;
    end if;
end $$;

alter table crew_team
    alter column team set not null;

alter table crew_team
    drop column if exists team_id;

comment on column crew_team.team is '上游团队代码，来自 Crew API teams[].teamId；team 表可后续维护定义但不作为此表关联外键';
