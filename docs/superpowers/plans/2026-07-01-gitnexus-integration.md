# GitNexus Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy GitNexus on 10.15.12.2 so the rois-ai knowledge graph is accessible at `https://crew-f8-usva-sit.roiscloud.com/gitnexus` and Claude Code gains 16 MCP graph-query tools in rois-ai sessions.

**Architecture:** Clone GitNexus to `/home/yuan.z/rois/gitnexus-src/`, build CLI + SPA, run `gitnexus serve` on port 4747 via pm2, serve built SPA as nginx static files, proxy `/gitnexus-api/` → port 4747 via a standalone `gitnexus.conf` included in the existing `crew-f8-usva-sit.roiscloud.com` server block.

**Tech Stack:** Node.js 22, npm, GitNexus CLI + Express HTTP server, React 19 + Vite SPA, pm2, nginx, Claude Code MCP (stdio).

## Global Constraints

- All static files for SIT environment live under `/home/yuan.z/rois/dev/<app>/` — deploy to `/home/yuan.z/rois/dev/gitnexus/`
- nginx location blocks for gitnexus live in `/home/yuan.z/rois/conf.d/gitnexus.conf` (no server block — just location blocks)
- `gitnexus serve` binds to `127.0.0.1:4747` — never exposed directly, always behind nginx
- `normalizeServerUrl()` in the web UI strips a trailing `/api` suffix — safe for `/gitnexus-api` (ends in `-api`, not `/api`)
- App.tsx auto-connect fires only when `?server=`, `?project=`, or env-var default is present — patch must also remove the early-return guard
- Web UI env var: `VITE_GITNEXUS_API_URL=/gitnexus-api` (set at build time)
- MCP config file: `rois-ai/.claude/settings.json` (already exists with plugin config — must merge, not overwrite)

---

### Task 1: Clone repo, build CLI, install pm2

**Files:**
- Create: `/home/yuan.z/rois/gitnexus-src/` (via git clone)

**Interfaces:**
- Produces: `gitnexus` binary in PATH (via `npm link`); `pm2` binary in PATH

- [ ] **Step 1: Verify port 4747 is free**

```bash
ss -tlnp | grep 4747 && echo "PORT IN USE — stop the process first" || echo "port 4747 free"
```
Expected: `port 4747 free`

- [ ] **Step 2: Clone GitNexus**

```bash
git clone https://github.com/abhigyanpatwari/GitNexus.git /home/yuan.z/rois/gitnexus-src
```
Expected: directory `/home/yuan.z/rois/gitnexus-src/gitnexus/` exists.

- [ ] **Step 3: Install CLI dependencies and build**

```bash
cd /home/yuan.z/rois/gitnexus-src/gitnexus
npm ci
npm run build
```
Expected: `dist/cli/index.js` exists after build.

```bash
ls dist/cli/index.js && echo "CLI build OK"
```

- [ ] **Step 4: Link CLI globally**

```bash
cd /home/yuan.z/rois/gitnexus-src/gitnexus
npm link
```

- [ ] **Step 5: Verify gitnexus is in PATH**

```bash
which gitnexus && gitnexus --version
```
Expected: prints a version string. If `command not found`, check that `$(npm root -g)/../bin` is in `$PATH`.

- [ ] **Step 6: Install pm2 globally**

```bash
npm install -g pm2
pm2 --version
```
Expected: pm2 version string (e.g. `5.x.x`).

- [ ] **Step 7: Commit marker**

No code changes to commit — this task is infrastructure only. Proceed to Task 2.

---

### Task 2: Patch App.tsx and build web UI

**Files:**
- Modify: `/home/yuan.z/rois/gitnexus-src/gitnexus-web/src/App.tsx` (3 additions + 1 modification)
- Create: `/home/yuan.z/rois/dev/gitnexus/` (deploy target)

**Interfaces:**
- Consumes: cloned repo from Task 1
- Produces: built SPA at `/home/yuan.z/rois/dev/gitnexus/` auto-connecting to `/gitnexus-api` on load

