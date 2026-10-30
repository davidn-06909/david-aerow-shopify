import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import netlifyReactRouter from "@netlify/vite-plugin-react-router";
const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;
const netlifyBuild = process.env.NETLIFY === "true" || process.env.DEPLOY_TARGET === "netlify";
export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths(), ...(netlifyBuild ? [netlifyReactRouter()] : [])],
  server: { host: "127.0.0.1", port: Number(process.env.PORT || 3000), allowedHosts: [host], fs: { allow: ["."] } },
  build: { assetsInlineLimit: 0 },
});
