import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateHdMnemonic,
  getHdMasterDepositAddress,
  isHdWalletConfigured,
  validateHdMnemonic,
} from "@/lib/payments/tron-hd-wallet";
import { syncUsdtHdSettingsFromEnv, provisionVendorHdDeposit } from "@/lib/payments/usdt-hd-deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user };
}

/**
 * GET /api/payments/usdt/hd — HD wallet status (no secrets).
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const configured = isHdWalletConfigured();
  let masterAddress: string | null = null;
  if (configured) {
    try {
      masterAddress = getHdMasterDepositAddress();
    } catch {
      masterAddress = null;
    }
  }

  return NextResponse.json({
    configured,
    master_address: masterAddress,
    path_payment_intents: "m/44'/195'/0'/0/{index}",
    path_vendors: "m/44'/195'/1'/0/{index}",
  });
}

/**
 * POST /api/payments/usdt/hd
 * Admin ops:
 *  - { action: "generate_mnemonic" } → returns a new 12-word phrase once (store in env)
 *  - { action: "sync_settings" } → sync master address into usdt_payment_settings
 *  - { action: "provision_vendor", vendor_id } → unique vendor deposit address
 *  - { action: "validate_mnemonic", mnemonic } → validate without storing
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  let body: {
    action?: string;
    vendor_id?: string;
    mnemonic?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action?.trim();

  if (action === "generate_mnemonic") {
    const mnemonic = generateHdMnemonic();
    const master_address = getHdMasterDepositAddress(mnemonic);
    return NextResponse.json({
      mnemonic,
      word_count: mnemonic.split(/\s+/).length,
      master_address,
      warning:
        "Store USDT_TRC20_HD_MNEMONIC in server secrets only. This response is not persisted.",
    });
  }

  if (action === "validate_mnemonic") {
    const ok = validateHdMnemonic(String(body.mnemonic ?? ""));
    return NextResponse.json({ valid: ok });
  }

  if (action === "sync_settings") {
    try {
      const result = await syncUsdtHdSettingsFromEnv();
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to sync HD settings.",
        },
        { status: 400 },
      );
    }
  }

  if (action === "provision_vendor") {
    const vendorId = body.vendor_id?.trim();
    if (!vendorId) {
      return NextResponse.json(
        { error: "vendor_id is required." },
        { status: 400 },
      );
    }
    try {
      const derived = await provisionVendorHdDeposit(vendorId);
      return NextResponse.json({
        vendor_id: vendorId,
        address: derived.address,
        derivation_path: derived.derivationPath,
        account: derived.account,
        index: derived.index,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to provision vendor deposit address.",
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json(
    {
      error:
        "Unknown action. Use generate_mnemonic, validate_mnemonic, sync_settings, or provision_vendor.",
    },
    { status: 400 },
  );
}
