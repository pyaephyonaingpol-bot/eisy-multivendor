import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { queryCjVariantAvailableStock } from "@/lib/suppliers/cj";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";
import {
  MIN_IMPORT_STOCK_QUANTITY,
  meetsMinImportStock,
  useLiveSupplierApi,
  type SupplierCredentials,
} from "@/lib/suppliers/types";

export type CjLiveStockLine = {
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
  quantity: number;
  productName?: string | null;
  productId?: string | null;
};

function formatOutOfStockNotice(args: {
  productName?: string | null;
  available: number | null;
  requested: number;
}): string {
  const label = (args.productName ?? "This product").trim() || "This product";
  if (args.available == null) {
    return `${label} is currently out of stock at CJ Dropshipping (could not verify live inventory). Try again shortly or pick another variant.`;
  }
  if (args.available <= 0) {
    return `${label} is out of stock at CJ Dropshipping (0 units available).`;
  }
  return `${label} is out of stock for your quantity — CJ has ${args.available} unit${
    args.available === 1 ? "" : "s"
  } available, but ${args.requested} ${
    args.requested === 1 ? "was" : "were"
  } requested.`;
}

/**
 * Real-time CJ variant stock check for one line.
 * Fail-closed when live API is enabled and stock cannot be verified.
 */
export async function verifyCjLiveVariantStock(
  line: CjLiveStockLine,
  credentials?: SupplierCredentials | null,
): Promise<
  | { ok: true; available: number | null; skipped: boolean }
  | { ok: false; error: string; available: number | null }
> {
  const linked =
    credentials !== undefined
      ? { credentials: credentials ?? null }
      : await loadPlatformSupplierContext("cj_dropshipping");
  const creds = linked?.credentials ?? credentials ?? null;

  if (!useLiveSupplierApi("cj_dropshipping", creds)) {
    // Mock / offline mode — do not block on live CJ.
    return { ok: true, available: null, skipped: true };
  }

  const { available } = await queryCjVariantAvailableStock(
    {
      externalVariantId: line.externalVariantId,
      externalSku: line.externalSku,
      externalProductId: line.externalProductId,
    },
    creds,
  );

  const requested = Math.max(1, Math.floor(Number(line.quantity) || 1));
  if (available == null || available < requested) {
    return {
      ok: false,
      available,
      error: formatOutOfStockNotice({
        productName: line.productName,
        available,
        requested,
      }),
    };
  }

  return { ok: true, available, skipped: false };
}

/**
 * Import gate: live CJ stock must meet the platform minimum and be > 0.
 * Returns the live available quantity when verified (for writing stock_quantity).
 */
export async function assertCjImportVariantInStock(args: {
  externalProductId: string;
  externalVariantId: string | null;
  externalSku: string | null;
  productName?: string | null;
  credentials?: SupplierCredentials | null;
}): Promise<
  | { ok: true; liveStock: number | null; usedLive: boolean }
  | { ok: false; error: string }
> {
  const result = await verifyCjLiveVariantStock(
    {
      externalProductId: args.externalProductId,
      externalVariantId: args.externalVariantId,
      externalSku: args.externalSku,
      quantity: MIN_IMPORT_STOCK_QUANTITY,
      productName: args.productName,
    },
    args.credentials,
  );

  if (!result.ok) {
    if (result.available == null) {
      return {
        ok: false,
        error: `Could not verify live CJ inventory for “${
          args.productName ?? "this product"
        }”. Import blocked until stock can be confirmed.`,
      };
    }
    if (result.available <= 0) {
      return {
        ok: false,
        error: `“${
          args.productName ?? "This product"
        }” is out of stock at CJ Dropshipping (0 units). Import blocked.`,
      };
    }
    return {
      ok: false,
      error: `CJ live stock is ${result.available} unit${
        result.available === 1 ? "" : "s"
      }, but imports require at least ${MIN_IMPORT_STOCK_QUANTITY}. Import blocked.`,
    };
  }

  if (result.skipped) {
    return { ok: true, liveStock: null, usedLive: false };
  }

  if (!meetsMinImportStock(result.available)) {
    return {
      ok: false,
      error: `CJ live stock is ${
        result.available == null ? "unknown" : result.available
      } unit(s), but imports require at least ${MIN_IMPORT_STOCK_QUANTITY}. Import blocked.`,
    };
  }

  return { ok: true, liveStock: result.available, usedLive: true };
}

type CartItem = { product_id: string; quantity: number };

/**
 * Before checkout: for every CJ-sourced cart line, query live variant stock
 * and block with an up-to-date out-of-stock notice when insufficient.
 * Also syncs local products.stock_quantity to the live figure when verified.
 */
export async function assertCjLiveStockForCartItems(
  items: CartItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!items.length) return { ok: true };

  const linked = await loadPlatformSupplierContext("cj_dropshipping");
  if (!useLiveSupplierApi("cj_dropshipping", linked?.credentials ?? null)) {
    return { ok: true };
  }

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  if (productIds.length === 0) return { ok: true };

  const supabase = createServiceClient();
  const { loadImportRegistryByProductIds } = await import(
    "@/lib/suppliers/import-registry"
  );

  const [{ data: products }, { data: cjProviders }, importByProduct] =
    await Promise.all([
      supabase.from("products").select("id, name, sku").in("id", productIds),
      supabase
        .from("supplier_providers")
        .select("id, kind, slug")
        .or(
          "kind.eq.cj_dropshipping,slug.eq.cj-dropshipping,slug.eq.cj_dropshipping",
        ),
      loadImportRegistryByProductIds(supabase, productIds),
    ]);

  const cjProviderIds = new Set((cjProviders ?? []).map((p) => p.id));
  if (cjProviderIds.size === 0 && importByProduct.size === 0) {
    return { ok: true };
  }

  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  if (importByProduct.size === 0) {
    return { ok: true };
  }

  const qtyByProduct = new Map<string, number>();
  for (const item of items) {
    qtyByProduct.set(
      item.product_id,
      (qtyByProduct.get(item.product_id) ?? 0) +
        Math.max(0, Number(item.quantity) || 0),
    );
  }

  const stockUpdates: Array<{ id: string; stock: number }> = [];

  for (const [productId, quantity] of qtyByProduct) {
    const imported = importByProduct.get(productId);
    if (!imported) continue;
    if (
      imported.provider_id &&
      cjProviderIds.size > 0 &&
      !cjProviderIds.has(imported.provider_id)
    ) {
      continue;
    }

    const product = productById.get(productId);
    const result = await verifyCjLiveVariantStock(
      {
        productId,
        productName: product?.name ?? null,
        externalProductId: imported.external_product_id,
        externalVariantId: imported.external_variant_id,
        externalSku: imported.external_sku ?? product?.sku ?? null,
        quantity,
      },
      linked?.credentials ?? null,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    if (!result.skipped && result.available != null) {
      stockUpdates.push({ id: productId, stock: result.available });
    }
  }

  // Keep local listing stock aligned with live CJ so storefront mirrors reality.
  for (const update of stockUpdates) {
    await supabase
      .from("products")
      .update({
        stock_quantity: update.stock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id);
  }

  return { ok: true };
}
