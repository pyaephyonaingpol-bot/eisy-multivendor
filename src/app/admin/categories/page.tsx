import { AdminCategoryManager } from "@/components/categories/admin-category-manager";
import { listCategoriesForAdmin } from "@/lib/categories/queries";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await listCategoriesForAdmin();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-zinc-600">
          Manage marketplace categories used on the vendor product form and storefront
          browsing.
        </p>
      </div>

      <AdminCategoryManager categories={categories} />
    </div>
  );
}
