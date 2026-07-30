import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";
import { dbConnectionOptions } from "@db/connection-options";

const fullSchema = { ...schema, ...relations };

function createDb() {
  // Explicit pool config: TiDB Cloud Serverless requires TLS, which mysql2
  // cannot express via a URL query param — dbConnectionOptions adds it.
  const pool = createPool({
    ...dbConnectionOptions(env.databaseUrl),
    connectionLimit: 5,
    waitForConnections: true,
  });
  return drizzle(pool, {
    mode: "planetscale",
    schema: fullSchema,
  });
}

let instance: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!instance) {
    instance = createDb();
  }
  return instance;
}
