// Configuración de Vite sin dependencias de Lovable.
// Equivale a lo que hacía @lovable.dev/vite-tanstack-config fuera del sandbox de Lovable:
// Tailwind, alias de tsconfig, TanStack Start, Nitro (preset Cloudflare Workers) y React.
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Redirige la entrada de servidor a src/server.ts (envoltorio de errores SSR).
        server: { entry: "server" },
        importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
      }),
      ...(command === "build" ? [nitro({
        preset: "cloudflare-module",
        compatibilityDate: "2026-10-01",
        cloudflare: {
          nodeCompat: true,
          deployConfig: true,
          wrangler: {
            name: "medusa-v",
            // Valores públicos (también van en el cliente). La clave secreta se define como Secret en Cloudflare.
            vars: {
              SUPABASE_URL: "https://wrldlvrqboznwvydetrw.supabase.co",
              SUPABASE_PUBLISHABLE_KEY: "sb_publishable_64DR8K0abKzBO5gjEHFfjw_1Ud4edNl",
            },
          },
        },
      })] : []),
      viteReact(),
    ],
  };
});
