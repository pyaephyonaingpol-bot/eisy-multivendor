"use client";

import { useState } from "react";
import { useCart } from "@/components/storefront/cart-provider";

type AddToCartButtonProps = {
  productId: string;
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  productType: "physical" | "digital";
  maxQuantity: number | null;
  disabled?: boolean;
};

export function AddToCartButton({
  productId,
  name,
  price,
  currency,
  imageUrl,
  productType,
  maxQuantity,
  disabled = false,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="space-y-3">
      {productType === "physical" ? (
        <div className="space-y-1.5">
          <label htmlFor="add-qty" className="text-sm font-medium text-zinc-700">
            Quantity
          </label>
          <input
            id="add-qty"
            type="number"
            min={1}
            max={maxQuantity ?? undefined}
            value={quantity}
            disabled={disabled}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          addItem({
            productId,
            name,
            price,
            currency,
            imageUrl,
            productType,
            maxQuantity,
            quantity: productType === "digital" ? 1 : quantity,
          })
        }
        className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? "Out of stock" : "Add to cart"}
      </button>
    </div>
  );
}
