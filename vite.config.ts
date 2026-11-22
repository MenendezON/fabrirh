import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Configuration autonome (plus aucune dépendance à Lovable).
 *  - Hébergement : Nitro choisit tout seul la cible selon l'environnement de build
 *    (Vercel : VERCEL=1, Netlify : NETLIFY=true) ; ailleurs, serveur Node dans .output/.
 *    Pour forcer une cible : NITRO_PRESET=vercel | netlify | node-server.
 *  - Ne jamais compresser dans le code : l'hébergeur compresse déjà les réponses.
 *  - Ne pas déclarer ssr.external : la fonction serveur doit embarquer ses dépendances.
 */
export default defineConfig(({ command, mode }) => {
  // En développement, rend le .env visible côté serveur (process.env), comme en production.
  if (command === "serve") {
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  return {
    server: { host: "::", port: 8080 },
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      // Redirige l'entrée serveur de TanStack Start vers src/server.ts (HTTPS, en-têtes, page d'erreur).
      tanstackStart({ server: { entry: "server" } }),
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
    ],
  };
});
