# Stage 12 contract: documents, payments, suppliers, expenses, roles, activity log

The UI agents build on this file. The DB is the source of truth: `sql/patch-2026-11-documents-payments.sql` (idempotent, runs after `patch-2026-11-crm-users-allowlist.sql`).
TS types are in `lib/db/types.ts`, Hebrew labels in `lib/db/labels.ts`, and Hebrew error mapping in `lib/db/errors.ts` (`toHebrewError`).

> Next.js 16: read `node_modules/next/dist/docs/` before writing routes. Follow the patterns that already exist in `app/dashboard/*`.

---

## 1. Roles

| | admin | agent (WhatsApp AI bot) |
|---|---|---|
| SELECT / INSERT / UPDATE on every CRM table | ✅ | ✅ |
| DELETE (any table, storage files) | ✅ | ❌ |
| `crm_delete_order`, `crm_delete_quote` | ✅ | ❌ raises `admin only` |

- `crm_users(user_id, role 'admin'|'agent' default 'admin', display_name)`.
- SQL helpers: `crm_user_role()` returns text (null when the user is not in `crm_users`), `is_crm_admin()`, `is_crm_user()`.
- Every table has 4 policies, `<t>_crm_select|insert|update` (is_crm_user) and `<t>_crm_delete` (is_crm_admin).
- **A blocked DELETE does not raise an error.** RLS filters the rows, and Supabase returns success with 0 rows deleted. Every delete action must therefore start with `requireAdmin()`.
- Deliberate exceptions, where a delete is part of an edit:
  - `quote_items` in an open quote (`crm_update_quote_with_items` replaces the lines).
  - `order_charges` (blocked anyway once the order has a delivery).
  - An `inventory_items` row created in the last 10 minutes with nothing reserved or delivered (the rollback in `createOrder`).
- Users and roles (for the settings page):
  - `rpc("crm_list_users")` returns `CrmUserRow[]`. An admin sees everyone, an agent sees only themself.
  - `rpc("crm_set_user_role", { p_user_id, p_role, p_display_name? })` is admin only. It raises `last admin` when you try to demote the last admin.

### Server helpers: `lib/supabase/auth-helpers.ts`
```ts
const auth = await requireAuth();   // { ok, supabase, userId, email, role: 'admin'|'agent', isAdmin } | { ok:false, message }
const auth = await requireAdmin();  // agent → { ok:false, message: "פעולה זו מותרת למנהל בלבד" }
const me = await getCurrentCrmUser(); // Server Components (React cache): { userId, email, role, isAdmin } | null → hide delete buttons when !me?.isAdmin
```
- A logged-in user who is not in `crm_users` gets `ok:false` ("המשתמש אינו מורשה…").
- If the patch has not been run yet, the role falls back to `admin`.
- `requireAdmin()` already guards `deleteOrder`, `deleteQuote`, `deleteCustomerStonePrice` and `deleteInventoryItem`.

---

## 2. Tables and columns (new or changed)

**suppliers**: `id, name*, tax_id (unique when not null), email, phone, address, notes, is_active=true, green_invoice_supplier_id, created_at, updated_at`.

**stones** adds:
- `sku` (unique when not null).
- `aliases text[]` (default `{}`): the names that suppliers and customers write on their documents.

**inventory_items** adds:
- `supplier_id` (FK, on delete set null).
- `source_document_id` (FK documents, on delete set null).
- `inventory_items_view` adds `supplier_name`, appended at the end.

**orders** adds:
- `document_date date NOT NULL default today (Israel)`, backfilled from `created_at`.
- `notes`.
- `orders_view` appends `customer_tax_id` and `charges_total`.
- KPI `monthly_revenue` is computed from `document_date`.

**deliveries** adds:
- `amount_paid` (computed).
- `paid_outside_payments` (legacy or manual).
- `paid_at` (computed: the date of the last allocated payment).
- `notes`.
- `deliveries_view` appends `balance` (= total − amount_paid).

