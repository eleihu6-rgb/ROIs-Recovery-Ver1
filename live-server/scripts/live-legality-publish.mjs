/**
 * Redis → WS bridge for live legality: after rule_violation is rewritten, publish
 * so gantt usePersistedViolations refetches without a hard refresh.
 *
 * Channel layout must match live-server/src/plugins/websocket.ts pSubscribe handler:
 *   violations:{schema}:{groupCode}
 */

/** Redis channel the live-server WS plugin pSubscribes. */
export function violationsUpdatedChannel(schema, groupCode) {
  return `violations:${schema}:${groupCode}`
}

/**
 * Notify open gantt clients that rule_violation for this ruleset was rewritten.
 * Payload is a numeric eventId (WS plugin parseInt); groupCode must match the
 * toolbar workset id string the client sent via set_rule_group.
 */
export async function publishViolationsUpdated(redisClient, schema, groupCode, eventId = Date.now()) {
  await redisClient.publish(violationsUpdatedChannel(schema, groupCode), String(eventId))
}
