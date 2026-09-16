import { createServiceClient } from "@/lib/supabase/admin";
import {
  deriveTronPrivateKey,
  isHdWalletConfigured,
} from "@/lib/payments/tron-hd-wallet";

export type UsdtWalletOpsMode = "mock" | "manual" | "live";

export type UsdtWalletJob = {
  id: string;
  kind: "sweep" | "withdrawal_payout";
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  amount_usdt: number;
  from_address: string | null;
  to_address: string;
  payment_intent_id: string | null;
  wallet_transaction_id: string | null;
  beneficiary_user_id: string | null;
  tx_hash: string | null;
  attempts: number;
  last_error: string | null;
};

export function getUsdtWalletOpsMode(): UsdtWalletOpsMode {
  const raw = (process.env.USDT_WALLET_OPS_MODE ?? "mock").trim().toLowerCase();
  if (raw === "live" || raw === "manual" || raw === "mock") return raw;
  return "mock";
}

export function getHotWalletPrivateKey(): string | null {
  return process.env.USDT_TRC20_HOT_WALLET_PRIVATE_KEY?.trim() || null;
}

async function resolveSignerPrivateKey(args: {
  fromAddress?: string | null;
  paymentIntentId?: string | null;
}): Promise<{ privateKeyHex: string; address: string } | null> {
  // Prefer HD child key when the payment intent was provisioned from the mnemonic.
  if (args.paymentIntentId && isHdWalletConfigured()) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("usdt_payment_intents")
      .select("deposit_address, derivation_account, derivation_index")
      .eq("id", args.paymentIntentId)
      .maybeSingle();

    const row = data as {
      deposit_address: string;
      derivation_account: number | null;
      derivation_index: number | null;
    } | null;

    if (row?.derivation_index != null) {
      const derived = deriveTronPrivateKey({
        account: row.derivation_account ?? 0,
        index: row.derivation_index,
      });
      return {
        privateKeyHex: derived.privateKeyHex,
        address: derived.address,
      };
    }
  }

  const hot = getHotWalletPrivateKey();
  if (hot) {
    return {
      privateKeyHex: hot.replace(/^0x/i, ""),
      address: args.fromAddress?.trim() || "",
    };
  }

  return null;
}

/**
 * Broadcast USDT TRC-20 from an HD child deposit address or the hot wallet.
 * - mock: returns a deterministic mock hash (dev / CI)
 * - manual: leaves job for an operator to attach a real tx_hash
 * - live: signs with HD child key (when available) or USDT_TRC20_HOT_WALLET_PRIVATE_KEY
 */
export async function broadcastUsdtTrc20Transfer(args: {
  toAddress: string;
  amountUsdt: number;
  fromAddress?: string | null;
  paymentIntentId?: string | null;
  memo?: string | null;
}): Promise<{ txHash: string; mode: UsdtWalletOpsMode; deferred?: boolean }> {
  const mode = getUsdtWalletOpsMode();
  const toAddress = args.toAddress.trim();
  if (!toAddress) {
    throw new Error("Destination address is required.");
  }
  if (!(args.amountUsdt > 0)) {
    throw new Error("Amount must be greater than zero.");
  }

  if (mode === "mock") {
    const stamp = Date.now().toString(16);
    return {
      mode,
      txHash: `mock_${stamp}_${Math.abs(Math.round(args.amountUsdt * 1e6)).toString(16)}`,
    };
  }

  if (mode === "manual") {
    return {
      mode,
      txHash: "",
      deferred: true,
    };
  }

  const signer = await resolveSignerPrivateKey({
    fromAddress: args.fromAddress,
    paymentIntentId: args.paymentIntentId,
  });
  if (!signer) {
    throw new Error(
      "No signing key available. Configure USDT_TRC20_HD_MNEMONIC (for HD child sweeps) or USDT_TRC20_HOT_WALLET_PRIVATE_KEY.",
    );
  }

  // Live TRC-20 transfer via TronWeb. Requires energy/bandwidth on the from address.
  const TronWebModule = await import("tronweb");
  const TronWebCtor = (TronWebModule.default ?? TronWebModule) as unknown as {
    new (options: {
      fullHost: string;
      headers?: Record<string, string>;
      privateKey: string;
    }): {
      defaultAddress: { base58: string };
      contract: () => {
        at: (address: string) => Promise<{
          methods: {
            transfer: (
              to: string,
              amount: number,
            ) => { send: (opts: { from: string }) => Promise<string> };
          };
        }>;
      };
    };
  };
  const fullHost =
    process.env.TRONGRID_API_BASE?.trim() || "https://api.trongrid.io";
  const tronWeb = new TronWebCtor({
    fullHost,
    headers: process.env.TRONGRID_API_KEY?.trim()
      ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY.trim() }
      : undefined,
    privateKey: signer.privateKeyHex,
  });

  const contractAddress =
    process.env.USDT_TRC20_CONTRACT_ADDRESS?.trim() ||
    "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const sunAmount = Math.round(args.amountUsdt * 1e6);
  const contract = await tronWeb.contract().at(contractAddress);
  const txHash = await contract.methods
    .transfer(toAddress, sunAmount)
    .send({ from: signer.address || tronWeb.defaultAddress.base58 });

  return {
    mode,
    txHash: String(txHash),
  };
}

