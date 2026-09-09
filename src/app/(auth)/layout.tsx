import { Footer, Header } from "@/components/layout/site-chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