- [ ] **Step 1: Find the exact lines to patch in App.tsx**

```bash
grep -n "serverUrlParam\|window.location.origin\|projectParam.*return" \
  /home/yuan.z/rois/gitnexus-src/gitnexus-web/src/App.tsx | head -20
```

Expected output will show two target lines:
1. `if (!serverUrlParam && !projectParam) return;`
2. `const serverUrl = serverUrlParam || window.location.origin;`

Note the line numbers from the output — use them in the next step.

- [ ] **Step 2: Apply the patch**

Open `/home/yuan.z/rois/gitnexus-src/gitnexus-web/src/App.tsx`.

Find the block (line numbers from Step 1):
```typescript
if (!serverUrlParam && !projectParam) return;
autoConnectRan.current = true;
```

Replace with:
```typescript
const defaultServerUrl = import.meta.env.VITE_GITNEXUS_API_URL
  ? window.location.origin + import.meta.env.VITE_GITNEXUS_API_URL
  : null;
if (!serverUrlParam && !projectParam && !defaultServerUrl) return;
autoConnectRan.current = true;
```

Then find:
```typescript
const serverUrl = serverUrlParam || window.location.origin;
```

Replace with:
```typescript
const serverUrl = serverUrlParam || defaultServerUrl || window.location.origin;
```

- [ ] **Step 3: Verify patch looks correct**

```bash
grep -n "defaultServerUrl\|VITE_GITNEXUS_API_URL\|serverUrl = " \
  /home/yuan.z/rois/gitnexus-src/gitnexus-web/src/App.tsx
```

Expected: 3 lines — the `defaultServerUrl` declaration, the updated guard, and the updated `serverUrl` assignment.

- [ ] **Step 4: Install web UI dependencies**

```bash
cd /home/yuan.z/rois/gitnexus-src/gitnexus-web
npm ci
```

- [ ] **Step 5: Build the web UI with the API URL env var**

```bash
cd /home/yuan.z/rois/gitnexus-src/gitnexus-web
VITE_GITNEXUS_API_URL=/gitnexus-api npm run build
```

Expected: `dist/index.html` exists.

```bash
ls dist/index.html && echo "Web UI build OK"
```

- [ ] **Step 6: Verify env var was baked into the bundle**

```bash
grep -r "gitnexus-api" /home/yuan.z/rois/gitnexus-src/gitnexus-web/dist/assets/*.js | head -3
```

Expected: at least one match showing the `/gitnexus-api` string is embedded in the JS bundle.

- [ ] **Step 7: Create deploy directory and rsync**

```bash
mkdir -p /home/yuan.z/rois/dev/gitnexus
rsync -a --delete \
  /home/yuan.z/rois/gitnexus-src/gitnexus-web/dist/ \
  /home/yuan.z/rois/dev/gitnexus/
ls /home/yuan.z/rois/dev/gitnexus/index.html && echo "Deploy OK"
```

- [ ] **Step 8: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add -A  # nothing to stage in rois-ai; the gitnexus-src changes are outside the repo
```

No rois-ai source changed in this task. Proceed to Task 3.

---

### Task 3: Index rois-ai and start pm2 service

**Files:**
- Creates: `~/.gitnexus/registry.json` (outside repo, not committed)

**Interfaces:**
- Consumes: `gitnexus` CLI from Task 1
- Produces: running `gitnexus serve` at `http://127.0.0.1:4747`; indexed rois-ai knowledge graph

- [ ] **Step 1: Run the full monorepo index**

This takes several minutes for 15+ modules. Run in a terminal you can leave:

```bash
cd /home/yuan.z/rois/rois-ai
gitnexus analyze
```

Expected: progress output per module (gantt, live-server, rule-engine, pbs-server, etc.), ends with a summary. No errors.

- [ ] **Step 2: Verify the index was created**