export async function processUsdtWalletJobs(options?: {
  limit?: number;
  kind?: "sweep" | "withdrawal_payout" | null;
}): Promise<{
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
  mode: UsdtWalletOpsMode;
  jobs: Array<{ id: string; status: string; tx_hash?: string | null; error?: string }>;
}> {
  const supabase = createServiceClient();
  const mode = getUsdtWalletOpsMode();
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));

  const { data: claimed, error } = await supabase.rpc("claim_usdt_wallet_jobs", {
    p_limit: limit,
    p_kind: options?.kind ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const jobs = (claimed as UsdtWalletJob[] | null) ?? [];
  let completed = 0;
  let deferred = 0;
  let failed = 0;
  const summaries: Array<{
    id: string;
    status: string;
    tx_hash?: string | null;
    error?: string;
  }> = [];

  for (const job of jobs) {
    try {
      if (mode === "manual") {
        // Keep processing until an operator attaches a tx hash via
        // POST /api/payments/usdt/jobs/complete
        deferred += 1;
        summaries.push({
          id: job.id,
          status: "awaiting_manual_broadcast",
          error: "manual_broadcast_required",
        });
        continue;
      }

      const broadcast = await broadcastUsdtTrc20Transfer({
        toAddress: job.to_address,
        amountUsdt: Number(job.amount_usdt),
        fromAddress: job.from_address,
        paymentIntentId: job.payment_intent_id,
        memo: job.kind,
      });

      if (broadcast.deferred) {
        deferred += 1;
        summaries.push({
          id: job.id,
          status: "deferred",
          error: "manual_broadcast_required",
        });
        continue;
      }

      await supabase.rpc("complete_usdt_wallet_job", {
        p_job_id: job.id,
        p_tx_hash: broadcast.txHash,
        p_confirmations: 1,
        p_error: null,
      });
      completed += 1;
      summaries.push({
        id: job.id,
        status: "completed",
        tx_hash: broadcast.txHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job failed.";
      await supabase.rpc("complete_usdt_wallet_job", {
        p_job_id: job.id,
        p_tx_hash: null,
        p_confirmations: null,
        p_error: message,
      });
      failed += 1;
      summaries.push({ id: job.id, status: "failed", error: message });
    }
  }

  return {
    claimed: jobs.length,
    completed,
    deferred,
    failed,
    mode,
    jobs: summaries,
  };
}

export async function enqueueWithdrawalPayout(walletTransactionId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("enqueue_usdt_withdrawal_payout", {
    p_wallet_transaction_id: walletTransactionId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as string | null;
}

export async function attachManualPayoutTxHash(args: {
  jobId: string;
  txHash: string;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("complete_usdt_wallet_job", {
    p_job_id: args.jobId,
    p_tx_hash: args.txHash,
    p_confirmations: 1,
    p_error: null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
