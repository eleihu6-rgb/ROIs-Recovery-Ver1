import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    // Local dev without git history (e.g. a stripped/uninitialized repo checkout).
    return "dev";
  }
})();
const buildTime = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
const versionTmpPath = path.resolve(__dirname, "../live-server/version.tmp");
const defaultVersionState = {
  backend: 230,
  frontend: 439,
  rule: 40,
  pbsBackend: 41,
  pbsFrontend: 86,
};

function readVersionState() {
  try {
    const raw = fs.readFileSync(versionTmpPath, "utf8");
    return { ...defaultVersionState, ...JSON.parse(raw) };
  } catch {
    return defaultVersionState;
  }
}

function writeVersionState(state: typeof defaultVersionState) {
  fs.mkdirSync(path.dirname(versionTmpPath), { recursive: true });
  fs.writeFileSync(versionTmpPath, `${JSON.stringify(state, null, 2)}\n`);
}

function appVersion() {
  const v = readVersionState();
  return `Ver:B${v.backend}/F${v.frontend}/R${v.rule}`;
}

function bumpFrontendVersion() {
  const v = readVersionState();
  const next = { ...v, frontend: Number(v.frontend ?? 0) + 1 };
  writeVersionState(next);
  return `Ver:B${next.backend}/F${next.frontend}/R${next.rule}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT) || 5566;
  const liveTarget = env.VITE_LIVE_TARGET || "http://127.0.0.1:3000";
  const ruleTarget = env.VITE_RULE_TARGET || "http://127.0.0.1:3001";
  const aiTarget = env.VITE_AI_TARGET || "http://127.0.0.1:3005";
  // API prefix — controls both the Vite dev proxy keys and the built-in api-paths.ts constants.
  // Override with VITE_API_PREFIX=dev for the dev deployment environment.
  const apiPrefix = (env.VITE_API_PREFIX || 'altair').replace(/^\/|\/$/g, '');
  // Base path for the app — override with VITE_BASE=/dev/gantt/ for the dev environment.
  const base = env.VITE_BASE || `/altair/`;

  // HMR: default to same-origin WS (works for direct access over http://host:port/).
  // Set VITE_HMR_PROTOCOL=wss + VITE_HMR_CLIENT_PORT=443 when serving via an HTTPS reverse proxy.
  const hmrProtocol = env.VITE_HMR_PROTOCOL; // 'ws' | 'wss' | undefined
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : undefined;
  const hmrHost = env.VITE_HMR_HOST;
  const hmr = hmrProtocol || hmrClientPort || hmrHost
    ? {
        ...(hmrProtocol ? { protocol: hmrProtocol as 'ws' | 'wss' } : {}),
        ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
        ...(hmrHost ? { host: hmrHost } : {}),
      }
    : undefined;

  const redirect = (req: { url?: string }, res: { writeHead(s: number, h: Record<string, string>): void; end(): void }, next: () => void) => {
    const withoutTrailing = base.replace(/\/$/, '');
    if (req.url === withoutTrailing) { res.writeHead(301, { Location: base }); res.end(); return; }
    next();
  };
  const trailingSlashRedirect = {
    name: 'trailing-slash-redirect',
    configureServer(server: import('vite').ViteDevServer) { server.middlewares.use(redirect); },
    configurePreviewServer(server: import('vite').PreviewServer) { server.middlewares.use(redirect); },
  };
  const runtimeVersionPlugin = {
    name: 'rois-runtime-version',
    handleHotUpdate(ctx: import('vite').HmrContext) {
      if (ctx.file.includes('version.tmp')) return
      const nextVersion = bumpFrontendVersion()
      ctx.server.ws.send({
        type: 'custom',
        event: 'rois-version:update',
        data: { appVersion: nextVersion },
      })
    },
  };

  return {
  base,
  plugins: [react(), tailwindcss(), trailingSlashRedirect, runtimeVersionPlugin],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@dnd-kit')) {
            return 'dnd'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(`${commitHash} @ ${buildTime}`),
    __ROIS_APP_VERSION__: JSON.stringify(appVersion()),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      // Serve @rois/ui from source (like pbs-portal's node_modules symlink) so
      // packages/ui edits take effect without re-installing the file: copy.
      '@rois/ui/globals.css': path.resolve(__dirname, '../packages/ui/src/styles/globals.css'),
      '@rois/ui': path.resolve(__dirname, '../packages/ui/src'),
      // Same source-serve pattern for shared-rules so package edits take effect.
      '@rois/shared-rules': path.resolve(__dirname, '../packages/shared-rules/src'),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port,
    strictPort: true,
    host: true,
    allowedHosts: true,
    hmr,
    // 本地开发：与生产 nginx 一致的前缀，转发到本机后端（否则浏览器请求 Vite 会得到 404）
    proxy: {
      "/api/mobile-roster": {
        target: liveTarget,
        changeOrigin: true,
      },
      [`/${apiPrefix}/live`]: {
        target: liveTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(new RegExp(`^\\/${apiPrefix}\\/live`), ""),
        ws: true,
      },
      [`/${apiPrefix}/rule`]: {
        target: ruleTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(new RegExp(`^\\/${apiPrefix}\\/rule`), ""),
      },
      // ai-server routes are under /ai (e.g. /ai/chat), so rewrite /<prefix>/ai -> /ai
      [`/${apiPrefix}/ai`]: {
        target: aiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(new RegExp(`^\\/${apiPrefix}\\/ai`), "/ai"),
      },
    },
  },
  // `vite preview` serves the production build (dist/) as static assets. It does NOT use
  // server.proxy, so mirror the same /<prefix>/* → backend proxies here; otherwise the prod
  // build's API calls 404 (flair routes ALL of flair.rois.cloud → this vite, which must
  // proxy /<prefix>/live → live-server itself). Lets us serve a prod build behind the tunnel.
  preview: {
    port,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      "/api/mobile-roster": { target: liveTarget, changeOrigin: true },
      [`/${apiPrefix}/live`]: { target: liveTarget, changeOrigin: true, rewrite: (p) => p.replace(new RegExp(`^\\/${apiPrefix}\\/live`), ""), ws: true },
      [`/${apiPrefix}/rule`]: { target: ruleTarget, changeOrigin: true, rewrite: (p) => p.replace(new RegExp(`^\\/${apiPrefix}\\/rule`), "") },
      [`/${apiPrefix}/ai`]: { target: aiTarget, changeOrigin: true, rewrite: (p) => p.replace(new RegExp(`^\\/${apiPrefix}\\/ai`), "/ai") },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  };
});
