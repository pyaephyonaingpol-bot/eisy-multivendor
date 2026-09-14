export type CartLineItem = {
  productId: string;
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  quantity: number;
  productType: "physical" | "digital";
  maxQuantity: number | null;
};

export type CartState = {
  items: CartLineItem[];
};
