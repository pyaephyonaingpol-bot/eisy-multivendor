import { NextResponse } from "next/server";
import { fetchCjDestinationCountries } from "@/lib/suppliers/cj-countries";

export const dynamic = "force-dynamic";

/**
 * CJ Dropshipping official destination countries for checkout / address forms.
 * Prefers a live fetch from CJ's countrylist; falls back to the bundled snapshot.
 */
export async function GET() {
  const { countries, source } = await fetchCjDestinationCountries();
  return NextResponse.json({
    ok: true,
    source,
    count: countries.length,
    countries,
  });
}
