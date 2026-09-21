export type CartLineItem = {
  productId: string;
  vendorId: string;
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  quantity: number;
  productType: "physical" | "digital";
  maxQuantity: number | null;
  /** Optional CJ / supplier variant id for multi-SKU listings. */
  variantId?: string | null;
  variantSku?: string | null;
  variantLabel?: string | null;
};

export type CartState = {
  items: CartLineItem[];
};

export type CartCheckoutItem = {
  product_id: string;
  quantity: number;
};
