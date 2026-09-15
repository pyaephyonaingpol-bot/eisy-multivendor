"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

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
  const pointerStartX = useRef<number | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    if (count <= 1 || reduceMotion.current) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [count]);

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    pointerStartX.current = event.clientX;
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (pointerStartX.current == null || count <= 1) return;
    const delta = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(delta) < 40) return;
    goTo(delta < 0 ? index + 1 : index - 1);
  }

  if (count === 0) return null;

  const slide = slides[index] ?? slides[0];
  const gradient = accentClass[slide.accent ?? "emerald"];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions and new products"
      className={`relative touch-pan-y overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br ${gradient}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerStartX.current = null;
      }}
    >
      <div className="grid min-h-[18rem] items-center gap-6 px-5 py-8 pb-14 sm:min-h-[24rem] sm:grid-cols-[1.2fr_0.8fr] sm:gap-8 sm:px-10 sm:py-10 sm:pb-14">
        <div className="relative z-10 max-w-xl space-y-4 sm:space-y-5">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/80 sm:text-sm">
            {slide.eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl">
            {slide.title}
          </h1>
          <p className="text-sm text-zinc-600 sm:text-lg">{slide.description}</p>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Link
              href={slide.ctaHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              {slide.ctaLabel}
            </Link>
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50"
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
              draggable={false}
              className="absolute inset-0 h-full w-full rounded-2xl object-cover shadow-sm ring-1 ring-zinc-200/80"
            />
          ) : (
            <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.18),transparent_55%),linear-gradient(160deg,#fafafa,#f4f4f5)] ring-1 ring-zinc-200/80" />
          )}
        </div>
      </div>

      {count > 1 ? (
        <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1 px-5 sm:bottom-4 sm:justify-start sm:px-10">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => goTo(index - 1)}
            className="mr-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-lg text-zinc-700 hover:bg-white/70 sm:mr-2"
          >
            ‹
          </button>
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show slide ${i + 1}: ${item.title}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className="inline-flex h-11 w-11 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition ${
                  i === index ? "w-6 bg-zinc-950" : "w-2 bg-zinc-300"
                }`}
              />
            </button>
          ))}
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => goTo(index + 1)}
            className="ml-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-lg text-zinc-700 hover:bg-white/70 sm:ml-2"
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