**documents**: the archive and inbox for accounting documents.
- Kind and status:
  - `kind document_kind`: `customer_invoice | customer_invoice_receipt | customer_receipt | customer_credit_note | supplier_invoice | supplier_receipt | supplier_delivery_note | expense_receipt | signed_delivery_note | other`.
  - `status document_status`: `pending_review` (default) | `processed` | `rejected`.
- File: `storage_path` (nullable), `file_name`, `mime_type`, `file_size`.
- Document details: `document_number`, `document_date`, `due_date`, `currency='ILS'`, `amount_before_vat`, `vat_amount`, `amount_total`.
- Counterparty: `counterparty_name`, `counterparty_tax_id`.
- Links, all nullable and set to null on delete: `customer_id`, `supplier_id`, `order_id`, `delivery_id`, `payment_id`, `expense_id`.
- Green Invoice: `green_invoice_id`, `green_invoice_type int`, `green_invoice_url`.
- `source`: `'upload'|'whatsapp'|'green_invoice'|'system'` (default `upload`).
- Other: `notes`, `extracted jsonb` (raw OCR/AI output), `uploaded_by` (default auth.uid()), `reviewed_by`, `reviewed_at`, timestamps.
- **Duplicate guard:** a unique index on `(kind, coalesce(counterparty_tax_id,''), document_number)` where `document_number is not null and status <> 'rejected'`. It maps to "המסמך כבר הוזן במערכת (אותו סוג, ח.פ ומספר)". Rejecting the original frees the number.
- `documents_view` adds `customer_name, supplier_name, order_number, delivery_number, payment_number`.

**payments** (from customers): `id, payment_number (seq from 1000), customer_id*, amount (>0), paid_at date (default today), method payment_method*, reference (cheque number or transfer ref), bank_name, notes, document_id, green_invoice_receipt_id, green_invoice_receipt_number, green_invoice_url, created_by, timestamps`.
- `payments_view` adds `customer_name, customer_tax_id, allocated_amount, unallocated_amount, delivery_numbers bigint[]`.

**payment_allocations**: `id, payment_id (cascade), delivery_id (cascade), amount > 0, unique(payment_id, delivery_id)`.
- `payment_allocations_view` adds `payment_number, paid_at, method, reference, customer_id, delivery_number, delivery_total, order_number`. Use it to list a delivery's payments.

**expenses**:
- Links: `id, supplier_id?, document_id?`.
- Classification: `category expense_category` (default `other`), `description`.
- Dates: `expense_date*`, `reporting_month` (must be the 1st of the month or null).
- Document: `document_number`, `document_type int` (default 305; must be one of 20, 305, 320, 330, 400, 405).
- Amounts: `amount_before_vat`, `vat_amount`, `amount_total*` (>= 0), `currency='ILS'`.
- Payment: `is_paid=false`, `paid_at`, `payment_method`.
- Green Invoice: `green_invoice_expense_id`, `green_invoice_status int`.
- Other: `notes`, `created_by`, timestamps.
- Unique `(supplier_id, document_number)` when both are set.
- `expenses_view` adds `supplier_name, supplier_tax_id`.
- Categories: `stone_purchase, transport, fuel, vehicle, maintenance, rent, salaries, office, tools, professional_services, taxes_fees, marketing, other`.

**order_charges**: `id, order_id (cascade), kind order_charge_kind (shipping|processing|service|discount|other), description*, amount numeric(12,2), sort_order int, timestamps`.
- Amounts are **before VAT**.
- A `discount` must be <= 0, every other kind must be >= 0.

**activity_log** (read only; written by triggers): `id bigserial, at, user_id, user_email, user_role, action ('insert'|'update'|'delete'), table_name, row_id uuid, changes jsonb`.
- On update, `changes` holds only the changed columns as `{col:{old,new}}`.
- On insert and delete, `changes` holds the whole row.
- `updated_at` is never logged.
- An update that changes nothing is not logged.
- Logged tables: stones, customers, customer_stone_prices, suppliers, inventory_items, orders, order_items, order_charges, deliveries, quotes, quote_items, documents, payments, payment_allocations, expenses.

