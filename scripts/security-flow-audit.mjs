/**
 * Static pre-deploy audit for RLS + money-flow hardening markers.
 * Run: node scripts/security-flow-audit.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "supabase/migrations");
const files = readdirSync(root).filter((f) => f.endsWith(".sql")).sort();
const all = files.map((f) => readFileSync(join(root, f), "utf8")).join("\n");
const latest = readFileSync(join(root, "019_harden_rls_and_money_flows.sql"), "utf8");
const webhook = readFileSync(
  join(process.cwd(), "src/app/api/payments/usdt/webhook/route.ts"),
  "utf8",
);

const checks = [
  {
    name: "orders client INSERT policy removed in 019",
    pass: latest.includes('drop policy if exists "orders_insert_customer"'),
  },
  {
    name: "orders client UPDATE policy removed in 019",
    pass: latest.includes('drop policy if exists "orders_update_customer_vendor_or_admin"'),
  },
  {
    name: "order_items seller_vendor_id select",
    pass: latest.includes("owns_vendor(o.seller_vendor_id)"),
  },
  {
    name: "vendors insert policy removed (apply_for_vendor only)",
    pass: latest.includes('drop policy if exists "vendors_insert_owner"'),
  },
  {
    name: "vendor privileged column trigger",
    pass: latest.includes("protect_vendor_privileged_columns"),
  },
  {
    name: "subscriptions admin-only write",
    pass: latest.includes("subscriptions_admin_insert"),
  },
  {
    name: "TRC-20 confirm requires amount",
    pass: latest.includes("Paid amount is required for confirmation"),
  },
  {
    name: "TRC-20 stock fail-closed",
    pass: latest.includes("Insufficient stock to confirm order"),
  },
  {
    name: "fee failed status persists without RAISE",
    pass: latest.includes("Return failed instead of RAISE"),
  },
  {
    name: "dropship price floor",
    pass: latest.includes("cannot be below supplier price"),
  },
  {
    name: "money RPCs revoke PUBLIC",
    pass: latest.includes("revoke all on function public.checkout_with_usdt"),
  },
  {
    name: "webhook rejects skip_chain_verify",
    pass: webhook.includes("skip_chain_verify is not allowed"),
  },
  {
    name: "wallets RLS select-only pattern present",
    pass: all.includes("wallets_select_own_or_admin"),
  },
];

let failed = 0;
for (const c of checks) {
  const mark = c.pass ? "PASS" : "FAIL";
  if (!c.pass) failed += 1;
  console.log(`${mark}  ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
