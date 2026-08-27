// live-server/src/services/rule/legality-coldstart.ts
// Cold-start Rust legality reload: spawn `node scripts/live-legality.mjs` per enabled
// LIVE workset (P and C) for a rolling 3-month window centred on today so the gantt bell
// + Alert Center reflect current roster state right after the server boots. Each workset
// spawn passes its OWN --division so live-legality only checks crews of that division
// (P ruleset → P crews, C ruleset → C crews; never cross-checked).

import path from 'node:path'
import { spawn } from 'node:child_process'
import type { FastifyInstance } from 'fastify'

export async function runLegalityOnStartup(fastify: FastifyInstance, filiale: string): Promise<void> {
  const r = await fastify.pgPool.query<{ id: number; division: string }>(
    `select id, division from workset
      where category = 'RULE' and type like '%LIVE%' and enabled = true
      order by division, id`)
  if (!r.rows[0]) {
    fastify.log.warn('cold-start: no enabled LIVE RULE workset found, skipping legality reload')
    return
  }
  const today = new Date()
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const script = path.resolve(process.cwd(), 'scripts/live-legality.mjs')

  for (const ws of r.rows) {
    const rulesetId = String(ws.id)
    const statusKey = `legality:recheck:${filiale}:${rulesetId}:status`
    const metaKey = `legality:recheck:${filiale}:${rulesetId}:meta`
    const startedAt = new Date().toISOString()
    const startedMs = Date.now()

    const writeMeta = (status: 'computing' | 'done' | 'failed', durationSec?: number) =>
      void fastify.redis
        .set(metaKey, JSON.stringify({
          status,
          startedAt,
          finishedAt: status === 'computing' ? null : new Date().toISOString(),
          ...(durationSec != null ? { durationSec } : {}),
          ruleCodes: null,
          ruleCount: 0,
          rangeDays: Math.round((to.getTime() - from.getTime()) / 86400000),
        }))
        .catch(() => undefined)
    writeMeta('computing')

    const args = [script, '--group', rulesetId, '--from', fmt(from), '--to', fmt(to)]
    if (ws.division) args.push('--division', ws.division)

    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' })
    child.on('error', (err) => {
      fastify.log.error({ err }, 'cold-start live-legality spawn failed')
      writeMeta('failed')
      void fastify.redis.set(statusKey, 'failed')
    })
    child.on('exit', (code) => {
      const durationSec = (Date.now() - startedMs) / 1000
      if (code === 0) return
      fastify.log.error({ code }, 'cold-start live-legality exited non-zero')
      void fastify.redis.get(statusKey).then((s: string | null) => {
        if (s === 'computing') {
          writeMeta('failed', durationSec)
          return fastify.redis.set(statusKey, 'failed')
        }
      })
    })
    child.unref()
    fastify.log.info(
      { rulesetId, division: ws.division ?? null, from: fmt(from), to: fmt(to) },
      'cold-start: Rust legality recheck spawned (detached)',
    )
  }
}
