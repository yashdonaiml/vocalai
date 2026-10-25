import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode, command }) => {
  // Server settings stay in Node. Only VITE_* variables are exposed to the browser.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [name, value] of Object.entries(env)) if (process.env[name] === undefined) process.env[name] = value;
  return {
    resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"] },
    server: { host: "127.0.0.1", port: 3000, strictPort: true },
    plugins: [tailwindcss(), tanstackStart({ server: { entry: "server" }, importProtection: { behavior: "error" } }), ...(command === "build" ? [nitro({ preset: "node-server" })] : []), react()],
  };
});
