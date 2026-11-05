// Extension .mts : indique à Node et à Vite que ce fichier est un module ES (import/export),
// sans avoir à passer tout le projet en "type": "module".
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Trois familles de tests Vitest, lancées séparément :
// - unit : règles métier et fonctions pures (rapides, sans navigateur ni base) ;
// - components : composants React dans un faux navigateur (jsdom) ;
// - integration : avec un vrai PostgreSQL lancé dans Docker (Testcontainers), plus lents.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Même raccourci que dans tsconfig.json : "@/domain/…" = "src/domain/…".
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./tests/setup/components.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Le premier lancement télécharge l'image PostgreSQL : on laisse du temps.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/README.md"],
      reporter: ["text", "html", "lcov"],
      // Exigence du cahier technique : au moins 90 % du dossier domain/ couvert par les tests.
      // En dessous, la commande échoue (et donc la CI).
      thresholds: {
        "src/domain/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
