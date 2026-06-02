-- Environment tags untuk filter dan grouping
ALTER TABLE "Environment" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
