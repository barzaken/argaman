/** Row shapes aligned with Supabase public schema / views (snake_case) */

export type InventoryStatusDb = "available" | "unavailable" | "in_transit";

/** רמת גימור (משלוח מלאי) */
export type InventoryFinishLevelDb = "halak" | "tuboza" | "masmesm";

/** סוג חלק: פאנל / מסגרת / פלטה / אבן עומדת */
export type InventoryPieceTypeDb =
  | "panel"
  | "frame"
  | "plate"
  | "standing_stone";

/** יחידת תמחור למלאי */
export type InventoryPricingUnitDb = "m3" | "m2";
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
/** יחידת תמחור להצעת מחיר */
export type QuotePricingUnitDb = "m3" | "m2" | "unit";
export type QuoteStatusDb = "open" | "converted" | "cancelled";
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

/** תפקיד משתמש CRM (crm_users.role): מנהל או סוכן (בוט AI) — סוכן לא מוחק */
export type CrmRoleDb = "admin" | "agent";

/** שורה מ-rpc("crm_list_users") */
export type CrmUserRow = {
  user_id: string;
  email: string | null;
  role: CrmRoleDb;
  display_name: string | null;
  created_at: string;
};

/** סוג מסמך הנהלת חשבונות (documents.kind) */
export type DocumentKindDb =
  | "customer_invoice"
  | "customer_invoice_receipt"
  | "customer_receipt"
  | "customer_credit_note"
  | "supplier_invoice"
  | "supplier_receipt"
  | "supplier_delivery_note"
  | "expense_receipt"
  | "signed_delivery_note"
  | "other";

export type DocumentStatusDb = "pending_review" | "processed" | "rejected";

export type DocumentSourceDb = "upload" | "whatsapp" | "green_invoice" | "system";

export type ExpenseCategoryDb =
  | "stone_purchase"
  | "transport"
  | "fuel"
  | "vehicle"
  | "maintenance"
  | "rent"
  | "salaries"
  | "office"
  | "tools"
  | "professional_services"
  | "taxes_fees"
  | "marketing"
  | "other";

/** סוגי מסמכי הוצאה ב-Green Invoice (expenses.document_type) */
export type ExpenseDocumentTypeDb = 20 | 305 | 320 | 330 | 400 | 405;

export type OrderChargeKindDb =
  | "shipping"
  | "processing"
  | "service"
  | "discount"
  | "other";

export type ActivityActionDb = "insert" | "update" | "delete";

export type StoneRow = {
  id: string;
  name: string;
  color_hex: string;
  is_active: boolean;
  /** מק״ט (ייחודי כשמוגדר) */
  sku?: string | null;
  /** שמות חלופיים שספקים/לקוחות כותבים על מסמכים */
  aliases?: string[];
};

