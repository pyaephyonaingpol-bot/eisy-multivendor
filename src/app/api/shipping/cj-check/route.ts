import { NextResponse } from "next/server";
import { quoteCjShippingForCartItems } from "@/lib/suppliers/cj-shipping";

export const dynamic = "force-dynamic";

type Body = {
  country?: string;
  zip?: string | null;
  items?: Array<{ product_id?: string; productId?: string; quantity?: number }>;
};

/**
 * Real-time CJ freight check for cart/browse destination country.
 * Returns available methods or a clear unsupported-country error.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const country = String(body.country ?? "").trim().toUpperCase();
  if (!country) {
    return NextResponse.json(
      { ok: false, error: "Country code is required." },
      { status: 400 },
    );
  }

  const items = (body.items ?? [])
    .map((item) => ({
      product_id: String(item.product_id ?? item.productId ?? ""),
      quantity: Number(item.quantity) || 1,
    }))
    .filter((item) => item.product_id.length > 0);

  if (items.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      hasCjItems: false,
      methods: [],
      countryCode: country,
    });
  }

  try {
    const quote = await quoteCjShippingForCartItems(items, country, {
      zip: body.zip ?? null,
    });
    return NextResponse.json(quote, { status: quote.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        hasCjItems: true,
        methods: [],
        countryCode: country,
        error:
          error instanceof Error
            ? error.message
            : "Could not verify CJ shipping for this location.",
      },
      { status: 502 },
    );
  }
}
