/**
 * FBV full-stack audit — integration suite against the REAL dev database.
 * Verifies auth guards, CRUD round-trips, bulk idempotency, atomic doc
 * numbering, profile/settings persistence, export/import, seedIfEmpty,
 * large payloads, unicode, and empty-collection edge cases.
 * afterAll leaves the DB EMPTY (entities + kv + AUD-TST sequences).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { appRouter } from "./router";
import { COLLECTIONS } from "./data-router";
import { getDb } from "./queries/connection";
import * as schema from "@db/schema";
import { eq, like } from "drizzle-orm";
import type { User } from "@db/schema";

const adminUser = {
  id: 1,
  unionId: "audit",
  name: "Audit Bot",
  email: null,
  avatar: null,
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignInAt: new Date(),
} as unknown as User;

const authCtx = {
  req: new Request("http://audit.local"),
  resHeaders: new Headers(),
  user: adminUser,
};
const anonCtx = { req: new Request("http://audit.local"), resHeaders: new Headers() };

const authed = appRouter.createCaller(authCtx);
const anon = appRouter.createCaller(anonCtx);

const AUDIT_PREFIX = "AUD-TST";

/** Snapshot of pre-existing kv rows so cleanup can restore/absent them. */
let preProfile: unknown = null;
let preSettings: unknown = null;

function expectUnauthorized(p: Promise<unknown>) {
  return expect(p).rejects.toSatisfy(
    (e) => e instanceof TRPCClientError && e.data?.code === "UNAUTHORIZED" ||
      (e as { code?: string }).code === "UNAUTHORIZED" ||
      String(e).includes("UNAUTHORIZED"),
  );
}

beforeAll(async () => {
  const state = await authed.data.getState();
  preProfile = state.profile;
  preSettings = state.settings;
});

describe("1. auth guard", () => {
  it("rejects unauthenticated data.getState with UNAUTHORIZED", async () => {
    await expectUnauthorized(anon.data.getState());
  });
  it("rejects unauthenticated data.upsert with UNAUTHORIZED", async () => {
    await expectUnauthorized(
      anon.data.upsert({ collection: "clients", item: { id: "audit-x" } }),
    );
  });
  it("rejects unauthenticated bulkUpsert/remove/exportAll/importAll/seedIfEmpty/nextDocNumber", async () => {
    await expectUnauthorized(anon.data.bulkUpsert({ collection: "clients", items: [] }));
    await expectUnauthorized(anon.data.remove({ collection: "clients", id: "x" }));
    await expectUnauthorized(anon.data.exportAll());
    await expectUnauthorized(anon.data.importAll({ dump: { entities: {} } }));
    await expectUnauthorized(anon.data.seedIfEmpty({ dump: { entities: {} } }));
    await expectUnauthorized(anon.data.nextDocNumber({ prefix: AUDIT_PREFIX, year: 2026 }));
  });
  it("allows ping without auth (publicQuery)", async () => {
    const res = await anon.ping();
    expect(res.ok).toBe(true);
  });
});

describe("7. seedIfEmpty semantics (runs first while table state is known)", () => {
  it("seeds an empty entities table, then second call is a no-op", async () => {
    const stats = await authed.data.stats();
    // If DB is not empty we cannot test the 'seeds' branch; assert accordingly.
    const dump = {
      entities: {
        clients: [{ id: "audit-seed-1", name: "Seed Co", nested: { a: [1, 2] } }],
      },
    };
    const first = await authed.data.seedIfEmpty({ dump });
    if (stats.entityCount === 0) {
      expect(first.seeded).toBe(true);
      const list = await authed.data.list({ collection: "clients" });
      expect(list).toEqual([{ id: "audit-seed-1", name: "Seed Co", nested: { a: [1, 2] } }]);
    } else {
      expect(first.seeded).toBe(false);
    }
    const before = await authed.data.stats();
    const second = await authed.data.seedIfEmpty({
      dump: { entities: { clients: [{ id: "audit-seed-2" }] } },
    });
    expect(second.seeded).toBe(false);
    const after = await authed.data.stats();
    expect(after.entityCount).toBe(before.entityCount);
    // clean the seeded scratch row
    await authed.data.remove({ collection: "clients", id: "audit-seed-1" });
  });
});