```bash
cat ~/.gitnexus/registry.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('Repos indexed:', len(d.get('repos', d.get('projects', []))))"
```

Expected: `Repos indexed: 1` (or similar — registry format may vary).

- [ ] **Step 3: Start gitnexus-serve via pm2**

```bash
pm2 start "gitnexus serve --port 4747" --name gitnexus-serve
pm2 list
```

Expected: `gitnexus-serve` appears in the list with status `online`.

- [ ] **Step 4: Verify serve is responding on localhost**

```bash
curl -s http://127.0.0.1:4747/ | head -20
```

Expected: some JSON or HTML response (not a connection refused). Note the actual response for reference — it tells you the root path of the serve API.

- [ ] **Step 5: Persist pm2 across reboots**

```bash
pm2 save
pm2 startup
```

`pm2 startup` prints a command to run with sudo — copy and run it:
```bash
# Run the command pm2 startup printed, e.g.:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u yuan.z --hp /home/yuan.z
```

- [ ] **Step 6: No rois-ai source changes — proceed to Task 4**

---

### Task 4: Write nginx gitnexus.conf and reload

**Files:**
- Create: `/home/yuan.z/rois/conf.d/gitnexus.conf`
- Modify: `/home/yuan.z/rois/conf.d/f8-sit.conf` (add 1 line before closing `}`)

**Interfaces:**
- Consumes: static files from Task 2 at `/home/yuan.z/rois/dev/gitnexus/`; pm2 service from Task 3 at `127.0.0.1:4747`
- Produces: `https://crew-f8-usva-sit.roiscloud.com/gitnexus/` serving the SPA; `https://crew-f8-usva-sit.roiscloud.com/gitnexus-api/` proxying to port 4747

- [ ] **Step 1: Write gitnexus.conf**

Create `/home/yuan.z/rois/conf.d/gitnexus.conf` with this exact content:

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

- [ ] **Step 2: Add include line to f8-sit.conf**

Open `/home/yuan.z/rois/conf.d/f8-sit.conf`. The file ends with:
```nginx
    }
}
```
(the inner `}` closes the last location block, the outer `}` closes the server block)

Add the include line **before the final closing `}`**:
```nginx
    include /home/yuan.z/rois/conf.d/gitnexus.conf;
}
```

Verify the end of the file looks like:
```nginx
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    include /home/yuan.z/rois/conf.d/gitnexus.conf;
}
```

- [ ] **Step 3: Test nginx config**

```bash
sudo nginx -t
```

Expected:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If this fails, check `/home/yuan.z/rois/conf.d/gitnexus.conf` for syntax errors (missing semicolons, wrong alias paths).

- [ ] **Step 4: Reload nginx**

```bash
sudo nginx -s reload
```

Expected: no output (success). If there's an error, check `sudo journalctl -u nginx --no-pager -n 20`.

- [ ] **Step 5: Verify SPA is accessible**

```bash
curl -sk https://crew-f8-usva-sit.roiscloud.com/gitnexus/ | grep -o "<title>.*</title>"
```

Expected: `<title>GitNexus</title>` (or similar — the HTML title of the SPA).

- [ ] **Step 6: Verify API proxy is reachable**

```bash
curl -sk https://crew-f8-usva-sit.roiscloud.com/gitnexus-api/ | head -20
```

Expected: same response as `curl http://127.0.0.1:4747/` from Task 3 Step 4 — confirms nginx is correctly stripping `/gitnexus-api/` and forwarding to port 4747.

- [ ] **Step 7: Commit nginx configs**

```bash
cd /home/yuan.z/rois/rois-ai
# gitnexus.conf and f8-sit.conf changes are outside rois-ai (in /home/yuan.z/rois/conf.d/)
# Nothing to commit in rois-ai for this task
```

The conf files are not tracked by the rois-ai git repo. They live in `/home/yuan.z/rois/conf.d/` which is a separate directory. No commit needed.

---

