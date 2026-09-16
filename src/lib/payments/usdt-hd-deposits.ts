import { createServiceClient } from "@/lib/supabase/admin";
import {
  derivePaymentIntentDepositAddress,
  deriveVendorDepositAddress,
  getHdMasterDepositAddress,
  isHdWalletConfigured,
  type DerivedTronAddress,
} from "@/lib/payments/tron-hd-wallet";

/**
 * When an HD mnemonic is configured, sync the master (account0/index0) address
 * into usdt_payment_settings as the platform fallback / settings deposit.
 */
export async function syncUsdtHdSettingsFromEnv(): Promise<{
  enabled: boolean;
  masterAddress: string | null;
}> {
  if (!isHdWalletConfigured()) {
    return { enabled: false, masterAddress: null };
  }

  const masterAddress = getHdMasterDepositAddress();
  const supabase = createServiceClient();
  const { error } = await supabase.from("usdt_payment_settings").upsert(
    {
      id: 1,
      deposit_address: masterAddress,
      hd_master_address: masterAddress,
      hd_enabled: true,
      network: "TRC20",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Failed to sync USDT HD settings: ${error.message}`);
  }

  return { enabled: true, masterAddress };
}

/**
 * Allocate the next payment derivation index and return a unique deposit address.
 * Private keys are never returned.
 */
export async function allocatePaymentIntentDepositAddress(): Promise<DerivedTronAddress> {
  if (!isHdWalletConfigured()) {
    throw new Error("USDT_TRC20_HD_MNEMONIC is not configured.");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("allocate_usdt_hd_payment_index");
  if (error) {
    throw new Error(error.message);
  }

  const index = Number(data);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Failed to allocate HD payment derivation index.");
  }

  return derivePaymentIntentDepositAddress(index);
}

/**
 * Bind a derived HD address onto an open payment intent.
 */
export async function assignHdDepositToPaymentIntent(options: {
  paymentIntentId: string;
  derived: DerivedTronAddress;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("assign_usdt_intent_hd_deposit", {
    p_payment_intent_id: options.paymentIntentId,
    p_deposit_address: options.derived.address,
    p_derivation_index: options.derived.index,
    p_derivation_account: options.derived.account,
    p_derivation_path: options.derived.derivationPath,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Allocate + assign a unique HD deposit address for a checkout intent.
 */
export async function provisionPaymentIntentHdDeposit(
  paymentIntentId: string,
): Promise<DerivedTronAddress> {
  const derived = await allocatePaymentIntentDepositAddress();
  await assignHdDepositToPaymentIntent({
    paymentIntentId,
    derived,
  });
  return derived;
}

/**
 * Allocate a unique HD deposit address for a vendor (admin/ops).
 */
export async function provisionVendorHdDeposit(vendorId: string): Promise<DerivedTronAddress> {
  if (!isHdWalletConfigured()) {
    throw new Error("USDT_TRC20_HD_MNEMONIC is not configured.");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("allocate_usdt_hd_vendor_index");
  if (error) {
    throw new Error(error.message);
  }

  const index = Number(data);
  const derived = deriveVendorDepositAddress(index);

  const { error: updateError } = await supabase
    .from("vendors")
    .update({
      usdt_deposit_address: derived.address,
      usdt_derivation_account: derived.account,
      usdt_derivation_index: derived.index,
      usdt_derivation_path: derived.derivationPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendorId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return derived;
}
