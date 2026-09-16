"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthModal, type AuthModalMode } from "@/components/AuthModal";

type HeaderProps = {
  /** Optional brand label shown in the header. */
  brand?: string;
  /** When true, show a signed-in label instead of the auth CTA. */
  signedInLabel?: string | null;
};

/**
 * Sample responsive header with a Sign In / Sign Up button that opens AuthModal.
 */
export function Header({
  brand = "Eisy Myanmar",
  signedInLabel = null,
}: HeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("signin");

  const openModal = (nextMode: AuthModalMode) => {
    setMode(nextMode);
    setOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16">
          <Link
            href="/"
            className="truncate text-base font-semibold tracking-tight text-zinc-950 sm:text-lg"
          >
            {brand}
          </Link>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {signedInLabel ? (
              <span className="hidden max-w-[10rem] truncate text-sm text-zinc-500 sm:inline">
                {signedInLabel}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => openModal("signin")}
                className="rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 sm:px-4 sm:text-sm"
              >
                Sign In / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        initialMode={mode}
        nextPath={pathname || "/"}
      />
    </>
  );
}
