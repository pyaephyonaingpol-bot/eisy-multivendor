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
};

export type CartCheckoutItem = {
  product_id: string;
  quantity: number;
};
