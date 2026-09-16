import {
  confirmUsdtTrc20Payment,
  getConfiguredUsdtContractAddress,
  getConfiguredUsdtDepositAddress,
  syncUsdtTrc20SettingsFromEnv,
  verifyUsdtTrc20Transfer,
  type UsdtTrc20Transfer,
} from "@/lib/payments/usdt-trc20";
import { createServiceClient } from "@/lib/supabase/admin";

type PendingIntent = {
  id: string;
  amount_usdt: number;
  deposit_address: string;
  status: string;
  expires_at: string | null;
  order_ids: string[];
  tx_hash: string | null;
  derivation_index: number | null;
};

function amountMatches(expected: number, observed: number) {
  if (observed + 0.000001 < expected) return false;
  if (observed > expected * 1.02 + 0.000001) return false;
  return true;
}

function normalizeAddr(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Lists recent confirmed USDT TRC-20 transfers received by an address.
 */
export async function listRecentUsdtTrc20Transfers(options?: {
  toAddress?: string | null;
  limit?: number;
  minTimestampMs?: number | null;
}): Promise<UsdtTrc20Transfer[]> {
  const toAddress =
    options?.toAddress?.trim() || getConfiguredUsdtDepositAddress();
  if (!toAddress) {
    throw new Error("USDT deposit address is not configured.");
  }

  const contract = getConfiguredUsdtContractAddress();
  const base = (
    process.env.TRONGRID_API_BASE?.trim() || "https://api.trongrid.io"
  ).replace(/\/$/, "");
  const url = new URL(`${base}/v1/accounts/${toAddress}/transactions/trc20`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", String(Math.max(1, Math.min(options?.limit ?? 50, 200))));
  url.searchParams.set("contract_address", contract);
  if (options?.minTimestampMs != null && Number.isFinite(options.minTimestampMs)) {
    url.searchParams.set("min_timestamp", String(options.minTimestampMs));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.TRONGRID_API_KEY?.trim();
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  const response = await fetch(url.toString(), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `TronGrid list failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .map((match) => {
      const tokenInfo = (match.token_info ?? {}) as Record<string, unknown>;
      const decimals = Number(tokenInfo.decimals ?? 6);
      const rawValue = match.value ?? match.quant ?? match.amount;
      let amountUsdt = 0;
      if (typeof rawValue === "string" && /^\d+$/.test(rawValue.trim())) {
        amountUsdt =
          Number(rawValue.trim()) /
          10 ** (Number.isFinite(decimals) ? decimals : 6);
      } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        amountUsdt = rawValue;
      }

      return {
        txHash: String(match.transaction_id ?? match.txID ?? ""),
        fromAddress: String(match.from ?? match.from_address ?? "") || null,
        toAddress: String(match.to ?? match.to_address ?? "") || toAddress,
        amountUsdt,
        confirmations: 1,
        contractAddress: contract,
        confirmed: true,
        raw: match,
      } satisfies UsdtTrc20Transfer;
    })
    .filter((row) => row.txHash.length > 0 && row.amountUsdt > 0);
}

/**
 * Background listener: polls derived (or shared) deposit addresses for open
 * intents, matches incoming TRC-20 USDT transfers, and confirms escrow funding.
 *
 * Prefer exact deposit_address match (HD child addresses). Fall back to
 * amount matching only when multiple intents share one address.
 */
export async function monitorPendingUsdtDeposits(options?: {
  limitTransfers?: number;
  lookbackMinutes?: number;
  maxAddresses?: number;
}): Promise<{
  scanned: number;
  addresses: number;
  matched: number;
  confirmed: number;
  skipped: number;
  errors: string[];
  results: Array<{
    payment_intent_id: string;
    tx_hash: string;
    status: string;
    deposit_address: string;
  }>;
}> {
  await syncUsdtTrc20SettingsFromEnv();

  const supabase = createServiceClient();
  const { data: intentRows, error: intentError } = await supabase
    .from("usdt_payment_intents")
    .select(
      "id, amount_usdt, deposit_address, status, expires_at, order_ids, tx_hash, derivation_index",
    )
    .in("status", ["pending", "detecting"])
    .order("created_at", { ascending: true })
    .limit(200);

  if (intentError) {
    throw new Error(intentError.message);
  }

  const intents = (intentRows as PendingIntent[] | null) ?? [];
  const now = Date.now();
  const openIntents = intents.filter((intent) => {
    if (!intent.expires_at) return true;
    return new Date(intent.expires_at).getTime() >= now;
  });

  const fallbackAddress = getConfiguredUsdtDepositAddress();
  const byAddress = new Map<string, PendingIntent[]>();
  for (const intent of openIntents) {
    const address = intent.deposit_address?.trim() || fallbackAddress || "";
    if (!address) continue;
    const key = normalizeAddr(address);
    const list = byAddress.get(key) ?? [];
    list.push({ ...intent, deposit_address: address });
    byAddress.set(key, list);
  }

  // Always include the platform fallback address so shared-address intents
  // still clear when HD is partially rolled out.
  if (fallbackAddress) {
    const key = normalizeAddr(fallbackAddress);
    if (!byAddress.has(key)) {
      byAddress.set(key, []);
    }
  }

  const addressKeys = [...byAddress.keys()].slice(
    0,
    Math.max(1, Math.min(options?.maxAddresses ?? 40, 100)),
  );

  const lookbackMs =
    Date.now() - Math.max(5, options?.lookbackMinutes ?? 180) * 60_000;

  const { data: usedHashRows } = await supabase
    .from("usdt_payment_intents")
    .select("tx_hash")
    .not("tx_hash", "is", null)
    .limit(500);

  const usedHashes = new Set(
    ((usedHashRows as { tx_hash: string | null }[] | null) ?? [])
      .map((row) => (row.tx_hash ?? "").toLowerCase())
      .filter(Boolean),
  );

  const errors: string[] = [];
  const results: Array<{
    payment_intent_id: string;
    tx_hash: string;
    status: string;
    deposit_address: string;
  }> = [];
  let scanned = 0;
  let matched = 0;
  let confirmed = 0;
  let skipped = 0;

  for (const addressKey of addressKeys) {
    const addressIntents = byAddress.get(addressKey) ?? [];
    const sampleAddress =
      addressIntents[0]?.deposit_address || fallbackAddress || addressKey;

    let transfers: UsdtTrc20Transfer[] = [];
    try {
      transfers = await listRecentUsdtTrc20Transfers({
        toAddress: sampleAddress,
        limit: options?.limitTransfers ?? 50,
        minTimestampMs: lookbackMs,
      });
    } catch (error) {
      errors.push(
        `${sampleAddress}: ${error instanceof Error ? error.message : "list failed"}`,
      );
      continue;
    }

    scanned += transfers.length;
    const remaining = [...addressIntents];

    for (const transfer of transfers) {
      const hashKey = transfer.txHash.toLowerCase();
      if (usedHashes.has(hashKey)) {
        skipped += 1;
        continue;
      }

      // Prefer intents whose deposit_address exactly matches the transfer `to`.
      const toKey = normalizeAddr(transfer.toAddress);
      let candidates = remaining.filter(
        (intent) =>
          normalizeAddr(intent.deposit_address) === toKey &&
          amountMatches(Number(intent.amount_usdt), transfer.amountUsdt),
      );

      // Shared-address fallback: amount-only within this address bucket.
      if (candidates.length === 0) {
        candidates = remaining.filter((intent) =>
          amountMatches(Number(intent.amount_usdt), transfer.amountUsdt),
        );
      }

      if (candidates.length === 0) {
        skipped += 1;
        continue;
      }

      candidates.sort((a, b) => {
        const aExact =
          Math.abs(Number(a.amount_usdt) - transfer.amountUsdt) < 0.000001
            ? 0
            : 1;
        const bExact =
          Math.abs(Number(b.amount_usdt) - transfer.amountUsdt) < 0.000001
            ? 0
            : 1;
        return aExact - bExact;
      });
      const intent = candidates[0];
      matched += 1;

      try {
        await supabase.rpc("mark_usdt_payment_intent_detecting", {
          p_payment_intent_id: intent.id,
          p_tx_hash: transfer.txHash,
        });

        const verified = await verifyUsdtTrc20Transfer({
          txHash: transfer.txHash,
          expectedToAddress: intent.deposit_address,
          expectedAmountUsdt: Number(intent.amount_usdt),
        });

        const result = await confirmUsdtTrc20Payment({
          paymentIntentId: intent.id,
          txHash: verified.txHash,
          fromAddress: verified.fromAddress,
          toAddress: verified.toAddress,
          amountUsdt: verified.amountUsdt,
          confirmations: verified.confirmations,
          rawPayload: {
            source: "deposit_monitor",
            hd: intent.derivation_index != null,
            chain: verified.raw,
          },
        });

        confirmed += 1;
        usedHashes.add(hashKey);
        const idx = remaining.findIndex((row) => row.id === intent.id);
        if (idx >= 0) remaining.splice(idx, 1);

        results.push({
          payment_intent_id: intent.id,
          tx_hash: verified.txHash,
          status: result.status,
          deposit_address: intent.deposit_address,
        });

        try {
          await supabase.rpc("enqueue_usdt_sweep_job", {
            p_payment_intent_id: intent.id,
            p_amount_usdt: Number(intent.amount_usdt),
            p_to_address: null,
          });
        } catch {
          // Sweep optional.
        }
      } catch (error) {
        errors.push(
          `${intent.id}: ${
            error instanceof Error ? error.message : "match failed"
          }`,
        );
      }
    }
  }

  return {
    scanned,
    addresses: addressKeys.length,
    matched,
    confirmed,
    skipped,
    errors,
    results,
  };
}

export async function expireStaleUsdtPaymentIntents(limit = 100) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("expire_stale_usdt_payment_intents", {
    p_limit: limit,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? { expired_intents: 0, cancelled_orders: 0 }) as {
    expired_intents: number;
    cancelled_orders: number;
  };
}