describe("2. CRUD round-trip per collection", () => {
  const payload = {
    id: "", // set per collection
    name: "Acme 北京 🤝 Über-corp",
    amount: 12345.67,
    flag: true,
    nully: null,
    tags: ["a", "b", "日本語"],
    nested: { deep: { list: [1, 2, 3], obj: { k: "v" } } },
    unknownExtensionKey: { future: "field", arr: [{ x: 1 }] },
  };

  for (const collection of COLLECTIONS) {
    it(`round-trips ${collection}: create → read → update → delete`, async () => {
      const id = `audit-${collection}-1`;
      const item = { ...payload, id };
      await authed.data.upsert({ collection, item });

      const list1 = (await authed.data.list({ collection })) as Array<{ id: string }>;
      const found = list1.find((r) => r.id === id);
      expect(found).toEqual(item); // exact JSON round-trip incl. unknown keys

      const updated = { ...item, name: "Updated ✏️", extra: "new" };
      await authed.data.upsert({ collection, item: updated });
      const list2 = (await authed.data.list({ collection })) as Array<{ id: string }>;
      expect(list2.find((r) => r.id === id)).toEqual(updated);

      await authed.data.remove({ collection, id });
      const list3 = (await authed.data.list({ collection })) as Array<{ id: string }>;
      expect(list3.find((r) => r.id === id)).toBeUndefined();
    });
  }
});

describe("3. bulkUpsert idempotency", () => {
  it("50 items upserted twice → no duplicates, list length stable", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `audit-bulk-${i}`,
      idx: i,
      label: `Item ${i}`,
    }));
    const before = (await authed.data.list({ collection: "suppliers" })) as unknown[];
    const r1 = await authed.data.bulkUpsert({ collection: "suppliers", items });
    expect(r1.count).toBe(50);
    const mid = (await authed.data.list({ collection: "suppliers" })) as unknown[];
    expect(mid.length).toBe(before.length + 50);

    const r2 = await authed.data.bulkUpsert({ collection: "suppliers", items });
    expect(r2.count).toBe(50);
    const after = (await authed.data.list({ collection: "suppliers" })) as Array<{ id: string }>;
    expect(after.length).toBe(mid.length);
    const ids = after.filter((r) => r.id.startsWith("audit-bulk-")).map((r) => r.id);
    expect(new Set(ids).size).toBe(50);
  });

  it("empty bulkUpsert is a no-op returning count 0", async () => {
    const r = await authed.data.bulkUpsert({ collection: "risks", items: [] });
    expect(r.count).toBe(0);
  });
});

describe("4. doc numbering atomicity", () => {
  it("20 concurrent nextDocNumber calls → 20 unique sequential numbers, no gaps/dupes", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        authed.data.nextDocNumber({ prefix: AUDIT_PREFIX, year: 2026 }),
      ),
    );
    const values = results.map((r) => r.value).sort((a, b) => a - b);
    const numbers = results.map((r) => r.number);
    expect(new Set(values).size).toBe(20);
    expect(new Set(numbers).size).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(values[i]).toBe(i + 1); // 1..20 exactly — no gaps
      expect(numbers[i]).toMatch(/^AUD-TST2026-\d{3}$/);
    }
    const sortedNumbers = [...numbers].sort();
    expect(sortedNumbers[0]).toBe("AUD-TST2026-001");
    expect(sortedNumbers[19]).toBe("AUD-TST2026-020");
  });
});

describe("5. profile/settings persistence incl. extension keys", () => {
  it("updateProfile/updateSettings reflected by getState, unknown keys survive", async () => {
    const profile = {
      companyName: "Audit Corp 测试 🏢",
      registrationNo: "REG-001",
      customFutureField: { nested: ["x", 1, null] },
      anotherUnknown: "🎉",
    };
    const settings = {
      fiscalYear: 2026,
      docPrefixes: { quote: "FBV-QUO-" },
      experimentalToggle: true,
      weirdKey: { deep: { deeper: [1, "two", false] } },
    };
    await authed.data.updateProfile({ profile });
    await authed.data.updateSettings({ settings });
    const state = await authed.data.getState();
    expect(state.profile).toEqual(profile);
    expect(state.settings).toEqual(settings);
  });
});

