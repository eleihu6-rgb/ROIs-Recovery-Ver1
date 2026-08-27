# Connector F8 Token Cache and Outbound Error Propagation

## Scope

- Share an F8 token across connector configurations that use the same token URL,
  client ID, and signing material.
- Preserve the most actionable outbound failure when multiple connector results
  are returned.
- Record HTTP failures as `External API returned <status>` when the connector
  result contains a response status but no error message.
- Include outbound error details in connector worker logs.
- Ensure retries create a new BullMQ job instead of reusing a completed job ID.
- Map outbound ground assignment `DO` to external assignment `GDO`.
- Send RES duties as ground-task payloads even when they have a pairing ID.
- Treat an HTTP-success response with business `code: 1` as a failed package.

## Design

`F8TokenAuthService` will derive a Redis cache identity from the complete F8
authentication configuration rather than `connectorCode`. The identity is
hashed so credentials are not exposed in Redis keys. Existing connector-scoped
keys will naturally expire and be replaced on the next token request.

The live-server outbound bridge will rank failed connector results with an HTTP
response status or response body above failures with only a generic message.
Failure persistence and thrown errors will use the connector error message,
otherwise `External API returned <status>`, otherwise the response body, and
finally the existing generic fallback.

Outbound retry jobs will append the attempt timestamp to the BullMQ job ID.
The request ID remains the business correlation ID, while the unique job ID
ensures the connector worker actually runs again after the retry cooldown.

For roster callback payloads, only the outbound representation is changed:
ground `assignment: DO` becomes `assignment: GDO`; database values remain
unchanged. A response body with JSON `code: 1` is persisted as a failed
connector result so the batch remains unpublished and is retried later.

RES duties are represented as ground tasks in the external callback. Their
`pairing_id` is ignored for payload shape selection; the callback uses the
roster-flight identity and sends base, UTC range, assignment group, and
assignment.

## Verification

- Connector token unit tests cover shared cache identity and existing refresh
  behavior.
- Live-server outbound service tests cover selecting an HTTP failure and
  preserving `External API returned 401`.
- Connector worker tests are not currently present; the worker log change will
  be verified by TypeScript build and the existing connector test suite.
