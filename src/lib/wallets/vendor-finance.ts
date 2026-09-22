import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  getDropshipFeeSettings,
  listDropshipInventoryFeeInvoices,
} from "@/lib/fees/queries";
import type { Wallet, WalletTransaction } from "@/lib/money";
import type {
  DropshipInventoryFeeInvoice,
  FulfillmentChannel,
  Order,
  OrderItem,
} from "@/lib/types/database";
import {
  listWalletTransactionsForUser,
  listWalletsForUser,
} from "@/lib/wallets/queries";

export type ChannelIncomeSummary = {
  channel: FulfillmentChannel;
  order_count: number;
  gross_revenue_usdt: number;
  product_cost_usdt: number;
  platform_commission_usdt: number;
  net_profit_usdt: number;
  commission_rate: number;
};

export type SubscriptionExpenseSummary = {
  invoices: DropshipInventoryFeeInvoice[];
  paid_usdt: number;
  pending_usdt: number;
  failed_usdt: number;
  invoice_count: number;
};

export type WithdrawalSummary = {
  completed_usdt: number;
  pending_usdt: number;
  rejected_usdt: number;
  history: WalletTransaction[];
};

export type VendorFinanceSnapshot = {
  wallets: Wallet[];
  available_usdt: number;
  pending_usdt: number;
  escrow_usdt: number;
  available_mmk: number;
  pending_mmk: number;
  commission_rate: number;
  custom: ChannelIncomeSummary;
  dropship: ChannelIncomeSummary;
  totals: {
    gross_revenue_usdt: number;
    product_cost_usdt: number;
    platform_commission_usdt: number;
    net_profit_usdt: number;
    order_count: number;
  };
  subscriptions: SubscriptionExpenseSummary;
  withdrawals: WithdrawalSummary;
  transactions: WalletTransaction[];
  sale_credits: WalletTransaction[];
  commission_txs: WalletTransaction[];
  inventory_fee_txs: WalletTransaction[];
  escrow_txs: WalletTransaction[];
};

function emptyChannel(
  channel: FulfillmentChannel,
  commissionRate: number,
): ChannelIncomeSummary {
  return {
    channel,
    order_count: 0,
    gross_revenue_usdt: 0,
    product_cost_usdt: 0,
    platform_commission_usdt: 0,
    net_profit_usdt: 0,
    commission_rate: commissionRate,
  };
}

function costForOrderItems(items: OrderItem[], isResale: boolean): number {
  if (!isResale) {
    return 0;
  }
  return items.reduce((sum, item) => {
    const unit = Number(item.cost_unit_price ?? 0);
    const qty = Number(item.quantity ?? 0);
    if (unit > 0) {
      return sum + unit * qty;
    }
    // Fallback: listing − margin style when cost missing but unit prices differ.
    return sum;
  }, 0);
}

function accumulateChannel(
  summary: ChannelIncomeSummary,
  order: Order,
  items: OrderItem[],
  vendorId: string,
) {
  const isSeller = order.seller_vendor_id === vendorId;
  const isFulfillment = order.vendor_id === vendorId;
  if (!isSeller && !isFulfillment) {
    return;
  }

  const isResale = order.seller_vendor_id !== order.vendor_id;
  const gross = Number(order.subtotal ?? 0);
  const commission = Number(order.platform_commission_usdt ?? 0);
  const itemCost = costForOrderItems(items, isResale);

  if (isSeller) {
    // Storefront seller: GMV − product cost − platform commission.
    summary.order_count += 1;
    summary.gross_revenue_usdt += gross;
    summary.product_cost_usdt += itemCost;
    summary.platform_commission_usdt += commission;
    summary.net_profit_usdt += Math.max(gross - itemCost - commission, 0);
    return;
  }

  // Fulfillment-only supplier on a resale: credit is the product cost line.
  if (isResale && itemCost > 0) {
    summary.order_count += 1;
    summary.gross_revenue_usdt += itemCost;
    summary.product_cost_usdt += 0;
    summary.platform_commission_usdt += 0;
    summary.net_profit_usdt += itemCost;
  }
}

