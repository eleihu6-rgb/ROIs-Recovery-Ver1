# PBS Overseas Deployment Cache Headers

## Goal

Reduce overseas first-load and repeat-load latency for `pbs-portal` without serving stale HTML.

## Required Headers

For `index.html`:

```http
Cache-Control: no-cache
```

For hashed Vite assets under `/fpqe/pbs/assets/`:

```http
Cache-Control: public, max-age=31536000, immutable
```

For images and Help screenshots:

```http
Cache-Control: public, max-age=86400
```

Use a longer value only when filenames are content-hashed or versioned.

## API

For PBS API JSON:

```http
Cache-Control: private, no-cache
```

Only use `ETag` for user-specific stable GET responses. Never cache authenticated API responses as public.

## Verification

Run:

```bash
curl -I https://<host>/fpqe/pbs/
curl -I https://<host>/fpqe/pbs/assets/<hashed-file>.js
curl -I https://<host>/api/bidding-calendar/current
```

Expected:

- HTML is revalidated.
- Hashed assets are immutable.
- API is private and never public.
