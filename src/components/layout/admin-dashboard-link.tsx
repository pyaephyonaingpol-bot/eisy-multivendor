"use client";

import type { ReactNode, MouseEvent } from "react";

type AdminDashboardLinkProps = {
  className?: string;
  children: ReactNode;
};

/**
 * Hard-navigates to the admin dashboard. Next.js Link soft routing can appear
 * to do nothing when middleware redirects (e.g. non-admin → home).
 */
export function AdminDashboardLink({
  className,
  children,
}: AdminDashboardLinkProps) {
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
      {children}
    </a>
  );
}
