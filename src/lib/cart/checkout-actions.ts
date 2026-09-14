"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CartCheckoutItem } from "@/lib/cart/types";
import { createClient } from "@/lib/supabase/server";

export type CheckoutActionState = {
  error?: string;
  orderIds?: string[];
} | null;

type CheckoutRpcResult = {
  order_ids: string[];
  total: number;
  currency: string;
  wallet_transaction_id: string;
};

export async function checkoutWithUsdt(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
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

  let items: CartCheckoutItem[] = [];
  try {
    const parsed = JSON.parse(rawItems) as CartCheckoutItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { error: "Your cart is empty." };
    }
    items = parsed
      .map((item) => ({
        product_id: String(item.product_id ?? ""),
        quantity: Number(item.quantity),
      }))
      .filter(
        (item) =>
          item.product_id.length > 0 &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0,
      );
  } catch {
    return { error: "Cart payload is invalid. Refresh and try again." };
  }

  if (items.length === 0) {
    return { error: "Your cart is empty." };
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to pay with your USDT wallet." };
  }

  const { data, error } = await supabase.rpc("checkout_with_usdt", {
    p_items: items,
    p_shipping_address: shippingAddress,
  });

  if (error) {
    return { error: error.message };
  }

  const result = data as CheckoutRpcResult | null;
  const orderIds = result?.order_ids ?? [];

  if (orderIds.length === 0) {
    return { error: "Checkout completed but no orders were returned." };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/account/wallet");
  revalidatePath("/vendor/wallet");

  redirect(`/checkout/success?orders=${orderIds.join(",")}`);
}
