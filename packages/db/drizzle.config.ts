import { defineConfig } from "drizzle-kit";

/** Migrations are generated from src/schema.ts; hand-written SQL lives in custom migrations (see README). */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
