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
 *
 * Prefer an explicit USDT_TRC20_DEPOSIT_ADDRESS; otherwise when an HD mnemonic
 * is configured, use the BIP-44 master address (account 0 / index 0).
 */
export async function syncUsdtTrc20SettingsFromEnv(): Promise<string | null> {
  const { isHdWalletConfigured, getHdMasterDepositAddress } = await import(
    "@/lib/payments/tron-hd-wallet"
  );

  let depositAddress = getConfiguredUsdtDepositAddress();
  let hdMaster: string | null = null;

  if (!depositAddress && isHdWalletConfigured()) {
    hdMaster = getHdMasterDepositAddress();
    depositAddress = hdMaster;
  } else if (isHdWalletConfigured()) {
    try {
      hdMaster = getHdMasterDepositAddress();
    } catch {
      hdMaster = null;
    }
  }

  if (!depositAddress) {
    return null;
  }

  const sweepDestination =
    process.env.USDT_TRC20_SWEEP_DESTINATION?.trim() || null;

  const supabase = createServiceClient();
  const { error } = await supabase.from("usdt_payment_settings").upsert(
    {
      id: 1,
      deposit_address: depositAddress,
      contract_address: getConfiguredUsdtContractAddress(),
      network: "TRC20",
      ...(hdMaster
        ? { hd_master_address: hdMaster, hd_enabled: true }
        : {}),
      ...(sweepDestination
        ? {
            sweep_destination_address: sweepDestination,
            auto_sweep_enabled: true,
          }
        : {}),
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

  if (options.expectedAmountUsdt != null) {
    if (amountUsdt + 0.000001 < options.expectedAmountUsdt) {
      throw new Error(
        `On-chain amount ${amountUsdt} USDT is less than required ${options.expectedAmountUsdt} USDT.`,
      );
    }
    // Shared deposit address: reject claiming a larger transfer for a smaller intent.
    if (amountUsdt > options.expectedAmountUsdt * 1.02 + 0.000001) {
      throw new Error(
        `On-chain amount ${amountUsdt} USDT does not match required ${options.expectedAmountUsdt} USDT.`,
      );
    }
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

/**
 * Verify a USDT TRC-20 transfer by transaction id via TronGrid
 * `/v1/transactions/{txId}` (+ `/events` fallback for Transfer events).
 */
export async function verifyUsdtTrc20TransferByTxId(options: {
  txId: string;
  expectedToAddress: string;
  expectedAmountUsdt: number;
  minConfirmations?: number;
}): Promise<UsdtTrc20Transfer> {
  const txId = options.txId.trim();
  if (txId.length < 8) {
    throw new Error("Invalid transaction id.");
  }

  const contract = getConfiguredUsdtContractAddress().toLowerCase();
  const expectedTo = options.expectedToAddress.trim().toLowerCase();
  const base = trongridBaseUrl();

  const txResponse = await fetch(`${base}/v1/transactions/${txId}`, {
    headers: trongridHeaders(),
    cache: "no-store",
  });

  if (!txResponse.ok) {
    const text = await txResponse.text().catch(() => "");
    throw new Error(
      `TronGrid transaction lookup failed (${txResponse.status}): ${text.slice(0, 200)}`,
    );
  }

  const txPayload = (await txResponse.json()) as {
    data?: Array<Record<string, unknown>>;
    success?: boolean;
  };
  const txRow = Array.isArray(txPayload.data) ? txPayload.data[0] : null;
  if (!txRow) {
    throw new Error("Transaction not found on TronGrid.");
  }

  const ret =
    Array.isArray(txRow.ret) && txRow.ret[0]
      ? (txRow.ret[0] as Record<string, unknown>)
      : null;
  const contractRet = String(ret?.contractRet ?? "");
  if (contractRet && contractRet !== "SUCCESS") {
    throw new Error(`Transaction failed on-chain (${contractRet}).`);
  }

  const confirmed =
    txRow.confirmed === true ||
    txRow.ret != null ||
    Boolean(txRow.blockNumber ?? txRow.block_timestamp);

  if (!confirmed) {
    throw new Error("Transaction is not confirmed yet.");
  }

  // Prefer TRC-20 Transfer events for this tx.
  const eventsResponse = await fetch(
    `${base}/v1/transactions/${txId}/events`,
    {
      headers: trongridHeaders(),
      cache: "no-store",
    },
  );

  let amountUsdt: number | null = null;
  let fromAddress: string | null = null;
  let toAddress: string | null = null;
  let eventRaw: Record<string, unknown> = txRow;

  if (eventsResponse.ok) {
    const eventsPayload = (await eventsResponse.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    const events = Array.isArray(eventsPayload.data) ? eventsPayload.data : [];
    const transfer = events.find((event) => {
      const eventName = String(event.event_name ?? event.name ?? "");
      const contractAddress = String(
        event.contract_address ?? event.contractAddress ?? "",
      ).toLowerCase();
      return (
        eventName.toLowerCase() === "transfer" &&
        (contractAddress === contract ||
          contractAddress.includes(contract.slice(0, 8)))
      );
    });

    if (transfer) {
      eventRaw = transfer;
      const result = (transfer.result ?? transfer) as Record<string, unknown>;
      fromAddress = normalizeAddress(
        String(result.from ?? result[0] ?? transfer.from ?? ""),
      );
      toAddress = normalizeAddress(
        String(result.to ?? result[1] ?? transfer.to ?? ""),
      );
      const rawValue = result.value ?? result[2] ?? transfer.value;
      if (typeof rawValue === "string" && /^\d+$/.test(rawValue.trim())) {
        amountUsdt = Number(rawValue.trim()) / 1e6;
      } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        amountUsdt = rawValue > 1e6 ? rawValue / 1e6 : rawValue;
      }
    }
  }

  // Fallback: scan deposit-address TRC-20 history for this tx id.
  if (amountUsdt == null || !toAddress) {
    const fallback = await verifyUsdtTrc20Transfer({
      txHash: txId,
      expectedToAddress: options.expectedToAddress,
      expectedAmountUsdt: options.expectedAmountUsdt,
      minConfirmations: options.minConfirmations,
    });
    return fallback;
  }

  if (toAddress.toLowerCase() !== expectedTo) {
    throw new Error(
      "Transfer recipient does not match the order deposit address.",
    );
  }

  if (amountUsdt + 0.000001 < options.expectedAmountUsdt) {
    throw new Error(
      `On-chain amount ${amountUsdt} USDT is less than required ${options.expectedAmountUsdt} USDT.`,
    );
  }
  if (amountUsdt > options.expectedAmountUsdt * 1.02 + 0.000001) {
    throw new Error(
      `On-chain amount ${amountUsdt} USDT does not match required ${options.expectedAmountUsdt} USDT.`,
    );
  }

  return {
    txHash: txId,
    fromAddress,
    toAddress,
    amountUsdt,
    confirmations: 1,
    contractAddress: getConfiguredUsdtContractAddress(),
    confirmed: true,
    raw: eventRaw,
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

  // Paid orders enqueue CJ/DSers jobs via SQL trigger; process a batch promptly.
  if (result.status === "confirmed" && (result.order_ids?.length ?? 0) > 0) {
    void import("@/lib/suppliers/fulfillment")
      .then(({ processSupplierFulfillmentJobs }) =>
        processSupplierFulfillmentJobs(10),
      )
      .catch(() => undefined);
  }

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