export type CustomerRow = {
  id: string;
  name: string;
  tax_id: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  notes?: string | null;
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
  pricing_unit: InventoryPricingUnitDb;
  price_per_m2: number | null;
  area_m2: number;
  price_per_m3: number;
  customer_price: number;
  status: InventoryStatusDb;
  finish_level: InventoryFinishLevelDb;
  piece_type: InventoryPieceTypeDb;
  expected_arrival_date: string | null;
  stone_name: string;
  color_hex: string;
  created_at?: string;
  supplier_id: string | null;
  source_document_id: string | null;
  supplier_name: string | null;
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
  /** תאריך המסמך (ברירת מחדל: היום בשעון ישראל). "הכנסות החודש" לפיו */
  document_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteRow = {
  id: string;
  quote_number: number;
  customer_id: string;
  status: QuoteStatusDb;
  valid_until: string | null;
  notes: string | null;
  vat_rate: number;
  vat_included: boolean;
  subtotal: number;
  vat_amount: number;
  total: number;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteViewRow = QuoteRow & {
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  has_order: boolean;
  item_count: number;
  converted_order_number: number | null;
};

export type QuoteItemViewRow = {
  id: string;
  quote_id: string;
  stone_id: string;
  pricing_unit: QuotePricingUnitDb;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity: number;
  volume_m3: number;
  area_m2: number;
  price_per_m3: number | null;
  price_per_m2: number | null;
  price_per_unit: number | null;
  line_subtotal: number;
  quote_number: number;
  customer_id: string;
  quote_status: QuoteStatusDb;
  quote_valid_until: string | null;
  quote_vat_rate: number;
  quote_vat_included: boolean;
  customer_name: string;
  stone_name: string;
  stone_color_hex: string;
};

export type OrderViewRow = OrderRow & {
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  has_delivery: boolean;
  item_count: number;
  customer_tax_id: string;
  /** סכום החיובים הנוספים (לפני מע״מ, הנחות שליליות) — כבר כלול ב-subtotal */
  charges_total: number;
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
  stone_color_hex: string;
  inventory_shipment_volume_m3: number;
  inventory_pricing_unit: InventoryPricingUnitDb;
  inventory_price_per_m2: number | null;
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
  /** מחושב בטריגר: סכום ההקצאות + paid_outside_payments */
  amount_paid: number;
  /** תשלום שנרשם מחוץ לטבלת payments (סימון "שולם" ישן / ידני) */
  paid_outside_payments: number;
  /** תאריך התשלום האחרון (מחושב) */
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_number: number;
  order_signature_url: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_phone: string | null;
  customer_email: string | null;
  /** total - amount_paid */
  balance: number;
};

export type DeliveryItemRow = {
  id: string;
  delivery_id: string;
  order_item_id: string;
  stone_id: string;
  inventory_item_id: string;
  stone_name: string;
  color_hex: string;
  length_m: number;
  width_m: number;
  height_m: number;
  quantity: number;
  volume_m3: number;
  price_per_m3: number;
  line_subtotal: number;
  inventory_pricing_unit?: InventoryPricingUnitDb;
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
  amount_paid: number;
  /** יתרה לגבייה = total - amount_paid */
  balance: number;
};

export type DashboardKpisRow = {
  open_orders_count: number;
  unpaid_deliveries_count: number;
  /** סכום היתרות (total - amount_paid) של תעודות לא משולמות ולא מבוטלות */
  receivables_total: number;
  /** סכום הזמנות לא מבוטלות שתאריך המסמך שלהן בחודש הנוכחי */
  monthly_revenue: number;
  monthly_payments_total: number;
  monthly_expenses_total: number;
  pending_documents_count: number;
};

// -----------------------------------------------------------------------------
// שלב 12: ספקים, מסמכים, תשלומים, הוצאות, חיובים, יומן פעולות
// -----------------------------------------------------------------------------

export type SupplierRow = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  green_invoice_supplier_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  kind: DocumentKindDb;
  status: DocumentStatusDb;
  /** נתיב בדלי "documents" ב-Storage (null למסמך שקיים רק כקישור Green Invoice) */
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  document_number: string | null;
  document_date: string | null;
  due_date: string | null;
  currency: string;
  amount_before_vat: number | null;
  vat_amount: number | null;
  amount_total: number | null;
  counterparty_name: string | null;
  counterparty_tax_id: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  order_id: string | null;
  delivery_id: string | null;
  payment_id: string | null;
  expense_id: string | null;
  green_invoice_id: string | null;
  green_invoice_type: number | null;
  green_invoice_url: string | null;
  source: DocumentSourceDb;
  notes: string | null;
  /** פלט חילוץ (OCR / AI) גולמי */
  extracted: Record<string, unknown> | null;
  uploaded_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentViewRow = DocumentRow & {
  customer_name: string | null;
  supplier_name: string | null;
  order_number: number | null;
  delivery_number: number | null;
  payment_number: number | null;
};

export type PaymentRow = {
  id: string;
  payment_number: number;
  customer_id: string;
  amount: number;
  paid_at: string;
  method: PaymentMethodDb;
  /** מספר צ׳ק / אסמכתת העברה */
  reference: string | null;
  bank_name: string | null;
  notes: string | null;
  document_id: string | null;
  green_invoice_receipt_id: string | null;
  green_invoice_receipt_number: string | null;
  green_invoice_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentViewRow = PaymentRow & {
  customer_name: string;
  customer_tax_id: string;
  allocated_amount: number;
  unallocated_amount: number;
  delivery_numbers: number[];
};

export type PaymentAllocationRow = {
  id: string;
  payment_id: string;
  delivery_id: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type PaymentAllocationViewRow = PaymentAllocationRow & {
  payment_number: number;
  paid_at: string;
  method: PaymentMethodDb;
  reference: string | null;
  customer_id: string;
  delivery_number: number;
  delivery_total: number;
  order_number: number;
};

/** פריט ב-p_allocations של crm_record_payment */
export type PaymentAllocationInput = { delivery_id: string; amount: number };

export type ExpenseRow = {
  id: string;
  supplier_id: string | null;
  document_id: string | null;
  category: ExpenseCategoryDb;
  description: string | null;
  expense_date: string;
  /** חודש דיווח — תמיד היום הראשון בחודש (YYYY-MM-01) */
  reporting_month: string | null;
  document_number: string | null;
  document_type: ExpenseDocumentTypeDb;
  amount_before_vat: number | null;
  vat_amount: number | null;
  amount_total: number;
  currency: string;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: PaymentMethodDb | null;
  green_invoice_expense_id: string | null;
  green_invoice_status: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseViewRow = ExpenseRow & {
  supplier_name: string | null;
  supplier_tax_id: string | null;
};

export type OrderChargeRow = {
  id: string;
  order_id: string;
  kind: OrderChargeKindDb;
  description: string;
  /** לפני מע״מ; הנחה שלילית (או 0) */
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ActivityLogRow = {
  id: number;
  at: string;
  user_id: string | null;
  user_email: string | null;
  user_role: CrmRoleDb | null;
  action: ActivityActionDb;
  table_name: string;
  row_id: string | null;
  /** update: {עמודה: {old, new}} רק לעמודות שהשתנו; insert/delete: השורה כולה */
  changes: Record<string, unknown> | null;
};
