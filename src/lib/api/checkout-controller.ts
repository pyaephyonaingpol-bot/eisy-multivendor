import { revalidatePath } from "next/cache";
import type { CartCheckoutItem } from "@/lib/cart/types";
import { getSessionProfile } from "@/lib/auth/session";
import { syncUsdtTrc20SettingsFromEnv } from "@/lib/payments/usdt-trc20";
import { createClient } from "@/lib/supabase/server";

export type CheckoutControllerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

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

export type CheckoutRequestBody = {
  items?: Array<{ product_id?: string; productId?: string; quantity?: number }>;
  payment_method?: "wallet" | "trc20" | string;
  shipping_address?: {
    full_name?: string | null;
    phone?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
    country?: string | null;
    note?: string | null;
  } | null;
};

function parseItems(
  raw: CheckoutRequestBody["items"],
): CartCheckoutItem[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Your cart is empty." };
  }

  const items = raw
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

  if (items.length === 0) {
    return { error: "Your cart is empty." };
  }

  return items;
}

export async function createCheckout(
  body: CheckoutRequestBody,
): Promise<
  CheckoutControllerResult<{
    payment_method: "wallet" | "trc20";
    order_ids: string[];
    total: number;
    currency: string;
    escrow: "held_on_payment" | "pending_trc20_payment";
    wallet_transaction_id?: string;
    payment_intent?: {
      id: string;
      deposit_address: string;
      network: string;
      usdt_contract: string;
      expires_at: string;
    };
  }>
> {
  const session = await getSessionProfile();
  if (!session) {
    return { ok: false, error: "Sign in to pay with USDT.", status: 401 };
  }

  const parsedItems = parseItems(body.items);
  if ("error" in parsedItems) {
    return { ok: false, error: parsedItems.error, status: 400 };
  }

  const paymentMethod: "wallet" | "trc20" =
    String(body.payment_method ?? "wallet").toLowerCase() === "trc20"
      ? "trc20"
      : "wallet";

  const ship = body.shipping_address ?? null;
  const shippingAddress =
    ship &&
    (ship.full_name || ship.phone || ship.line1 || ship.city)
      ? {
          full_name: ship.full_name ?? null,
          phone: ship.phone ?? null,
          line1: ship.line1 ?? null,
          line2: ship.line2 ?? null,
          city: ship.city ?? null,
          region: ship.region ?? null,
          postal_code: ship.postal_code ?? null,
          country: (ship.country ?? "MM").trim() || "MM",
          note: ship.note ?? null,
        }
      : null;

  const shipCountry =
    shippingAddress?.country?.trim().toUpperCase() || "MM";

  const supabase = await createClient();
  const { error: deliverabilityError } = await supabase.rpc(
    "assert_cart_deliverable_to_country",
    {
      p_items: parsedItems,
      p_country_code: shipCountry,
    },
  );
  if (deliverabilityError) {
    return { ok: false, error: deliverabilityError.message, status: 400 };
  }

  const { assertCjLiveStockForCartItems } = await import(
    "@/lib/suppliers/cj-live-stock"
  );
  const cjStock = await assertCjLiveStockForCartItems(parsedItems);
  if (!cjStock.ok) {
    return { ok: false, error: cjStock.error, status: 409 };
  }

  if (paymentMethod === "trc20") {
    try {
      const deposit = await syncUsdtTrc20SettingsFromEnv();
      if (!deposit) {
        return {
          ok: false,
          error:
            "USDT TRC-20 gateway is not configured. Set USDT_TRC20_DEPOSIT_ADDRESS or pay with your wallet.",
          status: 400,
        };
      }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Gateway configuration failed.",
        status: 400,
      };
    }

    const { data, error } = await supabase.rpc("create_usdt_trc20_checkout", {
      p_items: parsedItems,
      p_shipping_address: shippingAddress,
    });

    if (error) {
      return { ok: false, error: error.message, status: 400 };
    }

    const result = data as Trc20CheckoutRpcResult | null;
    const orderIds = result?.order_ids ?? [];
    const intentId = result?.payment_intent_id;

    if (orderIds.length === 0 || !intentId) {
      return {
        ok: false,
        error: "Checkout completed but no payment intent was returned.",
        status: 500,
      };
    }

    revalidatePath("/cart");
    revalidatePath("/checkout");
    revalidatePath("/orders");

    return {
      ok: true,
      data: {
        payment_method: "trc20",
        order_ids: orderIds,
        total: Number(result?.total ?? 0),
        currency: result?.currency ?? "USDT",
        escrow: "pending_trc20_payment",
        payment_intent: {
          id: intentId,
          deposit_address: result?.deposit_address ?? "",
          network: result?.network ?? "TRC20",
          usdt_contract: result?.usdt_contract ?? "",
          expires_at: result?.expires_at ?? "",
        },
      },
    };
  }

  const { data, error } = await supabase.rpc("checkout_with_usdt", {
    p_items: parsedItems,
    p_shipping_address: shippingAddress,
  });

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  const result = data as WalletCheckoutRpcResult | null;
  const orderIds = result?.order_ids ?? [];

  if (orderIds.length === 0) {
    return {
      ok: false,
      error: "Checkout completed but no orders were returned.",
      status: 500,
    };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/account/wallet");
  revalidatePath("/orders");
  revalidatePath("/vendor/wallet");

  void import("@/lib/suppliers/fulfillment")
    .then(({ processSupplierFulfillmentJobs }) =>
      processSupplierFulfillmentJobs(10),
    )
    .catch(() => undefined);

  return {
    ok: true,
    data: {
      payment_method: "wallet",
      order_ids: orderIds,
      total: Number(result?.total ?? 0),
      currency: result?.currency ?? "USDT",
      escrow: "held_on_payment",
      wallet_transaction_id: result?.wallet_transaction_id,
    },
  };
}
