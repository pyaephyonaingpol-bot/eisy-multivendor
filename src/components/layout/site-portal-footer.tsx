/**
 * Ultra-minimal footer — copyright only.
 * Primary navigation is the header Account menu + fixed bottom tabs.
 */
export function SitePortalFooter({
  brandTitle: _brandTitle,
  brandDescription: _brandDescription,
  shopLinks: _shopLinks,
  showPortalHub: _showPortalHub,
}: {
  brandTitle?: string;
  brandDescription?: string;
  shopLinks?: boolean;
  /** @deprecated Ignored — portal cards removed. */
  showPortalHub?: boolean;
} = {}) {
  void _brandTitle;
  void _brandDescription;
  void _shopLinks;
  void _showPortalHub;

  return (
    <footer className="mt-auto border-t border-zinc-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-zinc-400">
        © 2026 Eisy · Pay with USDT
      </div>
    </footer>
  );
}
