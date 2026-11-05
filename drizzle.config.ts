import { defineConfig } from "drizzle-kit";

// Charge .env s'il existe (Node 24) ; « pnpm db:generate » n'a pas besoin de base de données.
try {
  process.loadEnvFile(".env");
} catch {
  // pas de fichier .env : rien à faire
}

// drizzle-kit compare le schéma TypeScript (src/db/schema) aux migrations existantes et écrit
// la différence en SQL dans src/db/migrations. Ces fichiers SQL sont commités et relus en PR.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? "" },
  strict: true,
  verbose: true,
});
