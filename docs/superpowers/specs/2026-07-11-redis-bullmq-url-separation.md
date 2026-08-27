# Redis / BullMQ URL Separation

## Goal

Separate service-private Redis usage from shared BullMQ queue Redis without breaking existing environments.

## Scope

- `REDIS_URL` remains the service Redis URL for cache/session/general Redis clients.
- `BULLMQ_REDIS_URL` becomes the BullMQ producer/consumer Redis URL.
- If `BULLMQ_REDIS_URL` is unset, services fall back to `REDIS_URL`.
- `live-server` workers, queues, and scenario import queue helpers must all use `BULLMQ_REDIS_URL`.
- `connector-server` queues, workers, and FlowProducer must use `BULLMQ_REDIS_URL` through the existing shared queue options.
- `pbs-server` is not changed in this phase because it currently has no BullMQ runtime wiring to separate.

## Operational Target

- UAT can use `REDIS_URL=.../1` for live private Redis and `BULLMQ_REDIS_URL=.../0` for shared live/connector queues.
- SIT can use `REDIS_URL=.../7` for live private Redis and `BULLMQ_REDIS_URL=.../6` for shared live/connector queues.
- PBS remains on its independent `REDIS_PBS_URL` DB.

## Compatibility

Existing deployments that only set `REDIS_URL` continue to work because `BULLMQ_REDIS_URL` falls back to `REDIS_URL`.