**dashboard_kpis_view**:
- `open_orders_count`, `unpaid_deliveries_count`.
- `receivables_total`: the sum of balances.
- `monthly_revenue`: by `document_date`, excluding cancelled orders.
- Appended at the end: `monthly_payments_total`, `monthly_expenses_total`, `pending_documents_count`.

**debtors_view** appends `amount_paid` and `balance`. Partly paid deliveries stay in the view (status `unpaid`). Cancelled deliveries are excluded.

All views are `security_invoker`, granted SELECT to authenticated, and closed to anon.

---

## 3. RPCs (call with named params through `supabase.rpc(name, {...})`)

```ts
rpc("crm_record_payment", {
  p_customer_id: uuid,            // required
  p_amount: number,               // > 0, rounded to 2
  p_paid_at?: "YYYY-MM-DD" | null,// default today (Israel)
  p_method?: PaymentMethodDb,     // default 'other'
  p_reference?: string | null,
  p_bank_name?: string | null,
  p_notes?: string | null,
  p_document_id?: uuid | null,    // links the document (documents.payment_id) and marks a pending_review document as processed
  p_allocations?: { delivery_id: uuid; amount: number }[], // default []; may be partial; the rest stays unallocated
}) → uuid (payment id)
```
- The call is atomic.
- It locks each delivery and raises on:
  - `payment over-allocated`: the allocations add up to more than the payment.
  - `delivery over-allocated`: an allocation is bigger than the delivery's remaining balance.
  - `allocation customer mismatch`: the delivery belongs to another customer.
  - `cannot allocate to cancelled delivery`.
  - `invalid allocations payload`, `invalid payment amount`.
- `toHebrewError` maps all of these to Hebrew.

```ts
rpc("crm_mark_delivery_paid", { p_delivery_id, p_method?, p_paid_at?, p_reference? }) → uuid | null
```
- Creates one payment for the remaining balance and allocates it to the delivery.
- Returns null when the delivery is already fully paid.
- The method defaults to the delivery's `payment_method`, then to `other`.
- Server action: `markDeliveryPaid(id, { method?, paid_at?, reference? })` in `app/dashboard/deliveries/actions.ts`.

`rpc("crm_recalc_order_totals", { p_order_id })` recalculates an order's totals. You rarely need it, because the triggers already do this.

Other RPCs are unchanged: `crm_create_order_with_items`, `crm_create_order_from_quote` (charges are inserted after the order is created), `crm_create_delivery_from_order`, and the quote RPCs.

### Triggers and behavior
- **Payment status on deliveries** (`deliveries_derive_payment`, BEFORE INSERT/UPDATE):
  - `amount_paid` = the sum of allocations + `paid_outside_payments`.
  - `payment_status` = `paid` when `amount_paid >= total − 0.005`.
  - `paid_at` = the date of the last allocated payment.
  - **Never compute these in TS.**
  - A direct `UPDATE deliveries SET payment_status='paid'` (the old edit form) still works. It sets `paid_outside_payments` to the remaining balance, so no payment row is created.
  - Setting `unpaid` resets `paid_outside_payments` to 0. It raises `delivery is covered by payments` when allocations already cover the delivery.
  - Prefer the payment RPCs.
- Changes to allocations, deleting a payment (allocations cascade) and changing `payments.paid_at` all recompute the deliveries.
- Lowering `payments.amount` below the allocated amount, or changing `customer_id`, is rejected.
- **order_charges**: any insert, update or delete recalculates `orders.subtotal/vat_amount/total` as items + charges, with VAT at `orders.vat_rate`. Every change raises `order has delivery` once the order has a delivery, because totals are frozen in the delivery.
  - Delivery items do **not** include charges. A delivery document must list `order_charges` (by `order_id`) so that the lines add up to the total.
- Legacy backfill: deliveries that were paid before the patch have `paid_outside_payments = total`.

