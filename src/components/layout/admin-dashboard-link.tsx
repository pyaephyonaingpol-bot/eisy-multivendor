import type { ReactNode } from "react";

type AdminDashboardLinkProps = {
  className?: string;
  children: ReactNode;
};

/** Canonical admin overview route — page lives at `src/app/admin/dashboard/page.tsx`. */
export const ADMIN_DASHBOARD_HREF = "/admin/dashboard";

/**
 * Plain anchor to the admin dashboard. Uses a real href (not a soft-only
 * router push) so clicks always navigate to `/admin/dashboard`.
 */
export function AdminDashboardLink({
  className,
  children,
}: AdminDashboardLinkProps) {
  return (
    <a href={ADMIN_DASHBOARD_HREF} className={className}>
      {children}
    </a>
  );
}
