"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WalletCurrency } from "@/lib/money";

export type WalletActionState = {
  error?: string;
  success?: string;
} | null;

function parseAmount(value: FormDataEntryValue | null): number {
  const amount = Number(String(value ?? "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    return NaN;
  }
  return Math.round(amount * 1_000_000) / 1_000_000;
}

function revalidateWalletPaths() {
  revalidatePath("/account/wallet");
  revalidatePath("/vendor/wallet");
  revalidatePath("/admin/wallets");
  revalidatePath("/admin/withdrawals");
  revalidatePath("/cart");
}

export async function requestUsdtDeposit(
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const amount = parseAmount(formData.get("amount"));
  const reference = String(formData.get("reference") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (Number.isNaN(amount)) {
    return { error: "Enter a valid USDT deposit amount greater than zero." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to deposit USDT." };
  }

  const { error } = await supabase.rpc("request_wallet_deposit", {
    p_currency: "USDT",
    p_amount: amount,
    p_reference: reference || null,
    p_note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateWalletPaths();
  return { success: "USDT deposit submitted for review." };
}

export async function requestWalletWithdrawal(
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const currency = String(formData.get("currency") ?? "")
    .trim()
    .toUpperCase() as WalletCurrency;
  const amount = parseAmount(formData.get("amount"));
  const destination = String(formData.get("destination") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (currency !== "USDT" && currency !== "MMK") {
    return { error: "Choose USDT or MMK for withdrawal." };
  }

  if (Number.isNaN(amount)) {
    return { error: "Enter a valid withdrawal amount greater than zero." };
  }

  if (!destination) {
    return {
      error:
        currency === "MMK"
          ? "Enter your MMK bank or mobile-money destination."
          : "Enter your USDT wallet address / network destination.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to request a withdrawal." };
  }

  const { error } = await supabase.rpc("request_wallet_withdrawal", {
    p_currency: currency,
    p_amount: amount,
    p_destination: destination,
    p_note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateWalletPaths();
  return {
    success: `${currency} withdrawal submitted for review.`,
  };
}

export async function reviewWalletTransaction(
  txId: string,
  approve: boolean,
  note?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in required." };
  }

  const { error } = await supabase.rpc("review_wallet_transaction", {
    p_tx_id: txId,
    p_approve: approve,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateWalletPaths();
  revalidatePath("/admin/withdrawals");
  return {};
}