---

## 4. Storage: private bucket `documents`
- Limits: 20MB; jpeg, png, webp, heic, heif or pdf.
- Policies: select, insert and update for CRM users; delete for admin only.
- **Path:** `{kind}/{yyyy}/{mm}/{uuid}-{safeFileName}`, for example `supplier_invoice/2026/11/3f9d…-invoice.pdf`. `safeFileName` = keep only letters, digits, `.`, `-` and `_`, replace anything else with `-`, and cap it at about 80 characters. Hebrew is allowed, but ASCII is safer.
- **Upload from the browser** with `createClient()` from `lib/supabase/client.ts`, because Server Actions have about a 1MB body limit:
  ```ts
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  ```
  Then call a server action with `{ storage_path: path, file_name, mime_type, file_size, kind, ... }`, which inserts into `documents`.
  - If the insert fails, try `remove([path])` for cleanup. It only works for an admin, so an agent leaves an orphan file, which is acceptable.
- **View or download:** `supabase.storage.from("documents").createSignedUrl(path, 600)`, from the server or the client. Pass `{ download: fileName }` to force a download.
- A document can have `storage_path = null` (Green Invoice documents only have `green_invoice_url`). Handle both cases.

---

## 5. Labels: `lib/db/labels.ts`
- Status and method labels: `paymentMethodLabels`, `paymentStatusLabels`, `paymentStatusDisplay(row)` (returns "שולם חלקית" when `amount_paid > 0`), `deliveryStatusLabels`.
- Role: `crmRoleLabels`.
- Documents: `documentKindLabels`, `documentKindGroups`, `customerDocumentKinds`, `supplierDocumentKinds`, `documentStatusLabels` (ממתין לבדיקה/טופל/נדחה), `documentSourceLabels`.
- Expenses and charges: `expenseCategoryLabels`, `expenseDocumentTypeLabels`, `orderChargeKindLabels`.
- Activity log: `activityActionLabels`, `activityTableLabels`.
- `{value,label}[]` lists for Select: `paymentMethodOptions`, `documentKindOptions`, `documentStatusOptions`, `expenseCategoryOptions`, `orderChargeKindOptions`, `expenseDocumentTypeOptions`.
- Do not add local label maps. Import from here.

## 6. Errors
`toHebrewError(error)` in `lib/db/errors.ts` already maps the following. Use it for every DB, RPC or storage error.
- Role errors: `admin only`, `last admin`.
- Payment errors: over-allocation, cross-customer allocation, cancelled delivery, `delivery is covered by payments`.
- Order charges: `order has delivery`, the discount sign check.
- Duplicates and unique keys: duplicate document, supplier tax id, expense number per supplier, stone SKU.
- Storage errors: too large, mime type, duplicate file.

## 7. Navigation: `lib/dashboard-nav.ts`
The sidebar renders these automatically. The header CTA appears on the index route.

| url | title | icon | CTA → |
|---|---|---|---|
| /dashboard/payments | תשלומים | Wallet | רישום תשלום → /dashboard/payments/new |
| /dashboard/documents | מסמכים | FolderOpen | העלאת מסמך → /dashboard/documents/new |
| /dashboard/suppliers | ספקים | Factory | ספק חדש → /dashboard/suppliers/new |
| /dashboard/expenses | הוצאות | Receipt | הוצאה חדשה → /dashboard/expenses/new |
| /dashboard/activity | יומן פעולות | History | — |
| /dashboard/settings | הגדרות | Settings | — |

Each `/new` route has its own hidden entry. If you add other routes such as `/[id]` or `/[id]/edit`, the longest matching prefix wins.

---

## 8. Local demo

Scratchpad: `SP=/tmp/claude-0/-home-user-argaman/a85be6da-e0a0-5f28-b62f-c71c689b6090/scratchpad`

1. **Postgres 16** (start it if it is down):
   ```bash
   pg_ctlcluster 16 main start
   ```
   Credentials: `postgres/demo` at 127.0.0.1.
