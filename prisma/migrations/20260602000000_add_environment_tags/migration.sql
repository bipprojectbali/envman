-- Environment tags untuk filter dan grouping
ALTER TABLE "environment" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
