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

export type AdminWalletTransaction = WalletTransaction & {
  user_email?: string | null;
  user_full_name?: string | null;
  reviewer_email?: string | null;
};

async function attachProfileMeta(
  rows: WalletTransaction[],
): Promise<AdminWalletTransaction[]> {
  if (rows.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const reviewerIds = [
    ...new Set(
      rows
        .map((row) => row.reviewed_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const profileIds = [...new Set([...userIds, ...reviewerIds])];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", profileIds);

  const byId = new Map(
    ((profiles as { id: string; email: string; full_name: string | null }[] | null) ?? []).map(
      (profile) => [profile.id, profile],
    ),
  );

  return rows.map((row) => {
    const user = byId.get(row.user_id);
    const reviewer = row.reviewed_by ? byId.get(row.reviewed_by) : null;
    return {
      ...row,
      amount: Number(row.amount),
      user_email: user?.email ?? null,
      user_full_name: user?.full_name ?? null,
      reviewer_email: reviewer?.email ?? null,
    };
  });
}

export async function listPendingWithdrawals(): Promise<AdminWalletTransaction[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("status", "pending")
    .eq("tx_type", "withdrawal")
    .order("created_at", { ascending: true });

  return attachProfileMeta((data as WalletTransaction[] | null) ?? []);
}

export async function listPendingDeposits(): Promise<AdminWalletTransaction[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("status", "pending")
    .eq("tx_type", "deposit")
    .order("created_at", { ascending: true });

  return attachProfileMeta((data as WalletTransaction[] | null) ?? []);
}

export async function listRecentWalletReviews(
  limit = 30,
): Promise<AdminWalletTransaction[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_transactions")
    .select("*")
    .in("tx_type", ["deposit", "withdrawal"])
    .in("status", ["completed", "rejected"])
    .not("reviewed_at", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(limit);

  return attachProfileMeta((data as WalletTransaction[] | null) ?? []);
}
