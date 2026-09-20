/**
 * One-off: list Printify shops and print shop IDs.
 * Usage: node scripts/printify-list-shops.mjs
 * Reads PRINTIFY_API_KEY from process.env or .env.local
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local optional if env already set
  }
}

loadEnvLocal();

const apiKey = process.env.PRINTIFY_API_KEY?.trim();
if (!apiKey) {
  console.error("PRINTIFY_API_KEY is missing. Set it in .env.local or the environment.");
  process.exit(1);
}

const base =
  (process.env.PRINTIFY_API_BASE?.trim() || "https://api.printify.com/v1").replace(
    /\/$/,
    "",
  );

const response = await fetch(`${base}/shops.json`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "User-Agent": "EisyMyanmar/1.0",
  },
});

const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("Non-JSON response:", response.status, text.slice(0, 500));
  process.exit(1);
}

if (!response.ok) {
  console.error("Printify error:", response.status, data);
  process.exit(1);
}

const shops = Array.isArray(data) ? data : data.data ?? [];
if (shops.length === 0) {
  console.log("No shops found for this API key.");
  process.exit(0);
}

console.log(`Found ${shops.length} shop(s):\n`);
for (const shop of shops) {
  console.log(`Shop ID: ${shop.id}`);
  if (shop.title) console.log(`  Title: ${shop.title}`);
  if (shop.sales_channel) console.log(`  Sales channel: ${shop.sales_channel}`);
  console.log("");
}

if (shops.length === 1) {
  console.log(`Your PRINTIFY_SHOP_ID=${shops[0].id}`);
}
