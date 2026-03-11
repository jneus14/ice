import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
// Load .env.local for local dev only — on Railway env vars are injected directly
const envPath = resolve(__dirname, ".env.local");
if (existsSync(envPath)) config({ path: envPath, override: true });

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
