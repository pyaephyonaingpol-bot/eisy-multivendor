#!/usr/bin/env node
/**
 * Promote pyaephyonaing.pol@gmail.com to admin (and create the profiles row
 * if missing) using the Supabase service role.
 *
 * Prerequisites:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/ensure-bootstrap-admin.mjs
 *   node scripts/ensure-bootstrap-admin.mjs --email someone@example.com
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_EMAIL = "pyaephyonaing.pol@gmail.com";

function env(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function parseEmail(argv) {
  const idx = argv.indexOf("--email");
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1].trim().toLowerCase();
  }
  return DEFAULT_EMAIL;
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const email = parseEmail(process.argv.slice(2));

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Prefer the SQL helper from migration 031 when available.
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "ensure_bootstrap_admin_profile",
    { p_email: email },
  );

  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    console.log("OK via ensure_bootstrap_admin_profile:", {
      id: row?.id,
      email: row?.email,
      role: row?.role,
      full_name: row?.full_name,
    });
    return;
  }

  if (rpcError) {
    console.warn(
      "RPC ensure_bootstrap_admin_profile unavailable; falling back.",
      rpcError.message,
    );
  }

  const { data: listData, error: listError } =
    await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.error("auth.admin.listUsers failed:", listError.message);
    process.exit(1);
  }

  const user = (listData?.users ?? []).find(
    (row) => (row.email ?? "").trim().toLowerCase() === email,
  );

  if (!user) {
    console.error(
      `No auth user for ${email}. Sign up with that email first, then re-run.`,
    );
    process.exit(1);
  }

  const fullName =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;

  const { data: existing } = await admin
    .from("profiles")
    .select("id, email, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const { data, error } = await admin
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? email,
        full_name: fullName,
        role: "admin",
      })
      .select("id, email, role, full_name")
      .single();
    if (error) {
      console.error("profiles insert failed:", error.message);
      process.exit(1);
    }
    console.log("Created admin profile:", data);
    return;
  }

  const { data, error } = await admin
    .from("profiles")
    .update({
      role: "admin",
      email: existing.email || user.email || email,
      full_name: existing.full_name || fullName,
    })
    .eq("id", user.id)
    .select("id, email, role, full_name")
    .single();

  if (error) {
    console.error(
      "profiles update failed (apply migration 033 / upsert script so role protection can be bypassed):",
      error.message,
    );
    process.exit(1);
  }

  console.log("Updated admin profile:", data);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
