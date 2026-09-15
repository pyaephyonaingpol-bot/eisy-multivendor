export type UserRole = "customer" | "vendor" | "admin";
export type VendorStatus = "pending" | "approved" | "suspended" | "rejected";
export type VendorKycStatus =
  | "unsubmitted"
  | "pending"
  | "approved"
  | "rejected";
export type VendorKycDocumentType =
  | "passport"
  | "national_id"
  | "trade_license";
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
export type OrderPayoutStatus =
  | "held"
  | "released"
  | "not_applicable"
  | "disputed"
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
  | "platform_commission"
  | "escrow_hold"
  | "escrow_release"
  | "escrow_refund";
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
  | "spocket"
  | "print_on_demand"
  | "other";

export type SupplierFulfillmentJobStatus =
  | "pending"
  | "processing"
  | "submitted"
  | "failed"
  | "skipped";

export type VendorSupplierCredential = {
  id: string;
  vendor_id: string;
  provider_id: string;
  api_key: string | null;
  api_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_email: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalProductImport = {
  id: string;
  vendor_id: string;
  provider_id: string;
  product_id: string | null;
  external_product_id: string;
  external_variant_id: string | null;
  external_sku: string | null;
  source_payload: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
};

export type SupplierFulfillmentJob = {
  id: string;
  order_id: string;
  provider_id: string | null;
  provider_kind: SupplierProviderKind | null;
  status: SupplierFulfillmentJobStatus;
  attempts: number;
  supplier_order_ref: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

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
  /** Optional per-vendor import cap override (null = use plan/system default). */
  max_import_items_override?: number | null;
  /** Identity verification status for publishing + withdrawals. */
  kyc_status: VendorKycStatus;
  kyc_document_type: VendorKycDocumentType | null;
  kyc_document_url: string | null;
  kyc_document_path: string | null;
  kyc_legal_name: string | null;
  kyc_document_number: string | null;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_reviewed_by: string | null;
  kyc_rejection_reason: string | null;
  /**
   * When non-empty, this seller's listings are only shown/sellable to these
   * sourcing regions. Empty = worldwide (still subject to product-level ships_to).
   */
  ships_to_region_ids: string[];
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
  /** ISO country code for the listing's primary warehouse / origin. */
  origin_country_code: string | null;
  /** Primary sourcing region for this listing. */
  origin_region_id: string | null;
  /**
   * When non-empty, only these sourcing regions may buy the listing.
   * Empty means deliverability is derived from supplier routes (and local defaults).
   */
  ships_to_region_ids: string[];
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

export type FulfillmentSyncSource =
  | "manual"
  | "supplier_webhook"
  | "supplier_poll"
  | "system";

export type FulfillmentSyncStatus = "idle" | "pending" | "synced" | "error";

export type UsdtPaymentIntentStatus =
  | "pending"
  | "detecting"
  | "confirmed"
  | "expired"
  | "cancelled";

export type UsdtPaymentSettings = {
  id: number;
  deposit_address: string;
  contract_address: string;
  network: string;
  min_confirmations: number;
  updated_at: string;
};

export type UsdtPaymentIntent = {
  id: string;
  user_id: string;
  amount_usdt: number;
  observed_amount_usdt: number | null;
  status: UsdtPaymentIntentStatus;
  network: string;
  deposit_address: string;
  from_address: string | null;
  to_address: string | null;
  tx_hash: string | null;
  confirmations: number;
  order_ids: string[];
  shipping_address: Record<string, unknown> | null;
  raw_payload: Record<string, unknown>;
  expires_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UsdtPaymentEvent = {
  id: string;
  payment_intent_id: string;
  event_type: string;
  tx_hash: string | null;
  payload: Record<string, unknown>;
  created_at: string;
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
  payment_intent_id: string | null;
  payment_method: string | null;
  payment_tx_hash: string | null;
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
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  payout_status: OrderPayoutStatus;
  payout_released_at: string | null;
  payout_release_source: string | null;
  supplier_order_ref: string | null;
  fulfillment_sync_status: FulfillmentSyncStatus;
  fulfillment_synced_at: string | null;
  fulfillment_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderEscrowRole = "supplier" | "seller" | "platform";

export type OrderEscrowLedger = {
  id: string;
  order_id: string;
  beneficiary_user_id: string;
  role: OrderEscrowRole;
  amount_usdt: number;
  status: "held" | "released" | "refunded";
  hold_tx_id: string | null;
  release_tx_id: string | null;
  created_at: string;
  released_at: string | null;
};

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_refund"
  | "resolved_release"
  | "cancelled";

export type DisputeReason =
  | "not_received"
  | "damaged"
  | "not_as_described"
  | "wrong_item"
  | "other";

export type Dispute = {
  id: string;
  order_id: string;
  opened_by: string;
  reason: DisputeReason;
  description: string | null;
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderFulfillmentEvent = {
  id: string;
  order_id: string;
  source: FulfillmentSyncSource;
  previous_status: OrderStatus | null;
  new_status: OrderStatus | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  supplier_order_ref: string | null;
  payload: Record<string, unknown>;
  note: string | null;
  created_by: string | null;
  created_at: string;
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
  /** System-wide max imported dropship catalog size when no plan/override applies. */
  default_max_import_items?: number;
  updated_at: string;
};

export type DropshipPlanImportLimit = {
  plan: SubscriptionPlan;
  max_import_items: number;
  updated_at?: string;
};

export type VendorImportQuota = {
  vendor_id: string;
  plan: SubscriptionPlan;
  active_item_count: number;
  catalog_item_count: number;
  min_active_items: number;
  max_import_items: number;
  remaining_import_slots: number;
  meets_minimum: boolean;
  at_import_limit: boolean;
  item_fee_usdt: number;
  limit_source: "vendor_override" | "subscription_plan" | "system_default";
  default_max_import_items: number;
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
  escrow_balance: number;
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
      order_escrow_ledger: {
        Row: OrderEscrowLedger;
        Insert: Partial<OrderEscrowLedger> &
          Pick<
            OrderEscrowLedger,
            "order_id" | "beneficiary_user_id" | "role" | "amount_usdt"
          >;
        Update: Partial<OrderEscrowLedger>;
        Relationships: [];
      };
      disputes: {
        Row: Dispute;
        Insert: Partial<Dispute> &
          Pick<Dispute, "order_id" | "opened_by" | "reason">;
        Update: Partial<Dispute>;
        Relationships: [];
      };
      order_fulfillment_events: {
        Row: OrderFulfillmentEvent;
        Insert: Partial<OrderFulfillmentEvent> &
          Pick<OrderFulfillmentEvent, "order_id" | "source">;
        Update: Partial<OrderFulfillmentEvent>;
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
      usdt_payment_settings: {
        Row: UsdtPaymentSettings;
        Insert: Partial<UsdtPaymentSettings> & Pick<UsdtPaymentSettings, "id">;
        Update: Partial<UsdtPaymentSettings>;
        Relationships: [];
      };
      usdt_payment_intents: {
        Row: UsdtPaymentIntent;
        Insert: Partial<UsdtPaymentIntent> &
          Pick<UsdtPaymentIntent, "user_id" | "amount_usdt" | "deposit_address">;
        Update: Partial<UsdtPaymentIntent>;
        Relationships: [];
      };
      usdt_payment_events: {
        Row: UsdtPaymentEvent;
        Insert: Partial<UsdtPaymentEvent> &
          Pick<UsdtPaymentEvent, "payment_intent_id" | "event_type">;
        Update: Partial<UsdtPaymentEvent>;
        Relationships: [];
      };
      vendor_supplier_credentials: {
        Row: VendorSupplierCredential;
        Insert: Partial<VendorSupplierCredential> &
          Pick<VendorSupplierCredential, "vendor_id" | "provider_id">;
        Update: Partial<VendorSupplierCredential>;
        Relationships: [];
      };
      external_product_imports: {
        Row: ExternalProductImport;
        Insert: Partial<ExternalProductImport> &
          Pick<
            ExternalProductImport,
            "vendor_id" | "provider_id" | "external_product_id"
          >;
        Update: Partial<ExternalProductImport>;
        Relationships: [];
      };
      supplier_fulfillment_jobs: {
        Row: SupplierFulfillmentJob;
        Insert: Partial<SupplierFulfillmentJob> &
          Pick<SupplierFulfillmentJob, "order_id">;
        Update: Partial<SupplierFulfillmentJob>;
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
      submit_vendor_kyc: {
        Args: {
          p_document_type: string;
          p_document_path: string;
          p_document_url: string;
          p_legal_name: string;
          p_document_number?: string | null;
        };
        Returns: Vendor;
      };
      review_vendor_kyc: {
        Args: {
          p_vendor_id: string;
          p_approve: boolean;
          p_rejection_reason?: string | null;
        };
        Returns: Vendor;
      };
      vendor_kyc_is_approved: {
        Args: { p_vendor_id: string };
        Returns: boolean;
      };
      ensure_user_wallets: {
        Args: {
          p_user_id: string;
        };
        Returns: undefined;
      };
      sync_order_fulfillment: {
        Args: {
          p_order_id: string;
          p_status?: OrderStatus | null;
          p_tracking_number?: string | null;
          p_tracking_carrier?: string | null;
          p_tracking_url?: string | null;
          p_supplier_order_ref?: string | null;
          p_source?: FulfillmentSyncSource | null;
          p_payload?: Record<string, unknown> | null;
          p_note?: string | null;
        };
        Returns: Order;
      };
      confirm_order_delivered_by_buyer: {
        Args: {
          p_order_id: string;
        };
        Returns: Order;
      };
      open_order_dispute: {
        Args: {
          p_order_id: string;
          p_reason: DisputeReason;
          p_description?: string | null;
        };
        Returns: Dispute;
      };
      resolve_dispute_refund_buyer: {
        Args: {
          p_dispute_id: string;
          p_note?: string | null;
        };
        Returns: Dispute;
      };
      resolve_dispute_release_seller: {
        Args: {
          p_dispute_id: string;
          p_note?: string | null;
        };
        Returns: Dispute;
      };
      mark_dispute_under_review: {
        Args: { p_dispute_id: string };
        Returns: Dispute;
      };
      set_profile_role: {
        Args: {
          p_user_id: string;
          p_role: UserRole;
        };
        Returns: Profile;
      };
      release_order_escrow: {
        Args: {
          p_order_id: string;
          p_source?: string | null;
          p_actor?: string | null;
        };
        Returns: Order;
      };
      mark_order_fulfillment_sync: {
        Args: {
          p_order_id: string;
          p_status: FulfillmentSyncStatus;
          p_error?: string | null;
        };
        Returns: Order;
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
      create_usdt_trc20_checkout: {
        Args: {
          p_items: { product_id: string; quantity: number }[];
          p_shipping_address?: Record<string, unknown> | null;
        };
        Returns: {
          order_ids: string[];
          total: number;
          currency: string;
          payment_method: string;
          payment_intent_id: string;
          deposit_address: string;
          network: string;
          usdt_contract: string;
          expires_at: string;
          buyer_region_code?: string;
          buyer_country_code?: string;
          shipping_total?: number;
          platform_commission_total?: number;
          commission_rate?: number;
        };
      };
      confirm_usdt_trc20_payment: {
        Args: {
          p_payment_intent_id: string;
          p_tx_hash: string;
          p_from_address?: string | null;
          p_to_address?: string | null;
          p_amount_usdt?: number | null;
          p_confirmations?: number | null;
          p_raw_payload?: Record<string, unknown> | null;
        };
        Returns: {
          status: string;
          payment_intent_id: string;
          order_ids: string[];
          tx_hash: string;
          amount_usdt?: number;
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
      product_is_deliverable_to_country: {
        Args: {
          p_product_id: string;
          p_country_code: string;
        };
        Returns: boolean;
      };
      assert_cart_deliverable_to_country: {
        Args: {
          p_items: { product_id: string; quantity: number }[] | unknown;
          p_country_code: string;
        };
        Returns: undefined;
      };
      filter_deliverable_product_ids: {
        Args: {
          p_product_ids: string[];
          p_country_code: string;
        };
        Returns: string[];
      };

      get_vendor_import_quota: {
        Args: { p_vendor_id: string };
        Returns: VendorImportQuota;
      };
      assert_vendor_can_import_product: {
        Args: {
          p_vendor_id: string;
          p_is_new_catalog_item?: boolean;
        };
        Returns: undefined;
      };
      admin_update_import_limit_settings: {
        Args: {
          p_default_max_import_items?: number | null;
          p_min_billable_items?: number | null;
          p_plan_limits?: Record<string, number> | null;
        };
        Returns: {
          default_max_import_items: number;
          min_billable_items: number;
          item_fee_usdt: number;
          plan_limits: Record<string, number>;
        };
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
      enqueue_supplier_fulfillment_for_order: {
        Args: { p_order_id: string };
        Returns: {
          order_id: string;
          enqueued: number;
          skipped: number;
          message?: string;
        };
      };
      claim_supplier_fulfillment_jobs: {
        Args: { p_limit?: number };
        Returns: SupplierFulfillmentJob[];
      };
      complete_supplier_fulfillment_job: {
        Args: {
          p_job_id: string;
          p_status: SupplierFulfillmentJobStatus;
          p_supplier_order_ref?: string | null;
          p_response?: Record<string, unknown>;
          p_error?: string | null;
        };
        Returns: SupplierFulfillmentJob;
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
      fulfillment_sync_source: FulfillmentSyncSource;
      fulfillment_sync_status: FulfillmentSyncStatus;
      payment_status: PaymentStatus;
      subscription_plan: SubscriptionPlan;
      subscription_status: SubscriptionStatus;
      wallet_currency: WalletCurrency;
      wallet_tx_type: WalletTxType;
      wallet_tx_status: WalletTxStatus;
      dropship_fee_invoice_status: DropshipFeeInvoiceStatus;
      dropship_fee_charge_trigger: DropshipFeeChargeTrigger;
      supplier_provider_kind: SupplierProviderKind;
      supplier_fulfillment_job_status: SupplierFulfillmentJobStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
