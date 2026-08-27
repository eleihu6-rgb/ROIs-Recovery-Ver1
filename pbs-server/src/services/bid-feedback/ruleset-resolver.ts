import type { Pool } from "pg";

export interface PbsRuleset {
  rulesetId: number;
  name: string;
}

/**
 * Resolve the enabled PBS rule collection for a division from the live workset table.
 * Mirrors the LIVE side's `type LIKE '%LIVE%'`: uses `type LIKE '%PBS%'` so a shared
 * ruleset (e.g. type='LIVE,PBS,RO') serves both LIVE and PBS. ruleset_id = workset.id.
 */
export const resolvePbsRuleset = async (
  pgPool: Pick<Pool, "query">,
  liveSchema: string,
  division: string,
): Promise<PbsRuleset | null> => {
  const { rows } = await pgPool.query<{ id: number; name: string }>(
    `select id, name
       from ${liveSchema}.workset
      where category = 'RULE'
        and type like '%PBS%'
        and enabled = true
        and division = $1
      order by id
      limit 1`,
    [division],
  );
  const row = rows[0];
  return row ? { rulesetId: Number(row.id), name: row.name } : null;
};
