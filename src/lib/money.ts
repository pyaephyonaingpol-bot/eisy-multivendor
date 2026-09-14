import type {
  Wallet,
  WalletCurrency,
  WalletTransaction,
  WalletTxStatus,
  WalletTxType,
} from "@/lib/types/database";

/** Marketplace settlement currency for product pricing and checkout. */
export const MARKETPLACE_CURRENCY = "USDT" as const;

export type {
  Wallet,
  WalletCurrency,
  WalletTransaction,
  WalletTxStatus,
  WalletTxType,
};

export function formatMoney(amount: number, currency: string = MARKETPLACE_CURRENCY) {
  const code = (currency || MARKETPLACE_CURRENCY).toUpperCase();
  // USDT / MMK are not always reliable ISO codes in Intl — format explicitly.
  if (code === "USDT") {
    return `USDT ${Number(amount).toFixed(2)}`;
  }
  if (code === "MMK") {
    return `MMK ${Number(amount).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${Number(amount).toFixed(2)}`;
  }
}
