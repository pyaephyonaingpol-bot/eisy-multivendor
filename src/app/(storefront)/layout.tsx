import { Footer, Header } from "@/components/layout/site-chrome";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <Footer />
    </>
  );
}
