/**
 * Mirror of live-server/src/utils/user-module.ts for .mjs scripts. Builds
 * `user(module)` strings written into rule_violation.created_by /
 * rule_violation.updated_by so the audit trail always carries the current
 * logged-in user together with the producing module.
 *
 * Examples:
 *   formatUserModule('tiao', 'legality_recheck')     → "tiao(legality_recheck)"
 *   formatUserModule('',     'legality_recheck')     → "system(legality_recheck)"
 *   formatUserModule(undefined, 'violations_init')   → "system(violations_init)"
 *
 * The DB column width is varchar(50); the module tag is preserved at all
 * costs. If the combined form would overflow, the user segment is
 * truncated with a single trailing '…'.
 */
export function formatUserModule(user, mod) {
  const safeModule = String(mod ?? '').trim() || 'unknown'
  const safeUser = String(user ?? '').trim() || 'system'
  const combined = `${safeUser}(${safeModule})`
  if (combined.length <= 50) return combined
  const tailLen = 1 + safeModule.length + 2 // " (<module>)"
  const userCap = 50 - tailLen - 1
  if (userCap <= 0) return `…(${safeModule})`.slice(-50)
  return `${safeUser.slice(0, userCap)}…(${safeModule})`.slice(0, 50)
}

/** Resolve `--user <code>` CLI arg (defaults to 'system' so unit tests / cron
 *  invocations stay deterministic). */
export function resolveActorFromArgv(argv = process.argv) {
  const i = argv.indexOf('--user')
  if (i >= 0 && argv[i + 1]) return String(argv[i + 1]).trim() || 'system'
  if (process.env.LEGALITY_USER) return String(process.env.LEGALITY_USER).trim() || 'system'
  return 'system'
}
