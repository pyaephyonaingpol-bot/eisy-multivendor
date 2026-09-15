import type { ExternalCatalogProduct } from "@/lib/suppliers/types";

export type DeliverySpeedFilter = "any" | "fast" | "local" | "standard" | "economy";

const LOCAL_WAREHOUSE_COUNTRIES = new Set([
  "US",
  "EU",
  "GB",
  "DE",
  "FR",
  "MM",
  "TH",
  "SG",
]);

export function parseDeliverySpeedFilter(
  value: string | null | undefined,
): DeliverySpeedFilter {
  const raw = (value ?? "any").trim().toLowerCase();
  if (
    raw === "fast" ||
    raw === "fast_dispatch" ||
    raw === "local" ||
    raw === "local_warehouse" ||
    raw === "standard" ||
    raw === "economy" ||
    raw === "any"
  ) {
    if (raw === "fast_dispatch") return "fast";
    if (raw === "local_warehouse") return "local";
    return raw as DeliverySpeedFilter;
  }
  return "any";
}

export function isFastDispatch(product: ExternalCatalogProduct) {
  return product.shippingDaysMax != null && product.shippingDaysMax <= 7;
}

export function isLocalWarehouse(product: ExternalCatalogProduct) {
  return LOCAL_WAREHOUSE_COUNTRIES.has(product.warehouseCountry.toUpperCase());
}

export function isStandardShipping(product: ExternalCatalogProduct) {
  return (
    product.shippingDaysMax != null &&
    product.shippingDaysMax > 7 &&
    product.shippingDaysMax <= 21
  );
}

export function isEconomyShipping(product: ExternalCatalogProduct) {
  return product.shippingDaysMax != null && product.shippingDaysMax > 21;
}

export function matchesDeliverySpeed(
  product: ExternalCatalogProduct,
  filter: DeliverySpeedFilter,
) {
  if (filter === "any") return true;
  if (filter === "fast") return isFastDispatch(product);
  if (filter === "local") return isLocalWarehouse(product);
  if (filter === "standard") return isStandardShipping(product);
  if (filter === "economy") return isEconomyShipping(product);
  return true;
}

export function shippingSpeedTagsForProduct(
  product: ExternalCatalogProduct,
): Array<"fast_dispatch" | "local_warehouse" | "standard" | "economy"> {
  const tags: Array<"fast_dispatch" | "local_warehouse" | "standard" | "economy"> =
    [];
  if (isFastDispatch(product)) tags.push("fast_dispatch");
  if (isLocalWarehouse(product)) tags.push("local_warehouse");
  if (isStandardShipping(product)) tags.push("standard");
  if (isEconomyShipping(product)) tags.push("economy");
  if (tags.length === 0) tags.push("standard");
  return tags;
}
