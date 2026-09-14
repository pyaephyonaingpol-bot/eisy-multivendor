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
  | "adjustment"
  | "inventory_fee"
  | "platform_commission";
export type WalletTxStatus = "pending" | "completed" | "rejected" | "cancelled";
export type DropshipFeeInvoiceStatus =
  | "pending"
  | "paid"
  | "failed"
  | "waived";
export type SupplierProviderKind =
  | "internal"
  | "cj_dropshipping"
  | "dsers"
  | "print_on_demand"
  | "other";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  preferred_region_id: string | null;
  preferred_country_code: string | null;
  created_at: string;
  updated_at: string;
};

export type SourcingRegion = {
  id: string;
  code: string;
  name: string;
  country_codes: string[];
  is_default: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierProvider = {
  id: string;
  slug: string;
  name: string;
  kind: SupplierProviderKind;
  default_origin_country: string;
  supports_regions: string[];
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductSupplierRoute = {
  id: string;
  product_id: string;
  region_id: string;
  provider_id: string;
  external_sku: string | null;
  warehouse_country: string;
  shipping_days_min: number | null;
  shipping_days_max: number | null;
  shipping_cost_usdt: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ResolvedSupplierRoute = {
  product_id: string;
  source_product_id: string;
  region_id: string;
  region_code: string;
  region_name: string;
  provider_id: string | null;
  provider_slug: string;
  provider_name: string;
  provider_kind: string;
  route_id: string | null;
  warehouse_country: string;
  shipping_days_min: number | null;
  shipping_days_max: number | null;
  shipping_cost_usdt: number;
  external_sku: string | null;
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
  /** Original supplier product when this row is a dropship listing. */
  source_product_id: string | null;
  is_dropship: boolean;
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
  /** Fulfillment / supplier vendor. */
  vendor_id: string;
  /** Storefront seller (dropshipper); equals vendor_id for direct sales. */
  seller_vendor_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  shipping_zone_id: string | null;
  total: number;
  currency: string;
  shipping_address: Record<string, unknown> | null;
  buyer_region_id: string | null;
  buyer_country_code: string | null;
  /** 3% platform commission on dropship GMV (0 for direct sales). */
  platform_commission_usdt: number;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  listing_product_id: string | null;
  source_product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_unit_price: number | null;
  total_price: number;
  supplier_provider_id: string | null;
  supplier_route_id: string | null;
  warehouse_country: string | null;
  shipping_estimate_days_min: number | null;
  shipping_estimate_days_max: number | null;
  shipping_cost_usdt: number | null;
  platform_commission_usdt: number;
  created_at: string;
};

export type DropshipFeeChargeTrigger = "cron" | "admin" | "vendor";

export type DropshipFeeChargeRun = {
  id: string;
  billing_month: string;
  trigger_source: DropshipFeeChargeTrigger;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  paid_count: number;
  failed_count: number;
  skipped_count: number;
  total_charged_usdt: number;
  errors: { vendor_id?: string; error?: string }[];
  note: string | null;
  created_at: string;
};

export type DropshipFeeSettings = {
  id: number;
  item_fee_usdt: number;
  min_billable_items: number;
  commission_rate: number;
  updated_at: string;
};

export type DropshipInventoryFeeInvoice = {
  id: string;
  vendor_id: string;
  billing_month: string;
  active_item_count: number;
  billable_item_count: number;
  unit_fee_usdt: number;
  amount_usdt: number;
  status: DropshipFeeInvoiceStatus;
  wallet_transaction_id: string | null;
  charged_at: string | null;
  charged_by: string | null;
  charge_run_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type DropshipInventoryFeePreview = {
  vendor_id: string;
  billing_month: string;
  is_dropshipper: boolean;
  active_item_count: number;
  billable_item_count: number;
  unit_fee_usdt: number;
  min_billable_items: number;
  commission_rate: number;
  amount_usdt: number;
  invoice_id?: string | null;
  invoice_status?: DropshipFeeInvoiceStatus | null;
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
      sourcing_regions: {
        Row: SourcingRegion;
        Insert: Partial<SourcingRegion> & Pick<SourcingRegion, "code" | "name">;
        Update: Partial<SourcingRegion>;
        Relationships: [];
      };
      supplier_providers: {
        Row: SupplierProvider;
        Insert: Partial<SupplierProvider> &
          Pick<SupplierProvider, "slug" | "name" | "kind">;
        Update: Partial<SupplierProvider>;
        Relationships: [];
      };
      product_supplier_routes: {
        Row: ProductSupplierRoute;
        Insert: Partial<ProductSupplierRoute> &
          Pick<
            ProductSupplierRoute,
            "product_id" | "region_id" | "provider_id" | "warehouse_country"
          >;
        Update: Partial<ProductSupplierRoute>;
        Relationships: [];
      };
      dropship_fee_settings: {
        Row: DropshipFeeSettings;
        Insert: Partial<DropshipFeeSettings> & Pick<DropshipFeeSettings, "id">;
        Update: Partial<DropshipFeeSettings>;
        Relationships: [];
      };
      dropship_inventory_fee_invoices: {
        Row: DropshipInventoryFeeInvoice;
        Insert: Partial<DropshipInventoryFeeInvoice> &
          Pick<
            DropshipInventoryFeeInvoice,
            | "vendor_id"
            | "billing_month"
            | "billable_item_count"
            | "unit_fee_usdt"
            | "amount_usdt"
          >;
        Update: Partial<DropshipInventoryFeeInvoice>;
        Relationships: [];
      };
      dropship_fee_charge_runs: {
        Row: DropshipFeeChargeRun;
        Insert: Partial<DropshipFeeChargeRun> &
          Pick<DropshipFeeChargeRun, "billing_month" | "trigger_source">;
        Update: Partial<DropshipFeeChargeRun>;
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
      checkout_with_usdt: {
        Args: {
          p_items: { product_id: string; quantity: number }[];
          p_shipping_address?: Record<string, unknown> | null;
        };
        Returns: {
          order_ids: string[];
          total: number;
          currency: string;
          wallet_transaction_id: string;
          buyer_region_code?: string;
          buyer_country_code?: string;
          shipping_total?: number;
          platform_commission_total?: number;
          commission_rate?: number;
        };
      };
      preview_dropship_inventory_fee: {
        Args: {
          p_vendor_id: string;
          p_billing_month?: string | null;
        };
        Returns: DropshipInventoryFeePreview;
      };
      charge_dropship_inventory_fee: {
        Args: {
          p_vendor_id: string;
          p_billing_month?: string | null;
          p_charge_run_id?: string | null;
        };
        Returns: {
          invoice_id: string;
          status: DropshipFeeInvoiceStatus | string;
          billing_month?: string;
          active_item_count?: number;
          billable_item_count?: number;
          amount_usdt: number;
          wallet_transaction_id?: string;
          message?: string;
          charge_run_id?: string;
        };
      };
      charge_all_dropship_inventory_fees: {
        Args: {
          p_billing_month?: string | null;
          p_trigger_source?: DropshipFeeChargeTrigger | null;
          p_note?: string | null;
        };
        Returns: {
          billing_month: string;
          paid: number;
          failed: number;
          skipped: number;
          total_charged_usdt?: number;
          errors: { vendor_id: string; error: string }[];
          charge_run_id?: string;
          trigger_source?: DropshipFeeChargeTrigger;
        };
      };
      resolve_sourcing_region: {
        Args: {
          p_country_code: string;
        };
        Returns: SourcingRegion;
      };
      resolve_product_supplier_route: {
        Args: {
          p_product_id: string;
          p_country_code: string;
        };
        Returns: ResolvedSupplierRoute;
      };
      set_preferred_sourcing_region: {
        Args: {
          p_country_code: string;
          p_region_code?: string | null;
        };
        Returns: {
          region_id: string;
          region_code: string;
          region_name: string;
          country_code: string | null;
          country_codes: string[];
        };
      };
      ensure_recommended_supplier_routes: {
        Args: {
          p_product_id: string;
        };
        Returns: number;
      };
      import_dropship_product: {
        Args: {
          p_source_product_id: string;
          p_price: number;
          p_status?: ProductStatus;
        };
        Returns: {
          product_id: string;
          source_product_id: string;
          updated: boolean;
          price: number;
          status: ProductStatus;
          slug?: string;
        };
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
      dropship_fee_invoice_status: DropshipFeeInvoiceStatus;
      dropship_fee_charge_trigger: DropshipFeeChargeTrigger;
      supplier_provider_kind: SupplierProviderKind;
    };
    CompositeTypes: Record<string, never>;
  };
};
