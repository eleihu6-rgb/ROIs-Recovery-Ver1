import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const resolveNumber = (rawValue: string | undefined, fallback: number) => {
  const parsedValue = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const resolveString = (rawValue: string | undefined, fallback: string) => {
  const trimmedValue = rawValue?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : fallback;
};

const redirectPbsBaseTrailingSlash = (): Plugin => ({
  name: "pbs-base-trailing-slash",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const requestUrl = request.url ?? "";
      const requestPath = requestUrl.split("?")[0] ?? "";
      const search = requestUrl.includes("?") ? `?${requestUrl.split("?")[1]}` : "";
      const host = request.headers.host;
      const forwardedProto = request.headers["x-forwarded-proto"];

      if (
        (requestPath === "/pbs" || requestPath.startsWith("/pbs/"))
        && host === "cr.rois.one"
        && forwardedProto === "http"
      ) {
        const targetPath = requestPath === "/pbs" ? "/pbs/" : requestPath;
        response.statusCode = 301;
        response.setHeader("Location", `https://${host}${targetPath}${search}`);
        response.end();
        return;
      }

      if (request.url === "/pbs") {
        response.statusCode = 302;
        response.setHeader("Location", "/pbs/");
        response.end();
        return;
      }

      next();
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devHost = resolveString(env.PBS_PORTAL_DEV_HOST, "0.0.0.0");
  const devPort = resolveNumber(env.PBS_PORTAL_DEV_PORT, 3030);
  const apiProxyTarget = resolveString(
    env.PBS_PORTAL_API_PROXY_TARGET,
    "http://localhost:3002",
  );
  // Override with VITE_BASE=/pbs/ for other deployment environments.
  const base = resolveString(env.VITE_BASE, "/pbs/");

  return {
    base,
    plugins: [redirectPbsBaseTrailingSlash(), react(), tailwindcss()],
    server: {
      port: devPort,
      host: devHost,
      allowedHosts: true,
      proxy: {
        "/pbs/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/pbs\/api/, "/api"),
        },
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "query-vendor": ["@tanstack/react-query"],
            "http-vendor": ["axios"],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      globals: true,
      css: true,
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
    },
  };
});
