import path from "node:path";
import { defineConfig, loadEnv } from "vite";
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
    plugins: [react(), tailwindcss()],
    server: {
      port: devPort,
      host: devHost,
      allowedHosts: true,
      proxy: {
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
