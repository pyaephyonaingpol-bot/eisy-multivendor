"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CartCheckoutItem } from "@/lib/cart/types";
import { syncUsdtTrc20SettingsFromEnv } from "@/lib/payments/usdt-trc20";
import { createClient } from "@/lib/supabase/server";

export type CheckoutActionState = {
  error?: string;
  orderIds?: string[];
} | null;

type WalletCheckoutRpcResult = {
  order_ids: string[];
  total: number;
  currency: string;
  wallet_transaction_id: string;
};

type Trc20CheckoutRpcResult = {
  order_ids: string[];
  total: number;
  currency: string;
  payment_method: string;
  payment_intent_id: string;
  deposit_address: string;
  network: string;
  usdt_contract: string;
  expires_at: string;
};

function parseCheckoutForm(formData: FormData): {
  items: CartCheckoutItem[];
  shippingAddress: Record<string, string | null> | null;
  paymentMethod: "wallet" | "trc20";
  error?: string;
} {
  const rawItems = String(formData.get("items") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const line1 = String(formData.get("line1") ?? "").trim();
  const line2 = String(formData.get("line2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || "MM";
  const note = String(formData.get("note") ?? "").trim();
  const paymentMethodRaw = String(formData.get("payment_method") ?? "wallet")
    .trim()
    .toLowerCase();
  const paymentMethod: "wallet" | "trc20" =
    paymentMethodRaw === "trc20" ? "trc20" : "wallet";

  let items: CartCheckoutItem[] = [];
  try {
    const parsed = JSON.parse(rawItems) as Array<{
      product_id?: string;
      productId?: string;
      quantity?: number;
    }>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return {
        items: [],
        shippingAddress: null,
        paymentMethod,
        error: "Your cart is empty.",
      };
    }
    items = parsed
      .map((item) => ({
        product_id: String(item.product_id ?? item.productId ?? ""),
        quantity: Number(item.quantity),
      }))
      .filter(
        (item) =>
          item.product_id.length > 0 &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0,
      );
  } catch {
    return {
      items: [],
      shippingAddress: null,
      paymentMethod,
      error: "Cart payload is invalid. Refresh and try again.",
    };
  }

  if (items.length === 0) {
    return {
      items: [],
      shippingAddress: null,
      paymentMethod,
      error: "Your cart is empty.",
    };
  }

  const shippingAddress =
    fullName || phone || line1 || city
      ? {
          full_name: fullName || null,
          phone: phone || null,
          line1: line1 || null,
          line2: line2 || null,
          city: city || null,
          region: region || null,
          postal_code: postalCode || null,
          country,
          note: note || null,
        }
      : null;

  return { items, shippingAddress, paymentMethod };
}

export async function checkoutWithUsdt(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = parseCheckoutForm(formData);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to pay with USDT." };
  }

  const shipCountry =
    parsed.shippingAddress?.country?.trim().toUpperCase() || "MM";

  const { error: deliverabilityError } = await supabase.rpc(
    "assert_cart_deliverable_to_country",
    {
      p_items: parsed.items,
      p_country_code: shipCountry,
    },
  );
  if (deliverabilityError) {
    return { error: deliverabilityError.message };
  }

  const { assertCjLiveStockForCartItems } = await import(
    "@/lib/suppliers/cj-live-stock"
  );
  const cjStock = await assertCjLiveStockForCartItems(parsed.items);
  if (!cjStock.ok) {
    return { error: cjStock.error };
  }

  const { assertCjShipsToDestinationForCartItems } = await import(
    "@/lib/suppliers/cj-shipping"
  );
  const cjShip = await assertCjShipsToDestinationForCartItems(
    parsed.items,
    shipCountry,
    { zip: parsed.shippingAddress?.postal_code },
  );
  if (!cjShip.ok) {
    return { error: cjShip.error };
  }

  if (parsed.paymentMethod === "trc20") {
    try {
      const deposit = await syncUsdtTrc20SettingsFromEnv();
      if (!deposit) {
        return {
          error:
            "USDT TRC-20 gateway is not configured. Set USDT_TRC20_HD_MNEMONIC or USDT_TRC20_DEPOSIT_ADDRESS, or pay with your wallet.",
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gateway configuration failed.";
      return { error: message };
    }

    const { data, error } = await supabase.rpc("create_usdt_trc20_checkout", {
      p_items: parsed.items,
      p_shipping_address: parsed.shippingAddress,
    });

    if (error) {
      return { error: error.message };
    }

    const result = data as Trc20CheckoutRpcResult | null;
    const orderIds = result?.order_ids ?? [];
    const intentId = result?.payment_intent_id;

    if (orderIds.length === 0 || !intentId) {
      return { error: "Checkout completed but no payment intent was returned." };
    }

    // Prefer a unique HD child address per intent when a mnemonic is configured.
    let depositAddress = result?.deposit_address ?? "";
    try {
      const { isHdWalletConfigured } = await import(
        "@/lib/payments/tron-hd-wallet"
      );
      if (isHdWalletConfigured()) {
        const { provisionPaymentIntentHdDeposit } = await import(
          "@/lib/payments/usdt-hd-deposits"
        );
        const derived = await provisionPaymentIntentHdDeposit(intentId);
        depositAddress = derived.address;
      }
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to allocate a unique USDT deposit address.",
      };
    }

    revalidatePath("/cart");
    revalidatePath("/checkout");
    revalidatePath("/orders");
    for (const orderId of orderIds) {
      revalidatePath(`/checkout/${orderId}`);
    }

    // Primary deposit UX: per-order checkout page with QR + TxID confirm.
    // Multi-order intents share one deposit address; land on the first order.
    redirect(`/checkout/${orderIds[0]}`);
  }

  const { data, error } = await supabase.rpc("checkout_with_usdt", {
    p_items: parsed.items,
    p_shipping_address: parsed.shippingAddress,
  });

  if (error) {
    return { error: error.message };
  }

  const result = data as WalletCheckoutRpcResult | null;
  const orderIds = result?.order_ids ?? [];

  if (orderIds.length === 0) {
    return { error: "Checkout completed but no orders were returned." };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/account/wallet");
  revalidatePath("/orders");
  revalidatePath("/vendor/wallet");

  // Wallet checkout marks orders paid immediately → SQL enqueues CJ/DSers jobs.
  void import("@/lib/suppliers/fulfillment")
    .then(({ processSupplierFulfillmentJobs }) =>
      processSupplierFulfillmentJobs(10),
    )
    .catch(() => undefined);

  redirect(`/checkout/success?orders=${orderIds.join(",")}`);
}
