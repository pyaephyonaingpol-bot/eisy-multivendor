#!/usr/bin/env node
/**
 * Apply vendors.id DEFAULT gen_random_uuid() against the linked Supabase project.
 *
 * Requires one of:
 *   - DATABASE_URL / POSTGRES_URL / SUPABASE_DB_URL (direct Postgres)
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (falls back to
 *     verifying Rest access; ALTER still needs a Postgres URL)
 *
 * Usage:
 *   node scripts/apply-vendors-id-default.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const sqlPath = resolve(
  process.cwd(),
  "supabase/migrations/039_set_vendors_id_default_gen_random_uuid.sql",
);
const sql = readFileSync(sqlPath, "utf8");

const dbUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DIRECT_URL?.trim();

async function runViaPostgres(url) {
  const { default: pg } = await import("pg").catch(() => ({ default: null }));
  if (!pg) {
    throw new Error(
      "Package 'pg' is not installed. Add it or set up a Postgres URL client.",
    );
  }
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    const check = await client.query(`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'vendors'
        and column_name = 'id'
    `);
    console.log("OK: applied vendors.id default");
    console.log(check.rows);
  } finally {
    await client.end();
  }
}

async function verifyViaServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { ok: false, reason: "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Cannot ALTER TABLE through PostgREST; only verify table is reachable.
  const { error } = await supabase.from("vendors").select("id").limit(1);
  if (error) {
    return { ok: false, reason: error.message };
  }
  return {
    ok: true,
    reason:
      "Service role can read vendors, but ALTER TABLE requires DATABASE_URL. Paste supabase/migrations/039_set_vendors_id_default_gen_random_uuid.sql in the Supabase SQL Editor.",
  };
}

async function main() {
  if (dbUrl) {
    await runViaPostgres(dbUrl);
    return;
  }

  const verify = await verifyViaServiceRole();
  console.error("No DATABASE_URL / POSTGRES_URL / SUPABASE_DB_URL in environment.");
  console.error(verify.reason);
  console.error(
    "\nPaste and run this file in Supabase → SQL Editor:\n  supabase/migrations/039_set_vendors_id_default_gen_random_uuid.sql\n",
  );
  console.error(
    "Application code now inserts an explicit UUID on vendor apply, so the form should work after deploy even before the ALTER runs.",
  );
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
