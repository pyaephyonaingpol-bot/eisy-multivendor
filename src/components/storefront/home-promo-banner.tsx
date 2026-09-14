"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type PromoBannerSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl?: string | null;
  accent?: "emerald" | "sky" | "amber";
};

const accentClass: Record<NonNullable<PromoBannerSlide["accent"]>, string> = {
  emerald: "from-zinc-50 via-white to-emerald-50/70",
  sky: "from-zinc-50 via-white to-sky-50/70",
  amber: "from-zinc-50 via-white to-amber-50/60",
};

type HomePromoBannerProps = {
  slides: PromoBannerSlide[];
};

export function HomePromoBanner({ slides }: HomePromoBannerProps) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  const slide = slides[index] ?? slides[0];
  const gradient = accentClass[slide.accent ?? "emerald"];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions and new products"
      className={`relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br ${gradient}`}
    >
      <div className="grid min-h-[22rem] items-center gap-8 px-6 py-10 sm:min-h-[24rem] sm:grid-cols-[1.2fr_0.8fr] sm:px-10">
        <div className="relative z-10 max-w-xl space-y-5">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-800/80">
            {slide.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            {slide.title}
          </h1>
          <p className="text-lg text-zinc-600">{slide.description}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={slide.ctaHref}
              className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              {slide.ctaLabel}
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50"
            >
              Browse shop
            </Link>
          </div>
        </div>

        <div className="relative hidden h-full min-h-[16rem] sm:block">
          {slide.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full rounded-2xl object-cover shadow-sm ring-1 ring-zinc-200/80"
            />
          ) : (
            <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.18),transparent_55%),linear-gradient(160deg,#fafafa,#f4f4f5)] ring-1 ring-zinc-200/80" />
          )}
        </div>
      </div>

      {count > 1 ? (
        <div className="absolute bottom-4 left-6 flex items-center gap-2 sm:left-10">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show slide ${i + 1}: ${item.title}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition ${
                i === index ? "w-6 bg-zinc-950" : "w-2 bg-zinc-300 hover:bg-zinc-400"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
