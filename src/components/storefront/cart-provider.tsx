"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartLineItem } from "@/lib/cart/types";

const STORAGE_KEY = "eisy-storefront-cart-v2";
const LEGACY_STORAGE_KEY = "eisy-storefront-cart-v1";

type CartContextValue = {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (item: Omit<CartLineItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (
    productId: string,
    quantity: number,
    variantId?: string | null,
  ) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function lineKey(productId: string, variantId?: string | null) {
  return `${productId}::${variantId ?? ""}`;
}

function readStoredItems(): CartLineItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { items?: CartLineItem[] };
    return Array.isArray(parsed.items)
      ? parsed.items.filter(
          (item): item is CartLineItem =>
            Boolean(item && item.productId && item.vendorId && item.quantity > 0),
        )
      : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    setItems(readStoredItems());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
  }, [items, hydrated]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const addItem = useCallback(
    (item: Omit<CartLineItem, "quantity"> & { quantity?: number }) => {
      const quantityToAdd = Math.max(1, item.quantity ?? 1);
      const key = lineKey(item.productId, item.variantId);
      setItems((prev) => {
        const existing = prev.find(
          (line) => lineKey(line.productId, line.variantId) === key,
        );
        if (!existing) {
          const max = item.maxQuantity;
          const quantity =
            max != null ? Math.min(quantityToAdd, Math.max(1, max)) : quantityToAdd;
          return [...prev, { ...item, quantity }];
        }
        const nextQty = existing.quantity + quantityToAdd;
        const capped =
          existing.maxQuantity != null
            ? Math.min(nextQty, existing.maxQuantity)
            : nextQty;
        return prev.map((line) =>
          lineKey(line.productId, line.variantId) === key
            ? { ...line, quantity: capped }
            : line,
        );
      });
      setIsDrawerOpen(true);
    },
    [],
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantId?: string | null) => {
      const key = lineKey(productId, variantId);
      setItems((prev) =>
        prev
          .map((line) => {
            if (lineKey(line.productId, line.variantId) !== key) {
              return line;
            }
            const next = Math.max(0, quantity);
            const capped =
              line.maxQuantity != null ? Math.min(next, line.maxQuantity) : next;
            return { ...line, quantity: capped };
          })
          .filter((line) => line.quantity > 0),
      );
    },
    [],
  );

  const removeItem = useCallback(
    (productId: string, variantId?: string | null) => {
      const key = lineKey(productId, variantId);
      setItems((prev) =>
        prev.filter((line) => lineKey(line.productId, line.variantId) !== key),
      );
    },
    [],
  );

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = items.reduce(
      (sum, line) => sum + line.price * line.quantity,
      0,
    );
    return {
      items,
      itemCount,
      subtotal,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    };
  }, [
    items,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
