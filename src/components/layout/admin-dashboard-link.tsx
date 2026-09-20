<<<<<<< HEAD
import type { ReactNode } from "react";
=======
"use client";

import type { ReactNode, MouseEvent } from "react";
>>>>>>> origin/cursor/nextjs-multivendor-main

type AdminDashboardLinkProps = {
  className?: string;
  children: ReactNode;
};

<<<<<<< HEAD
/** Canonical admin overview route — page lives at `src/app/admin/dashboard/page.tsx`. */
export const ADMIN_DASHBOARD_HREF = "/admin/dashboard";

/**
 * Plain anchor to the admin dashboard. Uses a real href (not a soft-only
 * router push) so clicks always navigate to `/admin/dashboard`.
=======
/**
 * Hard-navigates to the admin dashboard. Next.js Link soft routing can appear
 * to do nothing when middleware redirects (e.g. non-admin → home).
>>>>>>> origin/cursor/nextjs-multivendor-main
 */
export function AdminDashboardLink({
  className,
  children,
}: AdminDashboardLinkProps) {
<<<<<<< HEAD
  return (
    <a href={ADMIN_DASHBOARD_HREF} className={className}>
=======
  const href = "/admin/dashboard";

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Prefer a full document navigation so auth middleware redirects always apply.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    window.location.assign(href);
  };

  return (
    <a href={href} className={className} onClick={onClick}>
>>>>>>> origin/cursor/nextjs-multivendor-main
      {children}
    </a>
  );
}
