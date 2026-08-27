export type CrewSearchActor = {
  crewId: string;
  userCode: string;
  isAdmin?: boolean;
};

type BuildCrewSearchScopeSqlInput = {
  pbsSchema: string;
  actor: CrewSearchActor;
  firstParamIndex: number;
  targetCrewIdExpression: string;
  targetBaseExpression: string;
  targetDivisionExpression: string;
};

export type CrewSearchScopeSql = {
  actorScopeCte: string;
  whereClause: string;
  values: [boolean, string, string];
};

export const normalizeCrewSearchDimensionExpression = (expression: string): string =>
  `nullif(upper(btrim(${expression})), '')`;

export const buildCrewSearchScopeSql = ({
  pbsSchema,
  actor,
  firstParamIndex,
  targetCrewIdExpression,
  targetBaseExpression,
  targetDivisionExpression,
}: BuildCrewSearchScopeSqlInput): CrewSearchScopeSql => {
  const adminParam = `$${firstParamIndex}`;
  const actorCrewIdParam = `$${firstParamIndex + 1}`;
  const actorUserCodeParam = `$${firstParamIndex + 2}`;

  return {
    actorScopeCte: `
      actor_search_scope as (
        select
          ${normalizeCrewSearchDimensionExpression("pu.base")} as base,
          ${normalizeCrewSearchDimensionExpression("pu.division")} as division
        from ${pbsSchema}.pbs_user pu
        where pu.crew_id = ${actorCrewIdParam}
          and pu.user_code = ${actorUserCodeParam}
        limit 1
      )
    `,
    whereClause: `
      (
        ${adminParam}::boolean
        or ${normalizeCrewSearchDimensionExpression(targetCrewIdExpression)}
          = ${normalizeCrewSearchDimensionExpression(`${actorCrewIdParam}::varchar`)}
        or exists (
          select 1
          from actor_search_scope actor_scope
          where actor_scope.base is not null
            and actor_scope.division is not null
            and ${targetBaseExpression} = actor_scope.base
            and ${targetDivisionExpression} = actor_scope.division
        )
      )
    `,
    values: [Boolean(actor.isAdmin), actor.crewId, actor.userCode],
  };
};