### Task 5: Wire Claude Code MCP config

**Files:**
- Modify: `/home/yuan.z/rois/rois-ai/.claude/settings.json` (merge `mcpServers` key into existing JSON)

**Interfaces:**
- Consumes: `gitnexus` in PATH from Task 1; `~/.gitnexus/registry.json` from Task 3
- Produces: `gitnexus_query`, `gitnexus_impact`, `gitnexus_context`, `gitnexus_detect_changes`, and 12 more MCP tools available in rois-ai Claude Code sessions

- [ ] **Step 1: Check current settings.json content**

```bash
cat /home/yuan.z/rois/rois-ai/.claude/settings.json
```

Expected (current state):
```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true
  }
}
```

- [ ] **Step 2: Add mcpServers to settings.json**

Open `/home/yuan.z/rois/rois-ai/.claude/settings.json` and merge in the `mcpServers` key. The final file must be:

```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true
  },
  "mcpServers": {
    "gitnexus": {
      "command": "gitnexus",
      "args": ["mcp"]
    }
  }
}
```

- [ ] **Step 3: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('/home/yuan.z/rois/rois-ai/.claude/settings.json')); print('JSON valid')"
```

Expected: `JSON valid`

- [ ] **Step 4: Smoke-test the MCP server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
  | gitnexus mcp 2>/dev/null | head -1
```

Expected: a JSON line beginning with `{"jsonrpc":"2.0"` — confirms the MCP server starts and responds to the init handshake. If you get `command not found`, re-run `npm link` from Task 1.

- [ ] **Step 5: Commit the settings.json change**

```bash
cd /home/yuan.z/rois/rois-ai
git add .claude/settings.json
git commit -m "chore: wire gitnexus MCP server into Claude Code settings

Enables 16 graph-query tools (gitnexus_query, gitnexus_impact, etc.)
in rois-ai Claude Code sessions. Requires gitnexus CLI in PATH
(npm link from /home/yuan.z/rois/gitnexus-src/gitnexus).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification

No new files. Confirm the full stack works together.

- [ ] **Step 1: Open the web UI in a browser**

Navigate to: `https://crew-f8-usva-sit.roiscloud.com/gitnexus/`

Expected:
- GitNexus UI loads without a blank screen or JS errors in DevTools console
- The UI automatically connects to the backend (no manual `?server=` needed)
- The rois-ai project appears in the project list / graph view

If the UI loads but doesn't auto-connect, check the browser console for the value of `VITE_GITNEXUS_API_URL` — if it's `undefined`, the build env var was not applied (re-run Task 2 Step 5).

- [ ] **Step 2: Verify redirect works**

```bash
curl -sk -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  https://crew-f8-usva-sit.roiscloud.com/gitnexus
```

Expected: `301 https://crew-f8-usva-sit.roiscloud.com/gitnexus/`

- [ ] **Step 3: Verify pm2 survives a restart test**

```bash
pm2 restart gitnexus-serve
pm2 list | grep gitnexus-serve
```

Expected: status `online` after restart.

- [ ] **Step 4: Verify MCP tools are available in a new Claude Code session**

Start a new Claude Code session in `/home/yuan.z/rois/rois-ai/`. Run:

```
/mcp
```

Expected: `gitnexus` appears in the MCP server list with its tools loaded.

---

## Re-deploy cheatsheet (for future updates)

```bash
# Pull + rebuild CLI
cd /home/yuan.z/rois/gitnexus-src/gitnexus && git pull && npm ci && npm run build && npm link

# Rebuild + redeploy web UI
cd /home/yuan.z/rois/gitnexus-src/gitnexus-web
git pull
VITE_GITNEXUS_API_URL=/gitnexus-api npm run build
rsync -a --delete dist/ /home/yuan.z/rois/dev/gitnexus/

# Re-index after large refactors
gitnexus analyze /home/yuan.z/rois/rois-ai
pm2 restart gitnexus-serve
```
