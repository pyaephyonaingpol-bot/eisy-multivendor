/**
 * Shared offset pagination helpers for Supabase list queries.
 * Prefer small page sizes on admin/vendor dashboards; public catalogs already cap.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type PageParams = {
  page?: number;
  pageSize?: number;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  /** True when a full page was returned (caller may fetch page+1). */
  hasMore: boolean;
};

export function normalizePageParams(
  params?: PageParams,
  defaults?: { pageSize?: number; maxPageSize?: number },
): { page: number; pageSize: number; from: number; to: number } {
  const maxPageSize = defaults?.maxPageSize ?? MAX_PAGE_SIZE;
  const defaultSize = defaults?.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(params?.page) || 1));
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Math.floor(Number(params?.pageSize) || defaultSize)),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

export function asPageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    page,
    pageSize,
    hasMore: items.length >= pageSize,
  };
}
