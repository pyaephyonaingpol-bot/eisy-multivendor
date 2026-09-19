import { NextResponse } from "next/server";
import { getPrintifyProducts } from "@/lib/printify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/printify/products
 * Test/debug endpoint — lists products from the configured Printify shop.
 * Query: ?page=1&limit=20
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? 1) || 1;
  const limit = Number(searchParams.get("limit") ?? 20) || 20;

  const result = await getPrintifyProducts({ page, limit });

  return NextResponse.json(
    {
      ok: result.ok,
      shop_id: result.shopId,
      page: result.page,
      last_page: result.lastPage,
      total: result.total,
      count: result.products.length,
      products: result.products,
      error: result.error,
    },
    { status: result.ok ? 200 : result.error?.includes("not configured") ? 503 : 502 },
  );
}
