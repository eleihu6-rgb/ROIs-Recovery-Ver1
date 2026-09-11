/**
 * Build the `user(module)` stamp written into rule_violation.created_by /
 * rule_violation.updated_by so the audit trail always carries the current
 * logged-in user together with the producing module (legality_recheck,
 * violations_init, persist_7501, check_7505_gdo, …).
 *
 * Examples:
 *   formatUserModule('tiao', 'legality_recheck')     → "tiao(legality_recheck)"
 *   formatUserModule('',     'legality_recheck')     → "system(legality_recheck)"
 *   formatUserModule(undefined, 'violations_init')   → "system(violations_init)"
 *
 * The combined string is bounded to 50 chars (the DB column width is
 * varchar(50)). The module tag itself is preserved at all costs; if the
 * combined form would overflow, the user segment is truncated with a single
 * trailing '…' to keep the whole audit value recognizable.
 */
export function formatUserModule(
  user: string | null | undefined,
  module: string,
): string {
  const safeModule = String(module || '').trim() || 'unknown'
  const safeUser = String(user ?? '').trim() || 'system'
  const combined = `${safeUser}(${safeModule})`
  if (combined.length <= 50) return combined
  // 50 - "(<module>)".length - 1 (ellipsis) chars available for user.
  const tailLen = 1 + safeModule.length + 2 // " (<module>)"
  const userCap = 50 - tailLen - 1
  if (userCap <= 0) return `…(${safeModule})`.slice(-50)
  return `${safeUser.slice(0, userCap)}…(${safeModule})`.slice(0, 50)
}

/**
 * Same as formatUserModule but produces two values, one for `created_by` and
 * one for `updated_by`. They only differ on the very first insert (created) vs
 * later updates — both stay stamped with the same actor for the audit trail.
 */
export function stampCreatedUpdated(
  user: string | null | undefined,
  module: string,
): { createdBy: string; updatedBy: string } {
  const stamp = formatUserModule(user, module)
  return { createdBy: stamp, updatedBy: stamp }
}