export async function getVendorFinanceSnapshot(
  userId: string,
  vendorId: string,
): Promise<VendorFinanceSnapshot> {
  const commissionRateDefault = 0.1;
  const empty: VendorFinanceSnapshot = {
    wallets: [],
    available_usdt: 0,
    pending_usdt: 0,
    escrow_usdt: 0,
    available_mmk: 0,
    pending_mmk: 0,
    commission_rate: commissionRateDefault,
    custom: emptyChannel("manual", commissionRateDefault),
    dropship: emptyChannel("cj", commissionRateDefault),
    totals: {
      gross_revenue_usdt: 0,
      product_cost_usdt: 0,
      platform_commission_usdt: 0,
      net_profit_usdt: 0,
      order_count: 0,
    },
    subscriptions: {
      invoices: [],
      paid_usdt: 0,
      pending_usdt: 0,
      failed_usdt: 0,
      invoice_count: 0,
    },
    withdrawals: {
      completed_usdt: 0,
      pending_usdt: 0,
      rejected_usdt: 0,
      history: [],
    },
    transactions: [],
    sale_credits: [],
    commission_txs: [],
    inventory_fee_txs: [],
    escrow_txs: [],
  };

  if (!getSupabasePublicEnv() || !userId || !vendorId) {
    return empty;
  }

  const supabase = await createClient();

  const [wallets, transactions, settings, invoices, ordersResult] =
    await Promise.all([
      listWalletsForUser(userId),
      listWalletTransactionsForUser(userId, 100),
      getDropshipFeeSettings(),
      listDropshipInventoryFeeInvoices(vendorId, 24),
      supabase
        .from("orders")
        .select(
          "id, vendor_id, seller_vendor_id, subtotal, platform_commission_usdt, payment_status, fulfillment_channel, created_at",
        )
        .eq("payment_status", "paid")
        .or(`seller_vendor_id.eq.${vendorId},vendor_id.eq.${vendorId}`)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

  const commissionRate = Number(settings?.commission_rate ?? commissionRateDefault);
  const custom = emptyChannel("manual", commissionRate);
  const dropship = emptyChannel("cj", commissionRate);

  const orderRows =
    (ordersResult.data as Array<{
      id: string;
      vendor_id: string;
      seller_vendor_id: string;
      subtotal: number;
      platform_commission_usdt: number;
      payment_status: string;
      fulfillment_channel: FulfillmentChannel | null;
      created_at: string;
    }> | null) ?? [];

  const orderIds = orderRows.map((row) => row.id);
  let itemsByOrder = new Map<string, OrderItem[]>();

  if (orderIds.length > 0) {
    const { data: itemRows } = await supabase
      .from("order_items")
      .select(
        "id, order_id, quantity, unit_price, cost_unit_price, total_price, platform_commission_usdt",
      )
      .in("order_id", orderIds);

    itemsByOrder = new Map();
    for (const item of (itemRows as OrderItem[] | null) ?? []) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }
  }

  for (const row of orderRows) {
    const channel: FulfillmentChannel =
      row.fulfillment_channel === "cj" ? "cj" : "manual";
    const target = channel === "cj" ? dropship : custom;
    accumulateChannel(
      target,
      row as Order,
      itemsByOrder.get(row.id) ?? [],
      vendorId,
    );
  }

  const usdt = wallets.find((wallet) => wallet.currency === "USDT");
  const mmk = wallets.find((wallet) => wallet.currency === "MMK");

  const paidInvoices = invoices.filter((inv) => inv.status === "paid");
  const pendingInvoices = invoices.filter((inv) => inv.status === "pending");
  const failedInvoices = invoices.filter((inv) => inv.status === "failed");

  const withdrawalHistory = transactions.filter(
    (tx) => tx.tx_type === "withdrawal",
  );

  const sumTx = (rows: WalletTransaction[], status: string) =>
    rows
      .filter((tx) => tx.status === status && tx.currency === "USDT")
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const snapshot: VendorFinanceSnapshot = {
    wallets,
    available_usdt: Number(usdt?.available_balance ?? 0),
    pending_usdt: Number(usdt?.pending_balance ?? 0),
    escrow_usdt: Number(usdt?.escrow_balance ?? 0),
    available_mmk: Number(mmk?.available_balance ?? 0),
    pending_mmk: Number(mmk?.pending_balance ?? 0),
    commission_rate: commissionRate,
    custom,
    dropship,
    totals: {
      gross_revenue_usdt:
        custom.gross_revenue_usdt + dropship.gross_revenue_usdt,
      product_cost_usdt:
        custom.product_cost_usdt + dropship.product_cost_usdt,
      platform_commission_usdt:
        custom.platform_commission_usdt + dropship.platform_commission_usdt,
      net_profit_usdt: custom.net_profit_usdt + dropship.net_profit_usdt,
      order_count: custom.order_count + dropship.order_count,
    },
    subscriptions: {
      invoices,
      paid_usdt: paidInvoices.reduce(
        (sum, inv) => sum + Number(inv.amount_usdt),
        0,
      ),
      pending_usdt: pendingInvoices.reduce(
        (sum, inv) => sum + Number(inv.amount_usdt),
        0,
      ),
      failed_usdt: failedInvoices.reduce(
        (sum, inv) => sum + Number(inv.amount_usdt),
        0,
      ),
      invoice_count: invoices.length,
    },
    withdrawals: {
      completed_usdt: sumTx(withdrawalHistory, "completed"),
      pending_usdt: sumTx(withdrawalHistory, "pending"),
      rejected_usdt: sumTx(withdrawalHistory, "rejected"),
      history: withdrawalHistory,
    },
    transactions,
    sale_credits: transactions.filter(
      (tx) =>
        tx.tx_type === "sale_credit" ||
        tx.tx_type === "escrow_release",
    ),
    commission_txs: transactions.filter(
      (tx) => tx.tx_type === "platform_commission",
    ),
    inventory_fee_txs: transactions.filter(
      (tx) => tx.tx_type === "inventory_fee",
    ),
    escrow_txs: transactions.filter(
      (tx) =>
        tx.tx_type === "escrow_hold" ||
        tx.tx_type === "escrow_release" ||
        tx.tx_type === "escrow_refund",
    ),
  };

  return snapshot;
}
