# GitNexus Integration Design

**Date:** 2026-07-01  
**Status:** Approved  
**Scope:** Deploy GitNexus (code knowledge graph) for the rois-ai monorepo — shared web UI + MCP server for Claude Code

---

## Goals

1. **Shared web UI** accessible at `https://crew-f8-usva-sit.roiscloud.com/gitnexus` — team members can explore the rois-ai knowledge graph (dependency chains, call graphs, cross-module references) without any local setup.
2. **MCP server** wired into Claude Code via `.claude/settings.json` — future dev sessions in rois-ai gain 16 graph-query tools (`gitnexus_query`, `gitnexus_impact`, `gitnexus_context`, etc.) for precise blast-radius analysis and refactoring support.
3. **Full monorepo indexing** — all 15+ modules (gantt, live-server, rule-engine, pbs-server, engine-server, etc.) indexed so cross-module impact analysis works.

---

## Architecture

```
Browser
  └─→ nginx 10.15.12.2:443 (crew-f8-usva-sit.roiscloud.com)
        ├─ /gitnexus/        → static files  /home/yuan.z/rois/dev/gitnexus/
        └─ /gitnexus-api/    → proxy → 127.0.0.1:4747 (gitnexus serve)

10.15.12.2 (dev/nginx machine):
  /home/yuan.z/rois/gitnexus-src/    ← cloned repo + build workspace
    gitnexus/                         ← CLI package (built + npm link)
    gitnexus-web/                     ← SPA package (Vite build)
  /home/yuan.z/rois/dev/gitnexus/    ← built SPA static files (served by nginx)
  pm2: gitnexus-serve                 ← `gitnexus serve --port 4747` (localhost only)
  ~/.gitnexus/registry.json           ← index of rois-ai monorepo

Claude Code sessions in rois-ai:
  .claude/settings.json → mcpServers.gitnexus → `gitnexus mcp` (stdio)
                                               → reads ~/.gitnexus/registry.json
```

**Data flow:**
- Browser loads SPA from `/gitnexus/` (nginx static)
- SPA makes API calls to `/gitnexus-api/...` (same origin) → nginx proxies → port 4747
- Claude Code spawns `gitnexus mcp` as a stdio child process; MCP reads the local index

---

## Components

### 1. Source repo

Clone `https://github.com/abhigyanpatwari/GitNexus.git` to `/home/yuan.z/rois/gitnexus-src/`.

Relevant subdirectories:
- `gitnexus/` — CLI + HTTP server (Express, port 4747 default)
- `gitnexus-web/` — React 19 + Vite SPA, Sigma.js visualization

### 2. CLI build & global link

```bash
cd /home/yuan.z/rois/gitnexus-src/gitnexus
npm ci && npm run build
npm link   # makes `gitnexus` available in PATH system-wide
```

### 3. Web UI patch

`gitnexus serve` and the web UI were designed to co-deploy on the same origin. When the SPA is served via nginx at `/gitnexus/` and the API is proxied at `/gitnexus-api/`, the SPA's default server URL (`window.location.origin`) misses the `/gitnexus-api` path prefix.

**Patch** — `gitnexus-web/src/App.tsx`, change one line:

```diff
- const serverUrl = serverUrlParam || window.location.origin;
+ const serverUrl = serverUrlParam
+   || (import.meta.env.VITE_GITNEXUS_API_URL
+       ? window.location.origin + import.meta.env.VITE_GITNEXUS_API_URL
+       : window.location.origin);
```

**Build:**
```bash
cd /home/yuan.z/rois/gitnexus-src/gitnexus-web
VITE_GITNEXUS_API_URL=/gitnexus-api npm run build
```

The `?server=` query-param override still works unchanged — useful for pointing at a different index.

### 4. Static file deployment

```bash
rsync -a --delete \
  /home/yuan.z/rois/gitnexus-src/gitnexus-web/dist/ \
  /home/yuan.z/rois/dev/gitnexus/
```

Follows the existing SIT convention (`/home/yuan.z/rois/dev/<app>/`).

### 5. Monorepo indexing

```bash
gitnexus analyze /home/yuan.z/rois/rois-ai
```

Stores index in `~/.gitnexus/` (gitignored by GitNexus). Re-run after major cross-module refactors. Typical first-run time: several minutes for the full monorepo.

### 6. pm2 service

```bash
pm2 start "gitnexus serve --port 4747" --name gitnexus-serve
pm2 save
```

Binds to `127.0.0.1:4747` (localhost only — nginx proxies, port never exposed externally).

### 7. nginx `gitnexus.conf`

File: `/home/yuan.z/rois/conf.d/gitnexus.conf`  
Contains **only location blocks** (no server block). Included from within the existing `crew-f8-usva-sit.roiscloud.com` server block.

```nginx
# ── GitNexus Web UI ──────────────────────────────────────────────────────────
location = /gitnexus { return 301 /gitnexus/; }

location ^~ /gitnexus/assets/ {
    alias /home/yuan.z/rois/dev/gitnexus/assets/;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000, immutable";
}

location ^~ /gitnexus/ {
    alias /home/yuan.z/rois/dev/gitnexus/;
    index index.html;
    try_files $uri $uri/ /gitnexus/index.html;
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}

# ── GitNexus API (gitnexus serve :4747) ──────────────────────────────────────
location ^~ /gitnexus-api/ {
    proxy_pass http://127.0.0.1:4747/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

**One line added to `f8-sit.conf`** (before closing `}`):
```nginx
    include /home/yuan.z/rois/conf.d/gitnexus.conf;
```

### 8. Claude Code MCP

File: `/home/yuan.z/rois/rois-ai/.claude/settings.json`

Add (merge with any existing content):
```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "gitnexus",
      "args": ["mcp"]
    }
  }
}
```

Requires `gitnexus` to be in PATH (satisfied by `npm link` in step 2). The MCP server reads `~/.gitnexus/registry.json` which is populated by `gitnexus analyze`.

---

## Update / re-deploy workflow

```bash
# Pull latest GitNexus and rebuild
cd /home/yuan.z/rois/gitnexus-src
git pull
cd gitnexus && npm ci && npm run build && npm link
cd ../gitnexus-web
VITE_GITNEXUS_API_URL=/gitnexus-api npm run build
rsync -a --delete dist/ /home/yuan.z/rois/dev/gitnexus/
pm2 restart gitnexus-serve

# Re-index after large refactors
gitnexus analyze /home/yuan.z/rois/rois-ai
pm2 restart gitnexus-serve
```

---

## Out of scope

- Authentication / access control on the `/gitnexus/` and `/gitnexus-api/` endpoints (internal network only)
- Automated re-indexing on git push (can be added as a post-receive hook later)
- Indexing other repos (pbs-app, pbs-portal) — monorepo-only for now
