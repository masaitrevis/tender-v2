import { and, eq, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export type EntityRow = { id: string; data: unknown };
export type EntityDump = Record<string, EntityRow[]>;

/** List all entities of one collection. */
export async function listEntities(collection: string): Promise<unknown[]> {
  const rows = await getDb()
    .select({ data: schema.entities.data })
    .from(schema.entities)
    .where(eq(schema.entities.collection, collection));
  return rows.map((r) => r.data);
}

/** All collections grouped: { clients: [...], suppliers: [...], … }. */
export async function getAllEntities(): Promise<Record<string, unknown[]>> {
  const rows = await getDb()
    .select({
      collection: schema.entities.collection,
      data: schema.entities.data,
    })
    .from(schema.entities);
  const out: Record<string, unknown[]> = {};
  for (const r of rows) {
    (out[r.collection] ??= []).push(r.data);
  }
  return out;
}

/** Insert or update one entity (id taken from item.id). */
export async function upsertEntity(collection: string, item: unknown) {
  const id = String((item as { id?: unknown }).id ?? "");
  if (!id) throw new Error("Entity payload must contain an id");
  await getDb()
    .insert(schema.entities)
    .values({ collection, id, data: item as object })
    .onDuplicateKeyUpdate({ set: { data: item as object } });
}

/** Bulk upsert (Excel import) — chunked transaction. */
export async function bulkUpsertEntities(
  collection: string,
  items: unknown[],
): Promise<number> {
  const db = getDb();
  const CHUNK = 200;
  let n = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < items.length; i += CHUNK) {
      const slice = items.slice(i, i + CHUNK).map((item) => ({
        collection,
        id: String((item as { id?: unknown }).id ?? ""),
        data: item as object,
      }));
      for (const row of slice) {
        if (!row.id) throw new Error("Entity payload must contain an id");
      }
      if (slice.length === 0) continue;
      await tx
        .insert(schema.entities)
        .values(slice)
        .onDuplicateKeyUpdate({ set: { data: sql`VALUES(data)` } });
      n += slice.length;
    }
  });
  return n;
}

export async function removeEntity(collection: string, id: string) {
  await getDb()
    .delete(schema.entities)
    .where(
      and(
        eq(schema.entities.collection, collection),
        eq(schema.entities.id, id),
      ),
    );
}

export async function getKv<T = unknown>(k: string): Promise<T | null> {
  const rows = await getDb()
    .select({ data: schema.kvStore.data })
    .from(schema.kvStore)
    .where(eq(schema.kvStore.k, k))
    .limit(1);
  return (rows.at(0)?.data as T) ?? null;
}

export async function setKv(k: string, data: unknown) {
  await getDb()
    .insert(schema.kvStore)
    .values({ k, data: data as object })
    .onDuplicateKeyUpdate({ set: { data: data as object } });
}

/** Atomic next number for a document prefix (row lock inside transaction). */
export async function nextSequence(prefix: string): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .insert(schema.docSequences)
      .values({ prefix, value: 1 })
      .onDuplicateKeyUpdate({ set: { value: sql`value + 1` } });
    const rows = await tx
      .select({ value: schema.docSequences.value })
      .from(schema.docSequences)
      .where(eq(schema.docSequences.prefix, prefix))
      .limit(1);
    return rows.at(0)?.value ?? 1;
  });
}

/** Current sequence value without incrementing (for Settings display). */
export async function peekSequences(): Promise<Record<string, number>> {
  const rows = await getDb()
    .select()
    .from(schema.docSequences);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.prefix] = r.value;
  return out;
}

export async function entityCount(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.entities);
  return Number(rows.at(0)?.n ?? 0);
}

/** Full backup dump: entities grouped + kv singletons + sequences. */
export async function exportAll() {
  return {
    entities: await getAllEntities(),
    kv: {
      profile: await getKv("profile"),
      settings: await getKv("settings"),
    },
    sequences: await peekSequences(),
  };
}

/** Restore a full backup (replaces all app data) inside one transaction. */
export async function importAll(dump: {
  entities: Record<string, unknown[]>;
  kv?: { profile?: unknown; settings?: unknown };
  sequences?: Record<string, number>;
}) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.entities);
    for (const [collection, items] of Object.entries(dump.entities ?? {})) {
      for (const item of items) {
        const id = String((item as { id?: unknown }).id ?? "");
        if (!id) continue;
        await tx.insert(schema.entities).values({ collection, id, data: item as object });
      }
    }
    if (dump.kv?.profile != null) {
      await tx
        .insert(schema.kvStore)
        .values({ k: "profile", data: dump.kv.profile as object })
        .onDuplicateKeyUpdate({ set: { data: dump.kv.profile as object } });
    }
    if (dump.kv?.settings != null) {
      await tx
        .insert(schema.kvStore)
        .values({ k: "settings", data: dump.kv.settings as object })
        .onDuplicateKeyUpdate({ set: { data: dump.kv.settings as object } });
    }
    if (dump.sequences) {
      for (const [prefix, value] of Object.entries(dump.sequences)) {
        await tx
          .insert(schema.docSequences)
          .values({ prefix, value })
          .onDuplicateKeyUpdate({ set: { value } });
      }
    }
  });
}

/** First-run seed — writes the dump only if the entities table is empty. */
export async function seedIfEmpty(dump: {
  entities: Record<string, unknown[]>;
  kv?: { profile?: unknown; settings?: unknown };
  sequences?: Record<string, number>;
}): Promise<boolean> {
  if ((await entityCount()) > 0) return false;
  await importAll(dump);
  return true;
}
