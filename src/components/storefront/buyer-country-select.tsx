"use client";

import { useEffect, useState } from "react";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";
import type { CountryOption } from "@/lib/sourcing/countries";

type BuyerCountrySelectProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (countryCode: string) => void;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Destination country select for checkout / browse.
 * Renders the bundled CJ destination list immediately, then refreshes from
 * `/api/shipping/cj-countries` (live CJ countrylist) when available.
 */
export function BuyerCountrySelect({
  id,
  name = "country",
  value,
  onChange,
  required,
  className,
  "aria-label": ariaLabel,
}: BuyerCountrySelectProps) {
  const [options, setOptions] =
    useState<CountryOption[]>(BUYER_COUNTRY_OPTIONS);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/shipping/cj-countries", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          ok?: boolean;
          countries?: CountryOption[];
        };
        if (
          !data.ok ||
          !Array.isArray(data.countries) ||
          data.countries.length < 50
        ) {
          return;
        }
        setOptions(data.countries);
      } catch {
        // Keep static CJ snapshot on network failures.
      }
    })();
    return () => controller.abort();
  }, []);

  const hasValue = options.some((option) => option.code === value);
  const renderOptions =
    hasValue || !value
      ? options
      : [{ code: value, label: value }, ...options];

  return (
    <select
      id={id}
      name={name}
      value={value}
      required={required}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {renderOptions.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label} ({option.code})
        </option>
      ))}
    </select>
  );
}
