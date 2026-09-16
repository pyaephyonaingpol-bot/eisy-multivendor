"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthModal, type AuthModalMode } from "@/components/AuthModal";

type Props = {
  label?: string;
};

/**
 * Storefront auth CTA that opens the shared AuthModal (Google + email).
 */
export function AuthHeaderButton({ label = "Sign In / Sign Up" }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("signin");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode("signin");
          setOpen(true);
        }}
        className="rounded-full bg-zinc-950 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 sm:px-4 sm:text-sm"
      >
        {label}
      </button>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        initialMode={mode}
        nextPath={pathname || "/"}
      />
    </>
  );
}
