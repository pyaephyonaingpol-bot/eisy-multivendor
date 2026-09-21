import Link from "next/link";

export type QuickCategory = {
  id: string;
  name: string;
  href: string;
  tone?: "teal" | "sand" | "ink" | "rose" | "sky";
};

const toneClass: Record<NonNullable<QuickCategory["tone"]>, string> = {
  teal: "bg-[var(--market-accent-soft)] text-[var(--market-accent)]",
  sand: "bg-[#f0e6d4] text-[#8a6230]",
  ink: "bg-[#e8e4dc] text-[var(--market-ink)]",
  rose: "bg-[#f6e4e6] text-[#8b3a48]",
  sky: "bg-[#ddeff5] text-[#1f5f78]",
};

const FALLBACK_CATEGORIES: QuickCategory[] = [
  { id: "all", name: "All", href: "/products", tone: "ink" },
  { id: "deals", name: "Deals", href: "/products?deals=1", tone: "rose" },
  { id: "electronics", name: "Tech", href: "/products?q=electronics", tone: "sky" },
  { id: "fashion", name: "Fashion", href: "/products?q=fashion", tone: "sand" },
  { id: "home", name: "Home", href: "/products?q=home", tone: "teal" },
  { id: "beauty", name: "Beauty", href: "/products?q=beauty", tone: "rose" },
  { id: "grocery", name: "Grocery", href: "/products?q=grocery", tone: "teal" },
  { id: "stores", name: "Stores", href: "/vendors", tone: "ink" },
];

function CategoryGlyph({ name }: { name: string }) {
  const key = name.toLowerCase();
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    className: "h-5 w-5",
    "aria-hidden": true as const,
  };

  if (key.includes("deal")) {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3.5 13.8 9H20l-5 3.6L16.8 18 12 14.7 7.2 18 9 12.6 4 9h6.2L12 3.5Z"
        />
      </svg>
    );
  }
  if (key.includes("store") || key.includes("vendor")) {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 9.5 6 4h12l2 5.5V20H4V9.5Zm0 0h16"
        />
      </svg>
    );
  }
  if (key.includes("tech") || key.includes("electron")) {
    return (
      <svg {...common}>
        <rect x="6" y="3.5" width="12" height="17" rx="2" />
        <path strokeLinecap="round" d="M11 17.5h2" />
      </svg>
    );
  }
  if (key.includes("fashion") || key.includes("apparel") || key.includes("cloth")) {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 4h6l2 4-3 1v11H10V9L7 8l2-4Z"
        />
      </svg>
    );
  }
  if (key.includes("beauty") || key.includes("cosmetic")) {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 3.5h6v5H9v-5Zm1 5v12h4V8.5"
        />
      </svg>
    );
  }
  if (key.includes("home") || key.includes("living")) {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m4 11 8-7 8 7v9H4v-9Z"
        />
      </svg>
    );
  }
  if (key.includes("groc") || key.includes("food")) {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 7h14l-1.2 12H6.2L5 7Zm3-3h8"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4.75h6.5V11H4V4.75Zm9.5 0H20V11h-6.5V4.75ZM4 13h6.5v6.25H4V13Zm9.5 0H20v6.25h-6.5V13Z"
      />
    </svg>
  );
}

type QuickCategoryRailProps = {
  categories?: QuickCategory[];
};

export function QuickCategoryRail({ categories }: QuickCategoryRailProps) {
  const items =
    categories && categories.length > 0
      ? [
          { id: "all", name: "All", href: "/products", tone: "ink" as const },
          ...categories,
        ]
      : FALLBACK_CATEGORIES;

  return (
    <section aria-label="Quick categories" className="space-y-2">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <h2 className="text-sm font-semibold text-[var(--market-ink)]">
          Shop by category
        </h2>
        <Link
          href="/products"
          className="text-xs font-semibold text-[var(--market-accent)] hover:underline"
        >
          See all
        </Link>
      </div>
      <ul className="mobile-scroll-x -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 pt-0.5">
        {items.map((category, index) => {
          const tone = category.tone ?? (["teal", "sand", "sky", "rose", "ink"] as const)[index % 5];
          return (
            <li key={category.id} className="shrink-0">
              <Link
                href={category.href}
                className="flex w-[4.6rem] flex-col items-center gap-1.5 text-center transition hover:-translate-y-0.5"
              >
                <span
                  className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${toneClass[tone]}`}
                >
                  <CategoryGlyph name={category.name} />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-[var(--market-ink)]">
                  {category.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
