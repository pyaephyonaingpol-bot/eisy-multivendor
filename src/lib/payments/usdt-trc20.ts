import { createServiceClient } from "@/lib/supabase/admin";

/** Official USDT TRC-20 contract on TRON mainnet. */
export const USDT_TRC20_CONTRACT_DEFAULT =
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export type UsdtTrc20Transfer = {
  txHash: string;
  fromAddress: string | null;
  toAddress: string | null;
  amountUsdt: number;
  confirmations: number;
  contractAddress: string;
  confirmed: boolean;
  raw: Record<string, unknown>;
};

export type ConfirmUsdtTrc20PaymentResult = {
  status: "confirmed" | "already_confirmed";
  payment_intent_id: string;
  order_ids: string[];
  tx_hash: string;
  amount_usdt?: number;
};

function trongridBaseUrl() {
  return (
    process.env.TRONGRID_API_BASE?.trim() || "https://api.trongrid.io"
  ).replace(/\/$/, "");
}

function trongridHeaders(): HeadersInit {
  const apiKey = process.env.TRONGRID_API_KEY?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }
  return headers;
}

export function getConfiguredUsdtDepositAddress(): string | null {
  return process.env.USDT_TRC20_DEPOSIT_ADDRESS?.trim() || null;
}

export function getConfiguredUsdtContractAddress(): string {
  return (
    process.env.USDT_TRC20_CONTRACT_ADDRESS?.trim() ||
    USDT_TRC20_CONTRACT_DEFAULT
  );
}

export function getUsdtWebhookSecret(): string | null {
  return (
    process.env.USDT_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  );
}

/**
 * Syncs deposit/contract settings from env into usdt_payment_settings so the
 * SQL checkout RPCs can resolve a deposit address.
 */
export async function syncUsdtTrc20SettingsFromEnv(): Promise<string | null> {
  const depositAddress = getConfiguredUsdtDepositAddress();
  if (!depositAddress) {
    return null;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("usdt_payment_settings").upsert(
    {
      id: 1,
      deposit_address: depositAddress,
      contract_address: getConfiguredUsdtContractAddress(),
      network: "TRC20",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Failed to sync USDT TRC-20 settings: ${error.message}`);
  }

  return depositAddress;
}

function normalizeAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Verifies a TRC-20 USDT transfer via TronGrid against the deposit address.
 */
export async function verifyUsdtTrc20Transfer(options: {
  txHash: string;
  expectedToAddress: string;
  expectedAmountUsdt?: number | null;
  minConfirmations?: number;
}): Promise<UsdtTrc20Transfer> {
  const txHash = options.txHash.trim();
  if (txHash.length < 8) {
    throw new Error("Invalid transaction hash.");
  }

  const contract = getConfiguredUsdtContractAddress();
  const toAddress = options.expectedToAddress.trim();
  const url = new URL(
    `${trongridBaseUrl()}/v1/accounts/${toAddress}/transactions/trc20`,
  );
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", "50");
  url.searchParams.set("contract_address", contract);

  const response = await fetch(url.toString(), {
    headers: trongridHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `TronGrid lookup failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };

  const rows = Array.isArray(payload.data) ? payload.data : [];
  const match = rows.find((row) => {
    const hash = String(row.transaction_id ?? row.txID ?? "").trim();
    return hash.toLowerCase() === txHash.toLowerCase();
  });

  if (!match) {
    throw new Error(
      "USDT TRC-20 transfer not found for this deposit address yet. Wait for confirmation and try again.",
    );
  }

  const tokenInfo = (match.token_info ?? {}) as Record<string, unknown>;
  const decimals = Number(tokenInfo.decimals ?? 6);
  const rawValue = match.value ?? match.quant ?? match.amount;
  let amountUsdt: number | null = null;

  if (typeof rawValue === "string" && /^\d+$/.test(rawValue.trim())) {
    amountUsdt =
      Number(rawValue.trim()) /
      10 ** (Number.isFinite(decimals) ? decimals : 6);
  } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    amountUsdt = rawValue;
  } else if (typeof rawValue === "string" && rawValue.trim()) {
    const asFloat = Number(rawValue);
    amountUsdt = Number.isFinite(asFloat) ? asFloat : null;
  }

  if (amountUsdt == null || amountUsdt <= 0) {
    throw new Error("Could not parse USDT amount from on-chain transfer.");
  }

  if (
    options.expectedAmountUsdt != null &&
    amountUsdt + 0.000001 < options.expectedAmountUsdt
  ) {
    throw new Error(
      `On-chain amount ${amountUsdt} USDT is less than required ${options.expectedAmountUsdt} USDT.`,
    );
  }

  const fromAddress = normalizeAddress(
    String(match.from ?? match.from_address ?? ""),
  );
  const observedTo = normalizeAddress(
    String(match.to ?? match.to_address ?? ""),
  );

  if (observedTo && observedTo.toLowerCase() !== toAddress.toLowerCase()) {
    throw new Error("Transfer destination does not match deposit address.");
  }

  const minConfirmations = options.minConfirmations ?? 1;
  const confirmations =
    typeof match.confirmed === "boolean" && match.confirmed
      ? Math.max(1, minConfirmations)
      : Number(match.block_timestamp ? 1 : 0);

  if (confirmations < minConfirmations) {
    throw new Error(
      `Transaction needs at least ${minConfirmations} confirmation(s).`,
    );
  }

  return {
    txHash: String(match.transaction_id ?? txHash),
    fromAddress,
    toAddress: observedTo ?? toAddress,
    amountUsdt,
    confirmations,
    contractAddress: contract,
    confirmed: true,
    raw: match,
  };
}

export async function confirmUsdtTrc20Payment(args: {
  paymentIntentId: string;
  txHash: string;
  fromAddress?: string | null;
  toAddress?: string | null;
  amountUsdt?: number | null;
  confirmations?: number | null;
  rawPayload?: Record<string, unknown>;
}): Promise<ConfirmUsdtTrc20PaymentResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("confirm_usdt_trc20_payment", {
    p_payment_intent_id: args.paymentIntentId,
    p_tx_hash: args.txHash,
    p_from_address: args.fromAddress ?? null,
    p_to_address: args.toAddress ?? null,
    p_amount_usdt: args.amountUsdt ?? null,
    p_confirmations: args.confirmations ?? null,
    p_raw_payload: args.rawPayload ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = data as {
    status: string;
    payment_intent_id: string;
    order_ids: string[];
    tx_hash: string;
    amount_usdt?: number;
  };

  return {
    status:
      result.status === "already_confirmed"
        ? "already_confirmed"
        : "confirmed",
    payment_intent_id: result.payment_intent_id,
    order_ids: result.order_ids ?? [],
    tx_hash: result.tx_hash,
    amount_usdt: result.amount_usdt,
  };
}
