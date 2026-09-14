import { NextResponse } from "next/server";
import { importDropshipProduct } from "@/lib/dropship/actions";
import type { ProductStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type ImportBody = {
  source_product_id?: string;
  price?: number;
  status?: ProductStatus;
};

/**
 * Browser-extension friendly import endpoint.
 * Requires an authenticated approved-vendor session cookie.
 */
export async function POST(request: Request) {
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const sourceProductId = String(body.source_product_id ?? "").trim();
  const price = Number(body.price);
  const status = body.status;

  if (!sourceProductId || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "source_product_id and a price greater than zero are required.",
      },
      { status: 400 },
    );
  }

  const { data, error } = await importDropshipProduct(
    sourceProductId,
    price,
    status ?? "active",
  );

  if (error || !data) {
    const message = error ?? "Import failed.";
    const statusCode =
      message.toLowerCase().includes("not authenticated") ||
      message.toLowerCase().includes("sign in")
        ? 401
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }

  return NextResponse.json({
    ok: true,
    ...data,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
