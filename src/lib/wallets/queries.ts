import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Wallet, WalletTransaction } from "@/lib/money";

export async function ensureSessionWallets(userId: string) {
  if (!getSupabasePublicEnv()) {
    return;
  }
  const supabase = await createClient();
  await supabase.rpc("ensure_user_wallets", { p_user_id: userId });
}

export async function listWalletsForUser(userId: string): Promise<Wallet[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  await supabase.rpc("ensure_user_wallets", { p_user_id: userId });

  const { data } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .order("currency", { ascending: true });

  return ((data as Wallet[] | null) ?? []).map((row) => ({
    ...row,
    available_balance: Number(row.available_balance),
    pending_balance: Number(row.pending_balance),
  }));
}

export async function listWalletTransactionsForUser(
  userId: string,
  limit = 30,
): Promise<WalletTransaction[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data as WalletTransaction[] | null) ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function listPendingWalletTransactions(): Promise<WalletTransaction[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("status", "pending")
    .in("tx_type", ["deposit", "withdrawal"])
    .order("created_at", { ascending: true });

  return ((data as WalletTransaction[] | null) ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}
