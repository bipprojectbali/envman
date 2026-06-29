/**
 * Integration tests untuk tabel test_migrate.
 *
 * Tujuan: memverifikasi bahwa migration 20260528070104_add_test_migrate berhasil
 * membuat tabel dengan semua tipe kolom (TEXT, INT, FLOAT, BOOLEAN, enum, JSONB,
 * TEXT[], nullable, timestamps) dan constraints (UNIQUE, INDEX) berfungsi benar.
 *
 * Jalankan:
 *   DATABASE_URL='postgresql://USER@localhost:5432/envman_test' bun test tests/integration/test_migrate_table.test.ts
 */

import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { cleanupTestData } from "../helpers";
import { prisma } from "../../src/lib/db";

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("test_migrate table — schema verification", () => {
  test("creates row with required fields only (defaults apply)", async () => {
    const row = await prisma.testMigrate.create({
      data: { label: "hello", slug: "hello-default" },
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/); // UUID
    expect(row.label).toBe("hello");
    expect(row.slug).toBe("hello-default");
    expect(row.count).toBe(0);             // default 0
    expect(row.score).toBeNull();          // nullable, no value
    expect(row.active).toBe(true);         // default true
    expect(row.kind).toBe("ALPHA");        // default ALPHA
    expect(row.meta).toBeNull();           // nullable JSON
    expect(row.tags).toEqual([]);          // default []
    expect(row.note).toBeNull();           // nullable
    expect(row.resolvedAt).toBeNull();     // nullable DateTime
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  test("creates row with all optional fields filled", async () => {
    const now = new Date();
    const row = await prisma.testMigrate.create({
      data: {
        label: "full row",
        slug: "full-row",
        count: 42,
        score: 3.14,
        active: false,
        kind: "GAMMA",
        meta: { version: 1, flags: ["a", "b"] },
        tags: ["migration", "test"],
        note: "testing all fields",
        resolvedAt: now,
      },
    });

    expect(row.count).toBe(42);
    expect(row.score).toBeCloseTo(3.14, 5);
    expect(row.active).toBe(false);
    expect(row.kind).toBe("GAMMA");
    expect(row.meta).toEqual({ version: 1, flags: ["a", "b"] });
    expect(row.tags).toEqual(["migration", "test"]);
    expect(row.note).toBe("testing all fields");
    expect(row.resolvedAt?.toISOString()).toBe(now.toISOString());
  });

  test("enforces UNIQUE constraint on slug", async () => {
    await prisma.testMigrate.create({ data: { label: "a", slug: "duplicate" } });

    let threw = false;
    try {
      await prisma.testMigrate.create({ data: { label: "b", slug: "duplicate" } });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("enum: accepts all three TestMigrateKind values", async () => {
    const kinds = ["ALPHA", "BETA", "GAMMA"] as const;
    for (const kind of kinds) {
      const row = await prisma.testMigrate.create({
        data: { label: kind, slug: `kind-${kind.toLowerCase()}`, kind },
      });
      expect(row.kind).toBe(kind);
    }
  });

  test("filters by boolean index (active)", async () => {
    await prisma.testMigrate.createMany({
      data: [
        { label: "active-1", slug: "active-1", active: true },
        { label: "active-2", slug: "active-2", active: true },
        { label: "inactive-1", slug: "inactive-1", active: false },
      ],
    });

    const active = await prisma.testMigrate.findMany({ where: { active: true } });
    const inactive = await prisma.testMigrate.findMany({ where: { active: false } });

    expect(active).toHaveLength(2);
    expect(inactive).toHaveLength(1);
  });

  test("filters by enum index (kind)", async () => {
    await prisma.testMigrate.createMany({
      data: [
        { label: "a1", slug: "a1", kind: "ALPHA" },
        { label: "a2", slug: "a2", kind: "ALPHA" },
        { label: "b1", slug: "b1", kind: "BETA" },
      ],
    });

    const alphas = await prisma.testMigrate.findMany({ where: { kind: "ALPHA" } });
    const betas = await prisma.testMigrate.findMany({ where: { kind: "BETA" } });
    const gammas = await prisma.testMigrate.findMany({ where: { kind: "GAMMA" } });

    expect(alphas).toHaveLength(2);
    expect(betas).toHaveLength(1);
    expect(gammas).toHaveLength(0);
  });

  test("JSONB field: stores and retrieves nested data", async () => {
    const row = await prisma.testMigrate.create({
      data: { label: "with-meta", slug: "with-meta", meta: { env: "prod", level: 3 } },
    });

    const found = await prisma.testMigrate.findUniqueOrThrow({ where: { id: row.id } });
    expect((found.meta as any).env).toBe("prod");
    expect((found.meta as any).level).toBe(3);

    // Row without meta has null
    const noMeta = await prisma.testMigrate.create({ data: { label: "no-meta", slug: "no-meta" } });
    expect(noMeta.meta).toBeNull();
  });

  test("TEXT[] field: array operations work", async () => {
    await prisma.testMigrate.create({
      data: { label: "tagged", slug: "tagged", tags: ["alpha", "beta", "migration"] },
    });

    const row = await prisma.testMigrate.findUniqueOrThrow({ where: { slug: "tagged" } });
    expect(row.tags).toEqual(["alpha", "beta", "migration"]);
    expect(row.tags).toContain("migration");

    // Array contains filter
    const found = await prisma.testMigrate.findMany({
      where: { tags: { has: "beta" } },
    });
    expect(found).toHaveLength(1);

    const notFound = await prisma.testMigrate.findMany({
      where: { tags: { has: "gamma" } },
    });
    expect(notFound).toHaveLength(0);
  });

  test("updatedAt auto-updates on patch", async () => {
    const row = await prisma.testMigrate.create({ data: { label: "update-test", slug: "update-test" } });
    const t0 = row.updatedAt.getTime();

    // Small delay to ensure time advances
    await Bun.sleep(10);

    const updated = await prisma.testMigrate.update({
      where: { id: row.id },
      data: { count: 99 },
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(t0);
    expect(updated.count).toBe(99);
  });

  test("FLOAT field: stores and retrieves decimal precision", async () => {
    const row = await prisma.testMigrate.create({
      data: { label: "float-test", slug: "float-test", score: 98.765 },
    });
    expect(row.score).toBeCloseTo(98.765, 3);
  });

  test("count returns correct total", async () => {
    await prisma.testMigrate.createMany({
      data: [
        { label: "r1", slug: "r1" },
        { label: "r2", slug: "r2" },
        { label: "r3", slug: "r3" },
      ],
    });

    const total = await prisma.testMigrate.count();
    expect(total).toBe(3);
  });

  test("delete removes row permanently", async () => {
    const row = await prisma.testMigrate.create({ data: { label: "to-delete", slug: "to-delete" } });
    await prisma.testMigrate.delete({ where: { id: row.id } });

    const gone = await prisma.testMigrate.findUnique({ where: { id: row.id } });
    expect(gone).toBeNull();
  });
});
