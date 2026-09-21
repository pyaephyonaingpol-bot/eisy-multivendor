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

type HomePromoBannerProps = {
  slides: PromoBannerSlide[];
  brandName?: string;
};

export function HomePromoBanner({
  slides,
  brandName = "Eisy Marketplace",
}: HomePromoBannerProps) {
  const [index, setIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);
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
      setAnimKey((k) => k + 1);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [count]);

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      setIndex(((next % count) + count) % count);
      setAnimKey((k) => k + 1);
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

  return (
    <section
      aria-roledescription="carousel"
      aria-label={`${brandName} promotions`}
      className="relative isolate min-h-[min(70vh,36rem)] w-full overflow-hidden bg-[#1a1814] text-white touch-pan-y sm:min-h-[min(68vh,34rem)]"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerStartX.current = null;
      }}
    >
      {/* Full-bleed visual plane */}
      <div className="absolute inset-0" key={`img-${slide.id}-${animKey}`}>
        {slide.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.imageUrl}
            alt=""
            draggable={false}
            className="market-kenburns h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(ellipse_at_30%_20%,#2a4a43,transparent_50%),linear-gradient(145deg,#1c1915,#24352f_55%,#1a1814)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/78 via-black/55 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[min(70vh,36rem)] w-full max-w-6xl flex-col justify-end px-4 pb-16 pt-16 sm:min-h-[min(68vh,34rem)] sm:justify-center sm:px-8 sm:pb-20 sm:pt-20">
        <div
          key={`copy-${slide.id}-${animKey}`}
          className="market-fade-up max-w-2xl space-y-5 sm:space-y-6"
        >
          <p className="font-display text-4xl font-medium tracking-tight text-white sm:text-5xl lg:text-6xl">
            {brandName}
          </p>
          <h1 className="max-w-xl text-xl font-medium leading-snug tracking-tight text-white/95 sm:text-2xl lg:text-3xl">
            {slide.title}
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-white/75 sm:text-base">
            {slide.description}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href={slide.ctaHref}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--market-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0c584c]"
            >
              {slide.ctaLabel}
            </Link>
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/35 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Browse shop
            </Link>
          </div>
        </div>

        {count > 1 ? (
          <div className="mt-10 flex items-center gap-2 sm:mt-12">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => goTo(index - 1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/25 text-lg text-white/90 transition hover:bg-white/10"
            >
              ‹
            </button>
            <div className="flex items-center gap-1.5 px-1">
              {slides.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Show slide ${i + 1}: ${item.title}`}
                  aria-current={i === index}
                  onClick={() => goTo(i)}
                  className="inline-flex h-8 items-center justify-center px-0.5"
                >
                  <span
                    className={`block h-1 rounded-full transition-all ${
                      i === index ? "w-7 bg-white" : "w-2 bg-white/40"
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => goTo(index + 1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/25 text-lg text-white/90 transition hover:bg-white/10"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
