export type UserRole = "customer" | "vendor" | "admin";
export type VendorStatus = "pending" | "approved" | "suspended" | "rejected";
export type ProductStatus = "draft" | "active" | "archived";
export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type SubscriptionPlan = "free" | "starter" | "pro" | "enterprise";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type Vendor = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: VendorStatus;
  commission_rate: number;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  vendor_id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  sku: string | null;
  stock_quantity: number;
  images: string[];
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};

export type ShippingZone = {
  id: string;
  vendor_id: string;
  name: string;
  countries: string[];
  regions: string[];
  min_order_amount: number;
  flat_rate: number;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  customer_id: string;
  vendor_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  shipping_zone_id: string | null;
  total: number;
  currency: string;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  vendor_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "email">;
        Update: Partial<Profile>;
      };
      vendors: {
        Row: Vendor;
        Insert: Partial<Vendor> & Pick<Vendor, "owner_id" | "name" | "slug">;
        Update: Partial<Vendor>;
      };
      products: {
        Row: Product;
        Insert: Partial<Product> & Pick<Product, "vendor_id" | "name" | "slug" | "price">;
        Update: Partial<Product>;
      };
      shipping_zones: {
        Row: ShippingZone;
        Insert: Partial<ShippingZone> & Pick<ShippingZone, "vendor_id" | "name">;
        Update: Partial<ShippingZone>;
      };
      orders: {
        Row: Order;
        Insert: Partial<Order> & Pick<Order, "customer_id" | "vendor_id">;
        Update: Partial<Order>;
      };
      order_items: {
        Row: OrderItem;
        Insert: Partial<OrderItem> &
          Pick<OrderItem, "order_id" | "product_name" | "quantity" | "unit_price" | "total_price">;
        Update: Partial<OrderItem>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & Pick<Subscription, "user_id">;
        Update: Partial<Subscription>;
      };
    };
  };
};
