import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getExistingDropshipListing } from "@/lib/dropship/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { ImportToMyStoreForm } from "@/components/storefront/import-to-my-store-form";

type ImportToMyStorePanelProps = {
  productId: string;
  productVendorId: string;
  productPrice: number;
  isDropshipListing: boolean;
  sourceProductId: string | null;
};

export async function ImportToMyStorePanel({
  productId,
  productVendorId,
  productPrice,
  isDropshipListing,
  sourceProductId,
}: ImportToMyStorePanelProps) {
  // Keep the public PDP buyer-focused: import UI only for approved vendors.
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return null;
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor || vendor.status !== "approved") {
    return null;
  }

  // Always import the original supplier SKU, even when viewing another dropship copy.
  const importSourceId =
    isDropshipListing && sourceProductId ? sourceProductId : productId;

  if (!isDropshipListing && productVendorId === vendor.id) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        This is already in your catalog as a supplier listing.
      </div>
    );
  }

  if (productVendorId === vendor.id && isDropshipListing) {
    return null;
  }

  const existing = await getExistingDropshipListing(vendor.id, importSourceId);

  return (
    <ImportToMyStoreForm
      sourceProductId={importSourceId}
      defaultPrice={
        existing
          ? Number(existing.price)
          : Math.round(productPrice * 1.15 * 100) / 100
      }
      suggestedMinPrice={productPrice}
      alreadyImported={Boolean(existing)}
      existingProductId={existing?.id ?? null}
    />
  );
}