describe("8. adversarial payloads", () => {
  it("dms entity with ~1.9MB base64 payload round-trips", async () => {
    const raw = Buffer.alloc(1_400_000, 7); // 1.4MB binary
    const b64 = raw.toString("base64"); // ≈1.87MB string
    const item = {
      id: "audit-dms-big",
      fileName: "big.bin",
      fileData: b64,
      meta: { size: raw.length },
    };
    await authed.data.upsert({ collection: "dms", item });
    const list = (await authed.data.list({ collection: "dms" })) as Array<{
      id: string;
      fileData?: string;
    }>;
    const found = list.find((r) => r.id === "audit-dms-big");
    expect(found?.fileData?.length).toBe(b64.length);
    expect(found?.fileData).toBe(b64);
    await authed.data.remove({ collection: "dms", id: "audit-dms-big" });
  }, 60_000);

  it("rejects upsert with missing id", async () => {
    await expect(
      authed.data.upsert({ collection: "clients", item: { name: "no id" } }),
    ).rejects.toThrow();
  });
});

describe("6. export/import round-trip", () => {
  it("exportAll → JSON stringify/parse → importAll → identical state", async () => {
    // Arrange: distinctive scratch data
    await authed.data.upsert({
      collection: "tenders",
      item: { id: "audit-exp-1", title: "Export Test عربي", nested: { q: [3, 2, 1] } },
    });
    await authed.data.updateProfile({ profile: { name: "RT", ext: { u: 1 } } });
    await authed.data.updateSettings({ settings: { theme: "dark", ext: [1, 2] } });

    const before = await authed.data.getState();
    const dump = await authed.data.exportAll();
    const roundTripped = JSON.parse(JSON.stringify(dump));
    await authed.data.importAll({ dump: roundTripped });
    const after = await authed.data.getState();

    // entity sets identical (order-insensitive per collection)
    for (const [col, items] of Object.entries(before.entities)) {
      const a = (items as Array<{ id: string }>).map((i) => i.id).sort();
      const b = ((after.entities[col] ?? []) as Array<{ id: string }>).map((i) => i.id).sort();
      expect(b).toEqual(a);
    }
    const beforeTender = (before.entities.tenders as Array<{ id: string }>).find(
      (t) => t.id === "audit-exp-1",
    );
    const afterTender = (after.entities.tenders as Array<{ id: string }>).find(
      (t) => t.id === "audit-exp-1",
    );
    expect(afterTender).toEqual(beforeTender);
    expect(after.profile).toEqual(before.profile);
    expect(after.settings).toEqual(before.settings);

    await authed.data.remove({ collection: "tenders", id: "audit-exp-1" });
  }, 180_000);
});