2. **Rebuild the demo DB** (all patches + `seed.sql` + this patch + `seed-stage12.sql`):
   ```bash
   $SP/rebuild.sh argaman_demo
   ```
3. **Tests:**
   ```bash
   $SP/run-tests.sh
   ```
   This builds `argaman_test`, runs the patch twice and runs `test-stage12.sql`, printing PASS/FAIL for each case.
4. **Mock Supabase** on :54321 (`$SP/env/server.js`; it covers auth, a PostgREST subset, RPC and Storage):
   ```bash
   pkill -f "node server.js"; cd $SP/env && nohup node server.js > ../mock.log 2>&1 &
   ```
   - Log in with **any password**. `office@argaman.example` is the admin; `bot@argaman.example` is the agent (use it to check what an agent can and cannot do).
   - Storage: upload, `createSignedUrl(s)`, download through a signed URL or `download()`, and `remove` (admin only). Files go to `$SP/env/storage/`.
   - The PostgREST stand-in supports simple filters only: `eq, neq, gt, gte, lt, lte, like, ilike, is, in`, `order`, `limit`, `offset`, and embedding a single FK as `rel(cols)`, which resolves as `<rel minus s>_id`. It has no `or=`, no nested embeds and no `count` with filters beyond the basics. Keep queries simple, or use the views.
5. **Run the app:**
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=demo-anon npx next build
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=demo-anon npx next start -p 3123
   ```
   Use a different port for each agent if you run them in parallel.

---

## 9. Rules for the UI agents
- **Match the existing look.**
  - Reuse `components/ui/*` (shadcn): Button, Input, Select, Badge, Sheet, Dialog, Tabs, Table and the rest.
  - Forms use `FormPageShell` + `FormStickyFooter` from `components/form-sticky-footer.tsx`.
  - Lists use `CrmDataTable` from `components/crm/data-table.tsx`, with a `columns.tsx` like `app/dashboard/deliveries/columns.tsx`.
  - KPIs use `KpiCard`.
  - Destructive actions go through `ConfirmDialog` with an **async `onConfirm`**.
- **Server actions** (`app/dashboard/<section>/actions.ts`, `"use server"`):
  - Use `requireAuth()`, or `requireAdmin()` for deletes.
  - Validate with zod from `@/lib/zod-he` (Hebrew messages).
  - Use `optionalDateSchema` from `lib/db/validation.ts`.
  - Return `{ ok: true, id? } | { ok: false, message }`, with `toHebrewError` for DB errors.
  - Call `revalidatePath` for the affected sections: the dashboard, debtors, customers and so on.
- **On the client:** `const res = await action(...).catch(actionCrashed)` (from `lib/action-client.ts`), then `toast.success/ toast.error(res.message)` from `sonner`.
- **Inputs:**
  - Each form wraps its inputs in a local `Field` component, which puts the input inside a `<label>` (so the AI agent can find inputs by their label). Copy the pattern from `app/dashboard/customers/new/page.tsx`.
  - Number inputs use `type="text" inputMode="decimal"` with `normalizeDecimalInput` (from `lib/db/calculations.ts`).
- **Formatting:** dates with `formatDateShort`, money with `formatIls` (from `lib/db/format.ts`).
- **Hebrew everywhere:** RTL, every label, empty state, toast and error in Hebrew. No English in the UI except brand names such as Green Invoice.
- Hide delete buttons from agents (`getCurrentCrmUser()`). The server checks again in any case.
- Show money as `balance` and `amount_paid` rather than `total` wherever "what is left to pay" matters. Use `paymentStatusDisplay(row)` to show "partly paid".
- Known follow-ups for the owners of these screens:
  - `components/debtors/debtor-print-dialog.tsx` and `debtor-summary-document-sheet.tsx` still add up `total`.
  - The delivery edit form still lets the user flip `payment_status` directly. Replace it with "record payment" / `markDeliveryPaid`.
  - The delivery and order documents should list `order_charges`.
