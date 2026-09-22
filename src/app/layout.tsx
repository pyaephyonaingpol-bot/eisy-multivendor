import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { isRtlLocale } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/locale";
import "./globals.css";

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eisy Marketplace",
  description: "Shop products from trusted vendors. Checkout securely in USDT.",
};

/** Fit layout to the phone screen width; avoid accidental zoom/overflow. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Keyboard overlays content so layout width does not jump when it opens.
  interactiveWidget: "overlays-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="flex min-h-full w-full max-w-full flex-col overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]"
      >
        <LanguageProvider locale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
