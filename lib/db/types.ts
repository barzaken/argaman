/** Row shapes aligned with Supabase public schema / views (snake_case) */

export type InventoryStatusDb = "available" | "unavailable" | "in_transit";
export type OrderStatusDb =
  | "open"
  | "in_production"
  | "ready_for_delivery"
  | "completed"
  | "cancelled";
export type OrderItemStatusDb =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";
export type PriorityDb = "low" | "medium" | "urgent";
export type FulfillmentMethodDb = "pickup" | "shipping";
export type DeliveryStatusDb =
  | "waiting_for_pickup"
  | "in_transit"
  | "delivered"
  | "cancelled";
export type PaymentStatusDb = "unpaid" | "paid";
export type PaymentMethodDb =
  | "cash"
  | "bank_transfer"
  | "check"
  | "credit_card"
  | "other";

export type StoneRow = {
  id: string;
  name: string;
  polish_type: string;
  color_hex: string;
  is_active: boolean;
};

export type CustomerRow = {
  id: string;
  name: string;
  tax_id: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
};

export type InventoryItemViewRow = {
  id: string;
  stone_id: string;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity_total: number;
  quantity_reserved: number;
  quantity_delivered: number;
  quantity_available: number;
  volume_m3: number;
  price_per_m3: number;
  customer_price: number;
  status: InventoryStatusDb;
  expected_arrival_date: string | null;
  stone_name: string;
  polish_type: string;
  color_hex: string;
  created_at?: string;
};

/** מחיר קו״ב ללקוח לפי מוצר בקטלוג (אבן) */
export type CustomerStonePriceRow = {
  id: string;
  customer_id: string;
  stone_id: string;
  price_per_m3: number;
};

export type OrderRow = {
  id: string;
  order_number: number;
  customer_id: string;
  status: OrderStatusDb;
  priority: PriorityDb;
  supply_due_date: string | null;
  signature_url: string | null;
  vat_rate: number;
  vat_included: boolean;
  subtotal: number;
  vat_amount: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type OrderViewRow = OrderRow & {
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  has_delivery: boolean;
  item_count: number;
};

export type OrderItemViewRow = {
  id: string;
  order_id: string;
  stone_id: string;
  inventory_item_id: string;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity: number;
  volume_m3: number;
  price_per_m3: number;
  line_subtotal: number;
  status: OrderItemStatusDb;
  order_number: number;
  customer_id: string;
  order_priority: PriorityDb;
  order_supply_due_date: string | null;
  order_status: OrderStatusDb;
  customer_name: string;
  stone_name: string;
  polish_type: string;
  stone_color_hex: string;
  inventory_shipment_volume_m3: number;
};

export type DeliveryViewRow = {
  id: string;
  delivery_number: number;
  order_id: string;
  customer_id: string;
  status: DeliveryStatusDb;
  payment_status: PaymentStatusDb;
  payment_method: PaymentMethodDb | null;
  payment_due_date: string | null;
  fulfillment_method: FulfillmentMethodDb;
  shipping_address: string | null;
  delivered_at: string | null;
  green_invoice_id: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  created_at: string;
  updated_at: string;
  order_number: number;
  order_signature_url: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_phone: string | null;
  customer_email: string | null;
};

export type DeliveryItemRow = {
  id: string;
  delivery_id: string;
  order_item_id: string;
  stone_id: string;
  inventory_item_id: string;
  stone_name: string;
  polish_type: string;
  color_hex: string;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity: number;
  volume_m3: number;
  price_per_m3: number;
  line_subtotal: number;
};

export type DebtorsViewRow = {
  delivery_id: string;
  delivery_number: number;
  order_id: string;
  customer_id: string;
  payment_due_date: string | null;
  total: number;
  payment_status: PaymentStatusDb;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  order_number: number;
};

export type DashboardKpisRow = {
  open_orders_count: number;
  unpaid_deliveries_count: number;
  receivables_total: number;
  receivables_due_week: number;
};
