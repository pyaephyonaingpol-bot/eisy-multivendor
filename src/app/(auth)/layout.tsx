import { Footer, Header } from "@/components/layout/site-chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full max-w-full flex-col overflow-x-hidden">
      <Header />
      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 items-center overflow-x-hidden px-4 py-10 sm:py-16">
        <div className="w-full min-w-0 max-w-full break-words">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
