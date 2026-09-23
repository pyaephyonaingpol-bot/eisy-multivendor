import "server-only";

import { getCjProduct, searchCjProducts } from "@/lib/suppliers/cj";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";

export type CjSourcingMatch = {
  cj_external_product_id: string;
  cj_match_title: string | null;
  cj_match_image_url: string | null;
  cj_match_payload: Record<string, unknown>;
};

/**
 * Pull a CJ product id from common CJ Dropshipping product URLs / share links.
 */
export function parseCjProductIdFromUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (
      !host.includes("cjdropshipping") &&
      !host.includes("cjdropship") &&
      !host.includes("cjdrop")
    ) {
      // Still allow bare pid query params on unknown hosts.
    }

    for (const key of ["pid", "productId", "product_id", "id"]) {
      const value = url.searchParams.get(key)?.trim();
      if (value && /^[A-Za-z0-9_-]{6,64}$/.test(value)) return value;
    }

    const pathMatch = url.pathname.match(
      /(?:product|products|detail)\/([A-Za-z0-9_-]{6,64})/i,
    );
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    // Not a URL — maybe a raw CJ product id.
    if (/^[A-Za-z0-9_-]{6,64}$/.test(trimmed)) return trimmed;
  }

  return null;
}

/**
 * Best-effort CJ catalog enrichment for a buyer sourcing request.
 * Never throws — missing credentials / API errors return null.
 */
export async function findCjMatchForSourcingRequest(args: {
  productName: string;
  productUrl?: string | null;
}): Promise<CjSourcingMatch | null> {
  try {
    const linked = await loadPlatformSupplierContext("cj_dropshipping");
    const credentials = linked?.credentials ?? null;
    const fromUrl = parseCjProductIdFromUrl(args.productUrl);

    if (fromUrl) {
      const product = await getCjProduct(fromUrl, credentials);
      if (product) {
        return {
          cj_external_product_id: product.externalProductId,
          cj_match_title: product.name,
          cj_match_image_url: product.imageUrl,
          cj_match_payload: {
            source: "url",
            title: product.name,
            priceUsdt: product.priceUsdt,
            warehouseCountry: product.warehouseCountry,
            imageUrl: product.imageUrl,
          },
        };
      }
    }

    const query = args.productName.trim();
    if (query.length < 2) return null;

    const results = await searchCjProducts(query, credentials, 1);
    const top = results[0];
    if (!top) return null;

    return {
      cj_external_product_id: top.externalProductId,
      cj_match_title: top.name,
      cj_match_image_url: top.imageUrl,
      cj_match_payload: {
        source: "search",
        query,
        title: top.name,
        priceUsdt: top.priceUsdt,
        warehouseCountry: top.warehouseCountry,
        imageUrl: top.imageUrl,
        matchCount: results.length,
      },
    };
  } catch {
    return null;
  }
}
