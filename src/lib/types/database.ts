export type UserRole = "customer" | "vendor" | "admin";
export type VendorStatus = "pending" | "approved" | "suspended" | "rejected";
export type ProductStatus = "draft" | "active" | "archived";
export type ProductType = "physical" | "digital";
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
export type WalletCurrency = "USDT" | "MMK";
export type WalletTxType =
  | "deposit"
  | "withdrawal"
  | "purchase"
  | "sale_credit"
  | "adjustment";
export type WalletTxStatus = "pending" | "completed" | "rejected" | "cancelled";

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

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductSpecification = {
  key: string;
  value: string;
};

export type Product = {
  id: string;
  vendor_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  sku: string | null;
  stock_quantity: number;
  images: string[];
  specifications: ProductSpecification[];
  status: ProductStatus;
  product_type: ProductType;
  download_url: string | null;
  download_label: string | null;
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

export type Wallet = {
  id: string;
  user_id: string;
  currency: WalletCurrency;
  available_balance: number;
  pending_balance: number;
  created_at: string;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  user_id: string;
  currency: WalletCurrency;
  tx_type: WalletTxType;
  status: WalletTxStatus;
  amount: number;
  destination: string | null;
  reference: string | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
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
        Relationships: [];
      };
      vendors: {
        Row: Vendor;
        Insert: Partial<Vendor> & Pick<Vendor, "owner_id" | "name" | "slug">;
        Update: Partial<Vendor>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Partial<Category> & Pick<Category, "name" | "slug">;
        Update: Partial<Category>;
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: Partial<Product> & Pick<Product, "vendor_id" | "name" | "slug" | "price">;
        Update: Partial<Product>;
        Relationships: [];
      };
      shipping_zones: {
        Row: ShippingZone;
        Insert: Partial<ShippingZone> & Pick<ShippingZone, "vendor_id" | "name">;
        Update: Partial<ShippingZone>;
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: Partial<Order> & Pick<Order, "customer_id" | "vendor_id">;
        Update: Partial<Order>;
        Relationships: [];
      };
      order_items: {
        Row: OrderItem;
        Insert: Partial<OrderItem> &
          Pick<OrderItem, "order_id" | "product_name" | "quantity" | "unit_price" | "total_price">;
        Update: Partial<OrderItem>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & Pick<Subscription, "user_id">;
        Update: Partial<Subscription>;
        Relationships: [];
      };
      wallets: {
        Row: Wallet;
        Insert: Partial<Wallet> & Pick<Wallet, "user_id" | "currency">;
        Update: Partial<Wallet>;
        Relationships: [];
      };
      wallet_transactions: {
        Row: WalletTransaction;
        Insert: Partial<WalletTransaction> &
          Pick<
            WalletTransaction,
            "wallet_id" | "user_id" | "currency" | "tx_type" | "amount"
          >;
        Update: Partial<WalletTransaction>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_for_vendor: {
        Args: {
          p_name: string;
          p_slug: string;
          p_description?: string | null;
        };
        Returns: string;
      };
      review_vendor: {
        Args: {
          p_vendor_id: string;
          p_status: VendorStatus;
        };
        Returns: undefined;
      };
      ensure_user_wallets: {
        Args: {
          p_user_id: string;
        };
        Returns: undefined;
      };
      request_wallet_deposit: {
        Args: {
          p_currency: WalletCurrency;
          p_amount: number;
          p_reference?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      request_wallet_withdrawal: {
        Args: {
          p_currency: WalletCurrency;
          p_amount: number;
          p_destination: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      review_wallet_transaction: {
        Args: {
          p_tx_id: string;
          p_approve: boolean;
          p_note?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      vendor_status: VendorStatus;
      product_status: ProductStatus;
      product_type: ProductType;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      subscription_plan: SubscriptionPlan;
      subscription_status: SubscriptionStatus;
      wallet_currency: WalletCurrency;
      wallet_tx_type: WalletTxType;
      wallet_tx_status: WalletTxStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
