"use client";

import { useEffect, useState, useTransition } from "react";
import { RegionalShippingEstimate } from "@/components/storefront/regional-shipping-estimate";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";
import { setBuyerSourcingPreference } from "@/lib/sourcing/actions";
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
  countryCode: string;
  regionName: string;
  route: ResolvedSupplierRoute | null;
  /** When false, only show the static regional estimate (non-CJ listings). */
  enableLiveCj?: boolean;
};

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950";

export function CjLiveShippingEstimate({
  productId,
  countryCode: initialCountry,
  regionName,
  route,
  enableLiveCj = true,
}: CjLiveShippingEstimateProps) {
  const [country, setCountry] = useState(initialCountry || "MM");
  const [quote, setQuote] = useState<QuoteState>(
    enableLiveCj ? { status: "loading" } : { status: "skipped" },
  );
  const [, startTransition] = useTransition();

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
            country,
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
              data.error ??
              "Sorry, CJ Dropshipping does not ship to your location.",
            methods: data.methods ?? [],
            availability,
            countryCode: data.countryCode ?? country,
          });
          return;
        }

        setQuote({
          status: "ok",
          methods: data.methods ?? [],
          availability,
          countryCode: data.countryCode ?? country,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setQuote({
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Could not load live CJ shipping for this country.",
        });
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [country, productId, enableLiveCj]);

  function onCountryChange(next: string) {
    setCountry(next);
    startTransition(() => {
      void setBuyerSourcingPreference(next);
    });
  }

  if (!enableLiveCj || quote.status === "skipped") {
    return (
      <RegionalShippingEstimate
        route={route}
        countryCode={country}
        regionName={regionName}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-950">Live CJ shipping</p>
          <p className="text-xs text-zinc-500">
            Real-time availability and freight from CJ Dropshipping
          </p>
        </div>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900 ring-1 ring-inset ring-sky-200">
          CJ Dropshipping
        </span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cj-browse-country" className="text-xs font-medium text-zinc-600">
          Ship to
        </label>
        <select
          id="cj-browse-country"
          value={country}
          onChange={(event) => onCountryChange(event.target.value)}
          className={fieldClassName}
        >
          {BUYER_COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label} ({option.code})
            </option>
          ))}
        </select>
      </div>

      {quote.status === "loading" ? (
        <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-sky-950">
          Checking live CJ availability and shipping to {country}…
        </p>
      ) : null}

      {quote.status === "error" ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
          role="status"
        >
          <p className="font-medium">Could not reach CJ shipping</p>
          <p className="mt-1 text-xs">{quote.error}</p>
          <p className="mt-1 text-xs text-amber-800">
            Try another country or continue — checkout will re-check before payment.
          </p>
        </div>
      ) : null}

      {quote.status === "blocked" ? (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-950"
          role="alert"
        >
          <p className="font-medium">Shipping unavailable</p>
          <p className="mt-1">{quote.error}</p>
          {quote.availability.status === "out_of_stock" ? (
            <p className="mt-1 text-xs">
              {quote.availability.message ??
                "This product is also out of stock at CJ."}
            </p>
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
                    ? "Quote on checkout"
                    : formatMoney(
                        method.amount,
                        method.currency || MARKETPLACE_CURRENCY,
                      )}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            Costs refresh when you change country. Checkout verifies again before
            payment.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AvailabilityRow({ availability }: { availability: Availability }) {
  if (availability.status === "skipped") return null;

  if (availability.status === "in_stock") {
    return (
      <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-950">
        In stock at CJ
        {availability.available != null
          ? ` · ${availability.available} available`
          : ""}
      </p>
    );
  }

  if (availability.status === "out_of_stock") {
    return (
      <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-rose-950">
        {availability.message ?? "Out of stock at CJ Dropshipping"}
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-700">
      {availability.message ?? "Live stock check pending — confirmed at checkout."}
    </p>
  );
}