describe("10. clearAll (admin-only full wipe)", () => {
  const nonAdmin = appRouter.createCaller({
    req: new Request("http://audit.local"),
    resHeaders: new Headers(),
    user: { ...adminUser, role: "user" } as unknown as User,
  });

  it("rejects anonymous and non-admin callers", async () => {
    await expectUnauthorized(anon.data.clearAll({ includeProfile: false }));
    await expect(
      nonAdmin.data.clearAll({ includeProfile: false }),
    ).rejects.toSatisfy(
      (e) =>
        (e as { data?: { code?: string } }).data?.code === "FORBIDDEN" ||
        (e as { code?: string }).code === "FORBIDDEN" ||
        String(e).includes("FORBIDDEN"),
    );
  });

  it("wipes every collection + sequences, keeps profile/settings, blocks re-seed", async () => {
    await authed.data.bulkUpsert({
      collection: "clients",
      items: [{ id: "audit-clr-1" }, { id: "audit-clr-2" }],
    });
    await authed.data.bulkUpsert({
      collection: "tenders",
      items: [{ id: "audit-clr-3" }],
    });
    await authed.data.nextDocNumber({ prefix: AUDIT_PREFIX, year: 2026 });
    await authed.data.updateProfile({ profile: { companyName: "Audit Co" } });
    await authed.data.updateSettings({ settings: { theme: "dark" } });

    const res = await authed.data.clearAll({ includeProfile: false });
    expect(res.deleted).toBeGreaterThanOrEqual(3);

    const stats = await authed.data.stats();
    expect(stats.entityCount).toBe(1); // only the audit marker survives
    expect(stats.sequences).toEqual({});

    for (const collection of COLLECTIONS) {
      const list = await authed.data.list({ collection });
      if (collection === "audit") {
        expect(list).toHaveLength(1);
        const marker = list[0] as {
          action: string; entityRef: string; user: string; details: string;
        };
        expect(marker.action).toBe("Cleared");
        expect(marker.entityRef).toBe("ALL");
        expect(marker.user).toBe("Audit Bot");
        expect(marker.details).toContain("cleared by administrator");
      } else {
        expect(list).toHaveLength(0);
      }
    }

    const state = await authed.data.getState();
    expect(state.profile).toEqual({ companyName: "Audit Co" });
    expect(state.settings).toEqual({ theme: "dark" });

    // Entities table is non-empty (marker) → demo seeding stays blocked.
    const seeded = await authed.data.seedIfEmpty({
      dump: { entities: { clients: [{ id: "audit-nope" }] } },
    });
    expect(seeded.seeded).toBe(false);
    expect(await authed.data.list({ collection: "clients" })).toHaveLength(0);
  });

  it("includeProfile=true also clears the kv singletons", async () => {
    await authed.data.updateProfile({ profile: { companyName: "Audit Co" } });
    await authed.data.bulkUpsert({
      collection: "clients",
      items: [{ id: "audit-clr-9" }],
    });
    await authed.data.clearAll({ includeProfile: true });
    const state = await authed.data.getState();
    expect(state.profile).toBeNull();
    expect(state.settings).toBeNull();
    expect((await authed.data.stats()).entityCount).toBe(1);
  });
});

afterAll(async () => {
  // ---- MANDATORY CLEANUP ----
  // Remove all audit-* leftovers defensively, then wipe app data.
  const caller = appRouter.createCaller(authCtx);
  for (const collection of COLLECTIONS) {
    const list = (await caller.data.list({ collection })) as Array<{ id: string }>;
    for (const row of list) {
      if (row.id.startsWith("audit-")) {
        await caller.data.remove({ collection, id: row.id });
      }
    }
  }
  // Restore kv to pre-test state (null rows if previously absent).
  const db = getDb();
  if (preProfile != null) await caller.data.updateProfile({ profile: preProfile });
  else await db.delete(schema.kvStore).where(eq(schema.kvStore.k, "profile"));
  if (preSettings != null) await caller.data.updateSettings({ settings: preSettings });
  else await db.delete(schema.kvStore).where(eq(schema.kvStore.k, "settings"));

  // Leave the production DB EMPTY for first-run seeding.
  await caller.data.importAll({ dump: { entities: {}, kv: {}, sequences: {} } });
  // importAll does not delete sequence rows — remove scratch ones via Drizzle.
  await db.delete(schema.docSequences).where(like(schema.docSequences.prefix, `${AUDIT_PREFIX}%`));

  const stats = await caller.data.stats();
  const remainingSeq = Object.keys(stats.sequences).filter((k) => k.startsWith(AUDIT_PREFIX));
  if (stats.entityCount !== 0 || remainingSeq.length > 0) {
    throw new Error(
      `CLEANUP FAILED: entityCount=${stats.entityCount}, seqLeft=${remainingSeq.join(",")}`,
    );
  }
  console.log(
    `CLEANUP OK: entityCount=${stats.entityCount}, AUD-TST sequences removed, kv restored (profile pre-existed=${preProfile != null}, settings pre-existed=${preSettings != null})`,
  );
}, 120_000);
