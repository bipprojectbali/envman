#!/usr/bin/env bun
/**
 * Standalone CLI entry point for the database migrator.
 * Core logic lives in src/lib/migrate.ts — safe to copy to other projects.
 *
 * Usage:
 *   bun scripts/migrate.ts
 *   DATABASE_URL=... bun scripts/migrate.ts
 *   MIGRATE_DATABASE_URL=... MIGRATIONS_DIR=./prisma/migrations bun scripts/migrate.ts
 */

import { runMigrations } from "../src/lib/migrate"

runMigrations().catch(err => {
  console.error("✗ Migration failed:", err?.message ?? String(err))
  process.exit(1)
})
