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

/** Fit layout to the phone screen; resize with the mobile keyboard (dvh). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Let the layout viewport shrink with the on-screen keyboard so 100dvh tracks it.
  interactiveWidget: "resizes-content",
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
      className={`${display.variable} ${sans.variable} h-[100dvh] antialiased`}
    >
      <body
        suppressHydrationWarning
        className="flex h-[100dvh] min-h-[100dvh] w-full max-w-full flex-col overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]"
      >
        <LanguageProvider locale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
