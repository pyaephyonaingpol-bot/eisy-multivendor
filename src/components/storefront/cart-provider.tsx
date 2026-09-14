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

const STORAGE_KEY = "eisy-storefront-cart-v1";

type CartContextValue = {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (item: Omit<CartLineItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStoredItems(): CartLineItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { items?: CartLineItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
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
      setItems((prev) => {
        const existing = prev.find((line) => line.productId === item.productId);
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
          line.productId === item.productId ? { ...line, quantity: capped } : line,
        );
      });
      setIsDrawerOpen(true);
    },
    [],
  );

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) {
            return line;
          }
          const next = Math.max(0, quantity);
          const capped =
            line.maxQuantity != null ? Math.min(next, line.maxQuantity) : next;
          return { ...line, quantity: capped };
        })
        .filter((line) => line.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((line) => line.productId !== productId));
  }, []);

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
