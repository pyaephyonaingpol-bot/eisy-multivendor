"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PromoBannerSlide } from "@/components/storefront/home-promo-banner";

type PromoStripCarouselProps = {
  slides: PromoBannerSlide[];
  compact?: boolean;
};

/**
 * Stylish horizontal promo carousel for the super-app home feed.
 */
export function PromoStripCarousel({
  slides,
  compact = false,
}: PromoStripCarouselProps) {
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
    }, 5600);
    return () => window.clearInterval(timer);
  }, [count]);

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  if (count === 0) return null;

  const slide = slides[index] ?? slides[0];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions"
      className={`relative overflow-hidden rounded-2xl bg-[#1a1814] text-white ${
        compact ? "min-h-[9.5rem]" : "min-h-[12.5rem] sm:min-h-[15rem]"
      }`}
      onPointerDown={(event: ReactPointerEvent<HTMLElement>) => {
        pointerStartX.current = event.clientX;
      }}
      onPointerUp={(event: ReactPointerEvent<HTMLElement>) => {
        if (pointerStartX.current == null || count <= 1) return;
        const delta = event.clientX - pointerStartX.current;
        pointerStartX.current = null;
        if (Math.abs(delta) < 36) return;
        goTo(delta < 0 ? index + 1 : index - 1);
      }}
      onPointerCancel={() => {
        pointerStartX.current = null;
      }}
    >
      <div className="absolute inset-0">
        {slide.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.id}
            src={slide.imageUrl}
            alt=""
            draggable={false}
            className="market-kenburns h-full w-full object-cover opacity-80"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(ellipse_at_20%_20%,#2f5c52,transparent_55%),linear-gradient(135deg,#1c1915,#24352f)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/15" />
      </div>

      <div
        className={`relative z-10 flex h-full flex-col justify-end ${
          compact ? "px-4 py-4" : "px-5 py-5 sm:px-7 sm:py-6"
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {slide.eyebrow}
        </p>
        <h2
          className={`mt-1 max-w-md font-display font-medium leading-snug ${
            compact ? "text-lg" : "text-xl sm:text-2xl"
          }`}
        >
          {slide.title}
        </h2>
        {!compact ? (
          <p className="mt-1.5 max-w-sm text-sm text-white/75">
            {slide.description}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <Link
            href={slide.ctaHref}
            className="inline-flex min-h-9 items-center rounded-lg bg-[var(--market-accent)] px-3.5 text-sm font-semibold text-white transition hover:bg-[#0c584c]"
          >
            {slide.ctaLabel}
          </Link>
          {count > 1 ? (
            <div className="flex items-center gap-1.5">
              {slides.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Show promotion ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => goTo(i)}
                  className="inline-flex h-7 items-center"
                >
                  <span
                    className={`block h-1 rounded-full transition-all ${
                      i === index ? "w-5 bg-white" : "w-1.5 bg-white/40"
                    }`}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
