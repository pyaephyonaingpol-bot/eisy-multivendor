"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RegionalShippingEstimate } from "@/components/storefront/regional-shipping-estimate";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { countryLabelForCode } from "@/lib/sourcing/countries";
import type { ResolvedSupplierRoute } from "@/lib/types/database";

type Method = {
  name: string;
  days: string | null;
  amount: number | null;
  currency: string;
};

type Availability = {
  status: "in_stock" | "out_of_stock" | "unknown" | "skipped";
  available: number | null;
  message: string | null;
};

type QuoteState =
  | { status: "loading" }
  | { status: "skipped" }
  | {
      status: "ok";
      methods: Method[];
      availability: Availability;
      countryCode: string;
    }
  | {
      status: "blocked";
      error: string;
      methods: Method[];
      availability: Availability;
      countryCode: string;
    }
  | { status: "error"; error: string };

type CjLiveShippingEstimateProps = {
  productId: string;
  /** Destination from the buyer's default address or profile country. */
  countryCode: string;
  regionName: string;
  route: ResolvedSupplierRoute | null;
  /** When false, only show the static regional estimate (non-CJ listings). */
  enableLiveCj?: boolean;
  /** True when country came from a signed-in address/profile (not guest default). */
  fromProfile?: boolean;
  isAuthenticated?: boolean;
};

/**
 * Buyer-facing shipping options. Destination is always the customer's
 * registered address / profile country — no manual country picker on PDP.
 */
export function CjLiveShippingEstimate({
  productId,
  countryCode,
  regionName,
  route,
  enableLiveCj = true,
  fromProfile = false,
  isAuthenticated = false,
}: CjLiveShippingEstimateProps) {
  const destinationCode = (countryCode || "MM").trim().toUpperCase() || "MM";
  const destinationLabel = countryLabelForCode(destinationCode);
  const [quote, setQuote] = useState<QuoteState>(
    enableLiveCj ? { status: "loading" } : { status: "skipped" },
  );

  useEffect(() => {
    if (!enableLiveCj || !productId) {
      setQuote({ status: "skipped" });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuote({ status: "loading" });
      try {
        const response = await fetch("/api/shipping/cj-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: destinationCode,
            includeAvailability: true,
            items: [{ product_id: productId, quantity: 1 }],
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          ok?: boolean;
          skipped?: boolean;
          hasCjItems?: boolean;
          error?: string;
          countryCode?: string;
          methods?: Method[];
          availability?: Availability;
        };

        if (controller.signal.aborted) return;

        if (data.skipped || data.hasCjItems === false) {
          setQuote({ status: "skipped" });
          return;
        }

        const availability: Availability = data.availability ?? {
          status: "unknown",
          available: null,
          message: null,
        };

        if (!response.ok || data.ok === false) {
          setQuote({
            status: "blocked",
            error:
              data.error?.includes("does not ship") ||
              data.error?.toLowerCase().includes("location")
                ? `This item cannot be delivered to ${destinationLabel}. Update your delivery address to see other options.`
                : `Shipping is unavailable for ${destinationLabel}.`,
            methods: data.methods ?? [],
            availability,
            countryCode: data.countryCode ?? destinationCode,
          });
          return;
        }

        setQuote({
          status: "ok",
          methods: data.methods ?? [],
          availability,
          countryCode: data.countryCode ?? destinationCode,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setQuote({
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : `Could not load shipping options for ${destinationLabel}.`,
        });
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [destinationCode, destinationLabel, productId, enableLiveCj]);

  if (!enableLiveCj || quote.status === "skipped") {
    return (
      <RegionalShippingEstimate
        route={route}
        countryCode={destinationCode}
        regionName={regionName}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <div className="space-y-0.5">
        <p className="font-medium text-zinc-950">Shipping</p>
        <p className="text-xs text-zinc-500">
          Options and costs are calculated for your delivery country
          automatically.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
        <p className="text-xs font-medium text-zinc-600">Deliver to</p>
        <p className="mt-0.5 font-medium text-zinc-950">
          {destinationLabel}{" "}
          <span className="font-normal text-zinc-500">({destinationCode})</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {fromProfile
            ? "Based on your default address or profile country."
            : isAuthenticated
              ? "Add a delivery address or set your country in Profile to personalize estimates."
              : "Sign in and save a delivery address for accurate shipping estimates."}{" "}
          <Link
            href={isAuthenticated ? "/profile" : "/login?next=/profile"}
            className="font-medium text-zinc-800 underline"
          >
            {isAuthenticated ? "Update in Profile" : "Sign in"}
          </Link>
        </p>
      </div>

      {quote.status === "loading" ? (
        <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-700">
          Checking shipping options…
        </p>
      ) : null}

      {quote.status === "error" ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
          role="status"
        >
          <p className="font-medium">Shipping options unavailable</p>
          <p className="mt-1 text-xs">
            Checkout will confirm shipping for your address before payment.
          </p>
        </div>
      ) : null}

      {quote.status === "blocked" ? (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-950"
          role="alert"
        >
          <p className="font-medium">Cannot ship here</p>
          <p className="mt-1">{quote.error}</p>
          {quote.availability.status === "out_of_stock" ? (
            <p className="mt-1 text-xs">This item is currently out of stock.</p>
          ) : null}
        </div>
      ) : null}

      {quote.status === "ok" ? (
        <div className="space-y-2">
          <AvailabilityRow availability={quote.availability} />
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
            {quote.methods.map((method) => (
              <li
                key={`${method.name}-${method.amount}-${method.days}`}
                className="flex items-start justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-950">{method.name}</p>
                  {method.days ? (
                    <p className="text-xs text-zinc-500">{method.days} days</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-medium text-zinc-950">
                  {method.amount == null
                    ? "At checkout"
                    : formatMoney(
                        method.amount,
                        method.currency || MARKETPLACE_CURRENCY,
                      )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AvailabilityRow({ availability }: { availability: Availability }) {
  if (availability.status === "skipped" || availability.status === "unknown") {
    return null;
  }

  if (availability.status === "in_stock") {
    return (
      <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-950">
        In stock
        {availability.available != null && availability.available > 0
          ? ` · ${availability.available} available`
          : ""}
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-rose-950">
      Out of stock
    </p>
  );
}
