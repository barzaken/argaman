# Argaman CRM — Operating Manual for Browser-Driving AI Agents

> Audience: AI agents that operate the Argaman CRM through a real browser (see the rendered page/DOM, click, type, select, navigate).
> The UI is **Hebrew, right-to-left (RTL)**. Every label, button, menu item and status in this guide is quoted **exactly** as it appears on screen. Match on those strings, not on English paraphrases.
>
> Source of truth: the code under `app/`, `components/`, `lib/`, `sql/`. Where code is ambiguous or still changing, this guide says so. If the screen disagrees with this guide, **trust the screen** and report the difference.

---

## Table of contents

1. [Purpose and mental model](#1-purpose-and-mental-model)
2. [Login, session, navigation, URL map](#2-login-session-navigation-url-map)
3. [Task recipes (step by step)](#3-task-recipes-step-by-step)
4. [Field-by-field validation rules](#4-field-by-field-validation-rules)
5. [Side effects, irreversible actions, confirm-with-human list](#5-side-effects-irreversible-actions-confirm-with-human-list)
6. [Limitations](#6-limitations)
7. [Browser-use practical tips](#7-browser-use-practical-tips)
8. [Error messages and what to do](#8-error-messages-and-what-to-do)
9. [Troubleshooting table](#9-troubleshooting-table)
10. [Quick-reference cheat sheet](#10-quick-reference-cheat-sheet)

---

## 1. Purpose and mental model

**Argaman ("ארגמן")** sells stone and marble to contractors. The CRM is an internal tool for a small team: catalog, stock, quotes, orders, production tracking, delivery notes and collections.

### 1.1 The pipeline

```
קטלוג אבן (stones)
   └─► מלאי (inventory shipments/batches of a stone, with dimensions, quantity, prices)
          │
הצעות מחיר (quotes) ──convert──►  תעודות הזמנה (orders) ──► פריטי הזמנה (order items: production tracking)
                                         │
                                         └─► תעודת משלוח (delivery note, max ONE per order)
                                                   │
                                                   └─► רשימת חייבים (debtors = unpaid delivery notes)
לקוחות (customers) own quotes, orders, deliveries, and optional per-stone special prices.
```

| Entity (Hebrew UI name) | What it is | Key relationships |
|---|---|---|
| **אבן** in **קטלוג אבן** | A stone type: name + color. Can be archived (hidden), never deleted from UI. | Has many inventory shipments; referenced by order/quote lines. |
| **פריט מלאי / משלוח במלאי** in **מלאי** | A shipment/batch of one stone: dimensions (L×W×H), number of pieces, cost price, customer price, finish, piece type, status. | Belongs to one stone. Order lines reserve pieces from it. |
| **לקוח** in **לקוחות** | Contractor/customer: name, tax id (ח.פ / ת״ז, unique), email, phone, address. | Has orders, deliveries, quotes, special prices. |
| **מחיר מיוחד / מחירי קטלוג ללקוח** | A per-customer price per m³ (קו״ב) for a stone. | Pre-fills prices on new orders (and on quote lines priced per m³). |
| **הצעת מחיר** in **הצעות מחיר** | A quote with lines priced per m³, m² or unit. Does **not** reserve stock. | Can be converted once into an order. |
| **תעודת הזמנה** in **תעודות הזמנה** | An order. Each line takes pieces from a specific inventory shipment (reserves them). | Has order items; at most one delivery note. |
| **פריט הזמנה** in **פריטי הזמנה** | One order line, with its own production status. | Belongs to an order and an inventory shipment. |
| **תעודת משלוח** in **תעודות משלוח** | Delivery note created from an order (snapshot of lines and totals). Holds payment and shipping info. | Exactly one order. |
| **רשימת חייבים** | Not a table — a view of all delivery notes with payment status **"לא שולם"**, grouped by customer. | — |

### 1.2 Numbering

- Orders, delivery notes and quotes each have their **own** running number starting at **1000** (`order_number_seq`, `delivery_number_seq`, `quote_number_seq`). They are shown with a `#` prefix, e.g. `הזמנה #1003`, `תעודת משלוח #1001`, `הצעה #1012`.
- A delivery note's number is **not** the same as its order's number. The delivery note page shows both: `תעודת משלוח #1001` / `הזמנה #1003 · <customer>`.
- Numbers are never reused; deleting an order leaves a gap.
- Internally every record has a UUID; URLs use the UUID (e.g. `/dashboard/orders/3f2a…`), **not** the visible number. To open order #1003 you must find it in a list; you cannot type `/dashboard/orders/1003`.

### 1.3 Statuses and transitions

#### Order status (תעודת הזמנה) — shown in lists and on the order page

| DB value | Hebrew label | How it is set |
|---|---|---|
| `open` | **פתוחה** | Default on creation. |
| `in_production` | **בייצור** | Manually, in the order edit form. |
| `ready_for_delivery` | **מוכנה למשלוח** | Automatically when a delivery note is created (unless the order is already "הושלמה"), or manually. |
| `completed` | **הושלמה** | Automatically when the delivery note is set to **"נמסר"**, or manually. |
| `cancelled` | **בוטלה** | Manually. **Releases reserved inventory.** Blocked if the order already has a delivery note. |

Allowed transitions: the edit form lets you pick **any** status from any status. Enforced rules (database trigger):
- → **בוטלה** when a delivery note exists: rejected with "לא ניתן לבטל הזמנה שכבר הופקה לה תעודת משלוח."
- → **בוטלה** (no delivery): reserved quantities are returned to stock.
- **בוטלה** → any other status: the pieces are re-reserved; fails with "אין מספיק כמות זמינה במלאי עבור אחד הפריטים." if they were taken by someone else meanwhile.
- A delivery note cannot be created for a cancelled order.

#### Order item status (פריט הזמנה)

| DB value | Hebrew | Notes |
|---|---|---|
| `pending` | **ממתין** | Default. |
| `in_progress` | **בייצור** | Set from **פריטי הזמנה** page. |
| `completed` | **הושלם** | Set manually, or automatically for **all** items of an order when its delivery note is created. Completed items disappear from the default **פריטי הזמנה** view and the dashboard to-do list. |
| `cancelled` | **בוטל** | Exists in DB; **not selectable** in the UI. |

Item status is independent of order status (changing items does not change the order, and vice versa — except delivery creation, which completes all items).

#### Delivery note status (סטטוס משלוח)

| DB value | Hebrew | Notes |
|---|---|---|
| `waiting_for_pickup` | **ממתין לאיסוף** | Default on creation. |
| `in_transit` | **בדרך** | Manual. |
| `delivered` | **נמסר** | Manual. Saving with this status sets the **order** to **הושלמה**, and fills **תאריך מסירה** with today's date (Israel time) if left empty. |
| `cancelled` | **בוטל** | Manual. **No inventory or payment side effect** (the note stays in debtors if unpaid). |

#### Payment status (סטטוס תשלום)

| DB value | Hebrew |
|---|---|
| `unpaid` | **לא שולם** (default; listed in **רשימת חייבים**) |
| `paid` | **שולם** |

Payment methods (אמצעי תשלום): **ללא** (none), **מזומן**, **העברה בנקאית**, **צ׳ק**, **כרטיס אשראי**, **אחר**.
Fulfillment (איסוף / שילוח): **איסוף** (pickup, default) or **שילוח** (shipping — requires an address).

#### Quote status (הצעת מחיר)

| DB value | Hebrew | Notes |
|---|---|---|
| `open` | **פתוחה** | Default. Only open quotes can be edited, converted or deleted. |
| `converted` | **הומרה להזמנה** | Set when converted. Cannot edit/delete/convert again. Returns to **פתוחה** if the resulting order is deleted. |
| `cancelled` | **בוטלה** | Exists in DB; **no UI sets it**. |

#### Inventory status (סטטוס מלאי)

| DB value | Hebrew | Notes |
|---|---|---|
| `available` | **זמין** | Only these rows (with available quantity > 0) can be ordered from. |
| `unavailable` | **לא זמין** | Also what "deleting" a shipment that is used by orders does. |
| `in_transit` | **בדרך** | Requires **תאריך צפי הגעה** (expected arrival date). **Cannot be ordered from** until changed to **זמין**. |

Priority (תעדוף): `low` **נמוך**, `medium` **בינוני** (default), `urgent` **דחוף**.

Finish level (רמת גימור): **חלק**, **טובזה**, **מסמסם**.
Piece type (חלק): **פאנל**, **מסגרת**, **פלטה**, **אבן עומדת**.

### 1.4 Units and pricing

- **All dimensions in the UI are entered and displayed in centimetres (ס״מ).** The database stores metres with 3 decimals, so precision is 1 mm (0.1 cm). Displayed dimensions read `length×width×height` (e.g. `240×135×2`).
- **קו״ב** = cubic metre (m³). **מ״ר** = square metre (m²). **יחידה / יח׳** = unit/piece.
- Volume = L × W × H × quantity (in metres) → m³. Area = L × W × quantity → m².
- Inventory has two pricing modes (tabs **"לפי קוב"** / **"לפי מ״ר"**):
  - m³: you enter **מחיר לקו״ב (₪)** and **מחיר ללקוח (₪)** (both per m³).
  - m²: you enter **מחיר למ״ר (₪)** and **מחיר ללקוח למ״ר (₪)**; the system also stores derived per-m³ prices (price ÷ thickness in m).
- **Orders are always priced per m³** (**מחיר לקו״ב**). An order line's subtotal = volume (m³) × price per m³ (net, before VAT).
- Quotes support three units per line (tabs **"לפי קו״ב"**, **"לפי מ״ר"**, **"לפי יחידה"**). When a quote is converted to an order, each line's price is converted to per-m³: m² price ÷ thickness; unit price ÷ (L×W×H of one piece). Small rounding differences between quote total and order total are expected (prices are stored with 2 decimals).
- Customer special prices are always **per m³**.

### 1.5 VAT (מע״מ)

- VAT rate is fixed at **18%** in the UI.
- Totals are always: **סכום לפני מע״מ** (subtotal, net) + **מע״מ (18%)** = **סה״כ כולל מע״מ** (total).
- The checkbox on the order form, **"מחיר לקו״ב כולל מע״מ (יומר לנטו לפני שמירה)"**, and on the quote form, **"מחיר בפריטים כולל מע״מ (יומר לנטו לפני שמירה)"**, mean: *the prices I am typing already include VAT; divide them by 1.18 before saving*. It does **not** mean "no VAT" or "VAT exempt". The total always includes 18% VAT on top of the net subtotal.
  - Example: price 1180 with the box checked → stored net price 1000 per m³ → for 1 m³: subtotal 1000, VAT 180, total 1180.
  - Example: price 1180 with the box unchecked → net 1180 → subtotal 1180, VAT 212.40, total 1392.40.
- In lists, the **סכום** column shows the total with VAT and a sub-label **"כולל מע״מ בפריטים"** (box was checked) or **"לפני מע״מ"** (box unchecked — i.e. prices were entered net). These sub-labels describe how prices were entered, not whether the total includes VAT.
- Ask the human whether quoted prices include VAT if it is not explicit. Getting this wrong changes the total by 18%.

---

## 2. Login, session, navigation, URL map

### 2.1 Login

1. Go to `/login` (or any `/dashboard/...` URL — unauthenticated visits redirect to `/login?next=<original path>`).
2. Page heading: **"כניסה לארגמן CRM"**, sub-text **"התחברו עם האימייל והסיסמה שלכם."**
3. Fill the email field (placeholder `your.email@example.com`, LTR) and the password field (placeholder `••••••••`).
4. Click **"התחברות"**. While pending it reads **"מתחברים…"** and is disabled.
5. On success you are redirected to the `next` path (only paths starting with `/dashboard` are honoured) or `/dashboard`.
6. On failure a red message appears under the fields, e.g. **"אימייל או סיסמה שגויים."**

Notes:
- There is **no sign-up** and **no password reset** in the UI. Never try to create accounts.
- Visiting `/login` while logged in redirects to `/dashboard`. `/` redirects to `/dashboard` or `/login`.
- Never type credentials you were not given by the human. Never store or echo them.
- **Logout:** in the sidebar footer click the round avatar (initials) → menu → **"יציאה"**. (The **"פרופיל"** and **"הגדרות"** items in that menu do nothing.)

### 2.2 Session expiry

If the session expires mid-work, server actions return **"פג תוקף ההתחברות — התחברו מחדש."** or a generic **"אירעה שגיאה. נסו שוב."**, and navigating to any dashboard page redirects to `/login?next=...`. Log in again; the `next` parameter brings you back. **Re-check whether your last action was saved before repeating it** (see §7.8).

An account that can log in but is not on the CRM allow-list (`crm_users`, if that SQL patch is applied) will see **empty lists everywhere** and get **"אין לכם הרשאה לבצע פעולה זו."** on writes. Stop and tell the human.

### 2.3 Layout

- **Sidebar on the right side** (RTL). Header at the top of the content area shows the section icon + title and, on section index pages, a primary CTA button on the **left** edge.
- On narrow screens the sidebar is hidden; open it with the sidebar toggle button in the header (top-right). The sidebar can also be collapsed to icons (toggle next to the "ארגמן" logo).

#### Sidebar main items (top to bottom)

| Label | URL |
|---|---|
| **דאשבורד** | `/dashboard` |
| **קטלוג אבן** | `/dashboard/stones` |
| **מלאי** | `/dashboard/inventory` |
| **תעודות הזמנה** | `/dashboard/orders` |
| **הצעות מחיר** | `/dashboard/quotes` |
| **פריטי הזמנה** | `/dashboard/order-items` |
| **תעודות משלוח** | `/dashboard/deliveries` |
| **לקוחות** | `/dashboard/customers` |
| **רשימת חייבים** | `/dashboard/debtors` |

Below them, three collapsible groups (click the label to expand):
- **במלאי** — up to 12 newest shipments with available quantity > 0 (status זמין or בדרך), titled like `גרניט שחור · חלק · פאנל (5 זמין)`. Clicking opens that shipment's edit page.
- **לא במלאי** — up to 12 newest shipments with 0 available.
- **תעודות משלוח** — 8 newest delivery notes, titled `ת.משלוח #1001 — <customer>`.

Sidebar footer: avatar menu (**"יציאה"**) and a **"+"** button (aria-label **"הוספה מהירה"**) opening menu **"הוסף חדש"** with **"הוסף למלאי"** and **"תעודת הזמנה"**.

#### Command palette

- Open with **Ctrl+K** (⌘K on Mac) or click **"חפש"** at the top of the sidebar.
- Input placeholder **"חיפוש..."**; groups **"ניווט"** (the 9 sections), **"במלאי"**, **"לא במלאי"**, **"תעודות משלוח"** (same preview items as the sidebar).
- It only filters these pre-loaded items. **It is not a global search** of customers/orders.

#### Header CTA (shown only on the exact section index URL)

| Page | CTA button | Goes to |
|---|---|---|
| `/dashboard` | **הוסף הזמנה** | `/dashboard/orders/new` |
| `/dashboard/stones` | **אבן חדשה** | `/dashboard/stones/new` |
| `/dashboard/inventory` | **הוסף למלאי** | `/dashboard/inventory/new` |
| `/dashboard/orders` | **תעודת הזמנה** | `/dashboard/orders/new` |
| `/dashboard/quotes` | **הצעת מחיר חדשה** | `/dashboard/quotes/new` |
| `/dashboard/customers` | **הוסף לקוח** | `/dashboard/customers/new` |

No CTA on **פריטי הזמנה**, **תעודות משלוח**, **רשימת חייבים**.

### 2.4 URL map

| URL | Header title | What it shows / does |
|---|---|---|
| `/login` | — | Login form. |
| `/dashboard` | דאשבורד | KPI cards **"הזמנות פתוחות"**, **"תעודות שלא שולמו"**, **"יתרה לגבייה"**, **"הכנסות החודש"** (sum of totals of orders created this calendar month, Israel time). Left/main: **"קטלוג אבנים"** grid of active stones (badge **"במלאי"** if any stock); click → stone edit. Side: **"פריטי הזמנה לביצוע"** — up to 40 non-completed order items grouped by customer (collapsed; click a customer to expand; click an item → order page). |
| `/dashboard/stones` | קטלוג אבן | Grid of active stones (color swatch, name, badge **"במלאי"**). Click card → edit. |
| `/dashboard/stones/new` | אבן חדשה | Form: color + **"שם האבן"**. |
| `/dashboard/stones/[id]/edit` | קטלוג אבן | Edit form (**"עריכת אבן"**), tabs **"הזמנות"** / **"מלאי"** listing related orders and shipments, **"ארכיון"** button. |
| `/dashboard/inventory` | מלאי | KPIs **"פריטים במלאי"**, **"זמינים במלאי"**, **"לא במלאי"**, **"במשלוח (בדרך)"**; data table of **all** shipments with row selection and **"צור הזמנה (N)"**; per-row **"מחיקה"**. Row click → edit. |
| `/dashboard/inventory/new` | הוסף למלאי | New shipment form. |
| `/dashboard/inventory/[id]/edit` | מלאי | Edit shipment; shows **"בהזמנה : N · סופק: M"** and a **"הזמנות"** panel of orders using this shipment. |
| `/dashboard/orders` | תעודות הזמנה | KPIs **"הזמנות פתוחות"**, **"בייצור עכשיו"**, **"מוכן למשלוח"**, **"סך הזמנות החודש"**; table of latest **400** orders; per-row **"צור תעודת משלוח"** and **"מחיקה"**. Row click → order page. |
| `/dashboard/orders/new` | תעודת הזמנה חדשה | New order form. Accepts `?inventory=<id>,<id>` to pre-fill lines. |
| `/dashboard/orders/[id]` | תעודות הזמנה | Order document: header (**"הזמנה #N"**, customer, **"תאריך יצירת הזמנה"**, **"סטטוס: … · תעדוף: …"**, **"סכום כולל מע״מ"**), buttons **"הדפסה"**, **"הורדת PDF"**, **"עריכה"**, **"חזרה"**, and the printable sheet **"תעודת הזמנה"**. |
| `/dashboard/orders/[id]/edit` | תעודות הזמנה | Header-only edit (**"עריכת הזמנה #N"**): תעדוף, סטטוס, יעד אספקה, קישור חתימה. Lines cannot be edited. |
| `/dashboard/quotes` | הצעות מחיר | KPIs **"הצעות פתוחות"**, **"הומרו להזמנה"**, **"סך הצעות החודש"**, **"סכום הצעות פתוחות"**; table of latest **400** quotes; per-row **"צור הזמנה"**, link **"הזמנה #N"** (if converted), **"מחיקה"**. |
| `/dashboard/quotes/new` | הצעת מחיר חדשה | New quote form. |
| `/dashboard/quotes/[id]` | הצעות מחיר | Quote document (**"הצעה #N"**) with **"הדפסה"**, **"הורדת PDF"**, **"צור הזמנה"** (if open & not converted), **"עריכה"** (if open), **"חזרה"**. |
| `/dashboard/quotes/[id]/edit` | הצעות מחיר | Edit quote (redirects to the quote page if not open). |
| `/dashboard/quotes/[id]/convert` | הצעות מחיר | **"צור הזמנה מהצעה #N"** — map each quote line to an inventory source. Redirects to the quote page if not convertible. |
| `/dashboard/order-items` | פריטי הזמנה | Open (non-completed) order items, grouped customer → order → item, with a status dropdown per item. Button **"הצג הכל"** → `?view=all` (all items, max 800); **"הצג פתוחים"** returns. |
| `/dashboard/deliveries` | תעודות משלוח | KPIs **"משלוחים השבוע"**, **"בדרך כעת"**, **"נמסרו החודש"**, **"ממתינים לאיסוף"**; table of latest **400** delivery notes; per-row **"עריכה"**. Row click → delivery page. |
| `/dashboard/deliveries/[id]` | תעודות משלוח | Delivery document (**"תעודת משלוח #N"**), **"הדפסה"**, **"הורדת PDF"**, **"עריכה"**, **"חזרה"**. |
| `/dashboard/deliveries/[id]/edit` | תעודות משלוח | **"עריכת משלוח #N"**: payment, fulfillment, address, dates, Green Invoice ID, statuses; **"סמן כשולם"**. |
| `/dashboard/customers` | לקוחות | KPIs **"לקוחות פעילים"**, **"עם חוב פתוח"**, **"סך הזמנות"**, **"סך יתרה פתוחה"**; table of active customers; per-row **"עריכה"**. Row click → customer page. |
| `/dashboard/customers/new` | לקוח חדש | New customer form. |
| `/dashboard/customers/[id]` | לקוחות | Customer page: link **"כל הלקוחות"**, KPIs, contact details, **"מחירי קטלוג ללקוח"** (special prices, add/remove), **"הזמנות אחרונות"** (up to 30), **"תעודות משלוח"** (up to 30, badge **"שולם"** / **"לא שולם"**), **"עריכה"**. |
| `/dashboard/customers/[id]/edit` | לקוחות | **"עריכת לקוח"** form. |
| `/dashboard/debtors` | רשימת חייבים | Unpaid delivery notes grouped by customer (expanded by default), each with total, **"N תעודות · יעד קרוב <date>"**, **"הדפסה"** per customer, and **"סמן כשולם"** per note. |

A non-existent or deleted record id shows a Next.js 404 page.

### 2.5 Data tables (lists)

Used on מלאי, תעודות הזמנה, הצעות מחיר, תעודות משלוח, לקוחות.
- **One text filter** above the table filters a single column (case-insensitive substring):
  - מלאי: **"סנן לפי שם האבן..."** (stone name)
  - תעודות הזמנה / הצעות מחיר / תעודות משלוח: **"סנן לפי לקוח..."** (customer name)
  - לקוחות: **"סנן לפי דוא״ל..."** — **filters by email only**, not by name.
- **"עמודות"** button (left) toggles column visibility.
- Empty result text: **"אין תוצאות."**
- **Row click opens the record** (and, per the in-progress change, Enter on a focused row). Buttons/links/checkboxes inside rows do not trigger navigation.
- **Sortable headers** (in-progress change): column headers are clickable to sort; verify the sort arrow/state on screen before relying on order. Default order is newest first (by creation time).

---

## 3. Task recipes (step by step)

General pattern for every form:
1. Navigate to the form URL (or use the header CTA).
2. Fill fields; for dropdowns click the trigger, then the option (see §7.2).
3. Click the submit button at the **bottom sticky bar** (usually **"שמירה"**). It becomes disabled and shows a pending label (**"שומר…"**, **"יוצר…"**, **"יוצר הזמנה…"**).
4. Wait for: a success toast (corner of the screen) and/or navigation to the target page, **or** an inline red error (role="alert") above the footer / a toast with an error.
5. **Verify** by reading the resulting page (§7.6). Don't double-submit.

Cancel buttons (**"ביטול"**) just navigate away without saving.

### 3.1 Stones (קטלוג אבן)

**Create a stone**
1. `/dashboard/stones` → **"אבן חדשה"** (or go to `/dashboard/stones/new`).
2. Section **"פרטי אבן"**: set **"צבע"** (native color picker, aria-label **"בחירת צבע"**; default `#57534e`). See §7.5 for setting colors.
3. Type **"שם האבן"** (placeholder **"לדוגמה: גרניט שחור"**). Required.
4. Click **"שמירה"** → toast (e.g. **"האבן נוספה לקטלוג"**) → redirected to `/dashboard/stones`. Verify the new card exists.

**Edit a stone**
1. `/dashboard/stones` → click the stone's card.
2. Change **"צבע"** and/or **"שם האבן"** in section **"עריכת אבן"**.
3. **"שמירה"** → back to the catalog. Renaming is reflected everywhere (lists join the live name), except in delivery notes, which store a snapshot of the stone name at delivery time.

**Archive a stone** (⚠ confirm with human)
1. Open the stone's edit page → click red **"ארכיון"** (bottom-right in RTL).
2. Dialog **"ארכיון אבן"** — **"להפסיק להציג את האבן בקטלוג?"** → click **"ארכיון"** (or **"ביטול"**).
3. Redirects to the catalog; the stone disappears from the catalog, the dashboard, and all stone dropdowns. Its inventory rows, orders and quotes remain.
4. **There is no un-archive in the UI.** A new stone with the same name can then be created (names must be unique only among active stones).

### 3.2 Customers (לקוחות)

**Create a customer**
1. `/dashboard/customers` → **"הוסף לקוח"**.
2. Fill **"שם"** (required), **"ח.פ / ת״ז"** (required, unique across all customers), **"דוא״ל"** (optional, must be a valid email), **"טלפון"** (optional, free text), **"כתובת"** (optional, multiline).
3. **"שמירה"** → toast (e.g. **"הלקוח נוסף"**) → `/dashboard/customers`.
4. Verify: type the email in **"סנן לפי דוא״ל..."** or scan the **"שם"** column.

**Edit a customer**
1. In the customers table click **"עריכה"** on the row, or open the customer and click **"עריכה"**.
2. Change fields → **"שמירה"** → returns to the customer page.

**Archive/delete a customer**: **not available in the UI.** Do not attempt workarounds; tell the human.

**Add / change a customer special price (מחיר מיוחד)**
1. Open the customer page (`/dashboard/customers/[id]`).
2. Scroll to **"מחירי קטלוג ללקוח"** → section **"הוספת מחיר"**.
3. **"מוצר בקטלוג"**: open the dropdown (**"בחר אבן"**) → click the stone name.
4. **"מחיר קו״ב ללקוח (₪)"**: type the per-m³ price, digits only (e.g. `4200`). Must be > 0.
5. Click **"שמירת מחיר"** (disabled until both fields are valid). Pending: **"שומר…"**.
6. The price appears in the list as `<stone> — <price> לקו״ב`. If the stone already had a special price for this customer, it is **replaced** (upsert), not duplicated.

Effect: on **new** orders for this customer, lines from this stone default to this price (overriding the shipment's customer price). On new quotes, only lines priced **"לפי קו״ב"** use it. Existing orders/quotes are not changed.

**Remove a special price** (⚠ no confirmation dialog)
- Click the trash icon (title **"הסרה"**, screen-reader text **"הסרת מחיר"**) on the price row. It is deleted immediately.

### 3.3 Inventory (מלאי)

**Add a shipment**
1. `/dashboard/inventory` → **"הוסף למלאי"** (or sidebar "+" → **"הוסף למלאי"**).
2. Section **"אבן מהקטלוג"**: **"בחר אבן מקטלוג האבן"** → open dropdown (**"בחר אבן מהרשימה"**) → click the stone. A swatch card with the stone name appears.
3. Section **"מידות וכמות"**: choose pricing tab **"לפי קוב"** (default) or **"לפי מ״ר"**.
4. **"רמת גימור"** (default **חלק**) and **"חלק"** (default **פאנל**) dropdowns.
5. Dimensions in cm (pre-filled defaults 240 / 135 / 2 — **overwrite them**):
   - m³ mode: **"גובה / עובי (ס״מ)"** (required), **"רוחב (ס״מ)"**, **"אורך (ס״מ)"**.
   - m² mode: **"עובי (ס״מ)"** (optional; defaults to 2 cm if empty), **"רוחב (ס״מ)"**, **"אורך (ס״מ)"**.
6. **"כמות במשלוח"**: whole number of pieces (default 1).
7. Read-only preview: **"נפח משוער (קו״ב)"** or **"שטח פנים (מ״ר)"** — use it to sanity-check dimensions.
8. **"מחירים"**:
   - m³: **"מחיר לקו״ב (₪)"** (cost, placeholder 4200) and **"מחיר ללקוח (₪)"** (default selling price per m³, placeholder 4899).
   - m²: **"מחיר למ״ר (₪)"** (placeholder 850) and **"מחיר ללקוח למ״ר (₪)"**.
9. Bottom bar **"סטטוס"**: **זמין** (default), **לא זמין**, **בדרך**.
   - If **בדרך**: a **"תאריך צפי הגעה"** date field appears and is **required**.
10. **"שמירה"** → toast (e.g. **"הפריט נוסף למלאי"**) → `/dashboard/inventory`. Verify the new row (filter by stone name) — check **"כמות במשלוח"**, **"זמין"**, **"סטטוס"**, dimensions.

**Edit a shipment**
1. Click its row in `/dashboard/inventory` (or a sidebar item).
2. The stone **cannot be changed** (shown read-only). Note **"בהזמנה : N · סופק: M"** (reserved / delivered).
3. Change any of: pricing tab, finish, piece, dimensions, quantity, prices, status, expected date. Switching the pricing tab converts the typed prices between per-m³ and per-m² using the thickness (in-progress change) — **re-read the price fields after switching**.
4. **"כמות במשלוח"** must be ≥ reserved + delivered, else: **"כמות כוללת לא יכולה להיות קטנה מהכמות המזומנת/סופקה (N)"**.
5. **"שמירה"** → toast (e.g. **"פריט המלאי עודכן"**) → `/dashboard/inventory`.
- Changing dimensions/prices of a shipment does **not** change existing order lines (they store their own dimensions and price).

**Mark in transit / arrived**
- In transit: edit → **"סטטוס"** = **בדרך** → set **"תאריך צפי הגעה"** → **"שמירה"**.
- Arrived: edit → **"סטטוס"** = **זמין** → **"שמירה"** (the expected date is cleared automatically).

**Delete a shipment** (⚠ confirm with human)
1. In `/dashboard/inventory`, click **"מחיקה"** on the row.
2. Dialog **"מחיקת פריט מלאי"** — **"למחוק או להפוך למלאי לא זמין?"** → **"מחיקה"**.
3. Result: if **any order line references this shipment**, it is **not deleted** but set to **לא זמין**; otherwise it is permanently deleted. Re-read the table to see which happened.

### 3.4 Orders (תעודות הזמנה)

**Create an order (manual)**
1. `/dashboard/orders` → **"תעודת הזמנה"** (or dashboard **"הוסף הזמנה"**, or sidebar "+" → **"תעודת הזמנה"**). Page heading **"תעודת הזמנה חדשה"**; hint: **"כל סוג אבן = פריט אחד. הוסיפו שורות מידות בתוך הפריט — המחיר מחושב יחד."**
2. **Choose the customer first**: **"לקוח"** → **"בחר לקוח"** → click name. (Changing the customer later **re-computes line prices** from the customer's special prices / shipment prices and overwrites prices you typed.)
3. **"תעדוף"**: **נמוך** / **בינוני** (default) / **דחוף**.
4. **"יעד אספקה"** (optional date) and **"קישור לחתימה"** (optional; must start with `http://` or `https://`, placeholder `https://…`).
5. Decide the VAT checkbox **"מחיר לקו״ב כולל מע״מ (יומר לנטו לפני שמירה)"** (§1.5). Default unchecked = prices are net.
6. Section **"פריטים"**. Each card is one stone (**"פריט N · <stone>"**, or **"פריט חדש"** before a stone is chosen):
   1. **"סוג אבן"** → **"בחר אבן"** → click stone. If exactly one available shipment exists, it is auto-selected and dimensions are filled.
   2. **"מחיר לקו״ב"** (shared by all rows of this stone) — auto-filled from the customer's special price or the shipment's customer price; edit if needed.
   3. For each row (columns: **מקור**, **גובה**, **רוחב**, **אורך**, **כמות**, **נפח**):
      - **Source** dropdown (placeholder **"משלוח / לא במלאי"**; enabled only after choosing the stone): pick a shipment, labelled like `זמין 5 גרניט שחור פאנל חלק, 240×135×2` (= available pieces, stone, piece, finish, L×W×H cm), **or** pick **"לא במלאי"** (see below).
      - Picking a shipment fills **גובה / רוחב / אורך** from it. You may edit dimensions (e.g. cut size); the reservation is by piece count.
      - **כמות**: whole number of pieces, must be ≤ the shipment's available quantity (summed across rows using the same shipment).
      - **נפח** shows the computed m³.
   4. **"+ שורה"** adds another row for the same stone (e.g. a second size or second shipment). **"×"** removes a row (only when the card has >1 row).
   5. **"הסרה"** (card header) removes the whole stone card.
   6. The card shows **"סה״כ פריט: <m³> קו״ב · <₪>"**.
7. **"פריט חדש"** (top-right of the section) adds a new empty card for another stone. Choosing a stone that already has a card merges the row into that card.
8. Check the totals box: **"סה״כ קוב"**, **"סכום לפני מע״מ"**, **"מע״מ (18%)"**, **"סה״כ כולל מע״מ"**.
9. Click **"יצירת הזמנה"** (pending **"יוצר…"**). On success: toast (e.g. **"ההזמנה נוצרה"**) and navigation to the new order page. Verify the order number, lines and total.

**"לא במלאי" lines (ordering stone that is not in stock)**
- In a row's source dropdown choose **"לא במלאי"**. Two extra dropdowns appear: finish (**"גימור"**: חלק/טובזה/מסמסם) and piece (**"חלק"**: פאנל/מסגרת/פלטה/אבן עומדת). Type **גובה / רוחב / אורך / כמות** manually.
- On save, the system **creates a new inventory shipment** for that stone (status **זמין**, quantity = line quantity, prices = the line price net of VAT, pricing per m³) and immediately reserves all of it for this order. This new row shows up in **מלאי** with **זמין 0**.
- Use this also when the stock exists but is **בדרך** (in-transit rows are not offered as sources) — but ask the human first, since it creates a separate shipment row instead of using the in-transit one.

**Create an order from selected inventory rows**
1. `/dashboard/inventory`. Tick the checkbox (aria-label **"בחר שורה"**) on each wanted row. Only rows with status **זמין** and available > 0 are selectable (others are greyed). Header checkbox **"בחר הכל"** selects all selectable rows.
2. A button **"צור הזמנה (N)"** appears next to the filter → click it.
3. The order form opens (`/dashboard/orders/new?inventory=…`) with one row per selected shipment (quantity 1, dimensions and price from the shipment).
4. Choose **"לקוח"** (prices are recalculated for that customer), adjust quantities/prices, then **"יצירת הזמנה"**.

**Edit order header / change status** (⚠ cancelling: confirm with human)
1. Open the order (`/dashboard/orders` → click row) → **"עריכה"**.
2. Form **"עריכת הזמנה #N"**: **"תעדוף"**, **"סטטוס"** (**פתוחה / בייצור / מוכנה למשלוח / הושלמה / בוטלה**), **"יעד אספקה"**, **"קישור חתימה"**.
3. **"שמירה"** → toast (e.g. **"ההזמנה עודכנה"**) → order page. Verify **"סטטוס: …"** on the order page.
- Setting **בוטלה** releases its reserved inventory. It fails if a delivery note exists.
- Lines, customer and VAT mode **cannot** be edited. To change them: (with human approval) delete the order and create a new one.

**Delete an order** (⚠ irreversible — confirm with human)
1. `/dashboard/orders` → **"מחיקה"** on the row.
2. Dialog **"מחיקת הזמנה"**:
   - without delivery note: **"למחוק את ההזמנה? משוחרר מלאי מזומן."**
   - with delivery note: **"למחוק את ההזמנה ואת תעודת המשלוח? כמויות יוחזרו מהנגרע במלאי."**
3. Click **"מחיקה"**. See §5 for effects.

**Print / export an order**: see §3.9.

### 3.5 Order items (פריטי הזמנה) — production tracking

1. Go to `/dashboard/order-items`. Text says **"מציג פריטי הזמנה פתוחים בלבד."** Use **"הצג הכל"** to include completed items.
2. Customers are collapsed: click a customer name (shows worst priority badge) → click **"הזמנה #N"** (priority badge, **"יעד <date>"**) → item rows show stone, **"מידות … · כמות … · נפח … קו״ב"**.
3. Open the status dropdown on the item → choose **ממתין**, **בייצור** or **הושלם**.
4. **The change is saved immediately** on selection (no save button); the page refreshes. In the default view a completed item disappears — that is the success signal. Use **"הצג הכל"** to verify.

### 3.6 Delivery notes (תעודות משלוח)

**Create a delivery note from an order** (⚠ confirm with human — no confirmation dialog in the UI)
1. `/dashboard/orders` → find the order row (filter **"סנן לפי לקוח..."**).
2. Click **"צור תעודת משלוח"** on that row. It is disabled (tooltip **"כבר קיימת תעודת משלוח"**) if one already exists. There is no such button on the order page itself.
3. The system creates the note and navigates to `/dashboard/deliveries/<id>`.
4. Defaults: **ממתין לאיסוף**, **לא שולם**, **איסוף**, no payment method. Totals = order totals.
5. Side effects: inventory moves from reserved to delivered; all order items become **הושלם**; the order becomes **מוכנה למשלוח** (unless already **הושלמה**).
6. Clicking again on an order that already has a note just returns the existing note (no duplicate).

**Edit a delivery note (payment, shipping, delivered)**
1. Open it (`/dashboard/deliveries` → row, or row **"עריכה"**, or delivery page **"עריכה"**). Heading **"עריכת משלוח #N"**.
2. Fields:
   - **"אמצעי תשלום"**: **ללא** / **מזומן** / **העברה בנקאית** / **צ׳ק** / **כרטיס אשראי** / **אחר**.
   - **"יעד תשלום"**: date (payment due).
   - **"איסוף / שילוח"**: **איסוף** / **שילוח**.
   - **"כתובת משלוח"**: appears only for **שילוח**; **required** (non-blank). Switching back to **איסוף** clears it on save.
   - **"תאריך מסירה"**: date; auto-filled with today on save if status is **נמסר** and empty.
   - **"Green Invoice ID"**: free text reference only (no integration).
   - **"סטטוס תשלום"**: **לא שולם** / **שולם**.
   - **"סטטוס משלוח"**: **ממתין לאיסוף** / **בדרך** / **נמסר** / **בוטל**.
3. Click **"שמירה"** → toast (e.g. **"תעודת המשלוח עודכנה"**) → delivery page. Verify the line **"משלוח: … · תשלום: … · <method>"**.
- Saving **נמסר** also sets the order to **הושלמה**. If the note saved but the order update failed you get: **"התעודה נשמרה, אך עדכון סטטוס ההזמנה נכשל: …"** — report it; the note itself is saved.

**Mark paid** (⚠ confirm with human)
- Option A (preferred inside the edit form): set **"סטטוס תשלום"** = **שולם** and click **"שמירה"**.
- Option B: in the edit form bottom bar click **"סמן כשולם"** — saves immediately, no dialog.
  - ⚠ Pitfall: the form's **"סטטוס תשלום"** dropdown may still display **לא שולם** afterwards. If you then click **"שמירה"** without changing it, you will set the note back to unpaid. After using **"סמן כשולם"**, either leave via **"ביטול"** or set the dropdown to **שולם** before saving. Verify on the delivery page.
- Option C: `/dashboard/debtors` → **"סמן כשולם"** next to the note (immediate, no dialog). The note disappears from the debtors list.

**Delete a delivery note**: no direct action. The only way is deleting its order (§3.4), which also deletes the order. Ask the human.

### 3.7 Debtors (רשימת חייבים)

1. `/dashboard/debtors`. Each customer card shows name, phone/email, total owed, **"N תעודות · יעד קרוב <date>"**. Cards are expanded; click the header to collapse.
2. Each note row: link **"משלוח #N · הזמנה #M"**, **"יעד תשלום: <date|—>"**, amount, **"סמן כשולם"**.
3. Empty state: **"אין חובות פתוחים לפי תעודות משלוח."**

**Print / PDF a debt summary for a customer**
1. Click **"הדפסה"** on the customer card. Dialog **"סיכום חוב"** opens: description *"בחרו אילו תעודות משלוח לכלול במסמך הסיכום עבור <customer>. לכל תעודה שנבחרה יצורף גם עמוד תעודת משלוח מלאה."*
2. All notes are pre-selected. Use **"בחר הכל"** and per-note checkboxes to adjust. Footer shows **"N נבחרו · סה״כ לתשלום"** and the sum.
3. Click **"הורדת PDF"** (file name `סיכום-חוב-<customer>.pdf`) — **preferred for agents** — or **"הדפסה"** (opens the browser's native print dialog; see §7.9). **"ביטול"** closes.
4. Pending labels: **"מוריד…"** / **"מדפיס…"**. The dialog closes when done.
5. The PDF = summary page **"סיכום חוב ללקוח"** + one full delivery note page per selected note.

### 3.8 Quotes (הצעות מחיר)

**Create a quote**
1. `/dashboard/quotes` → **"הצעת מחיר חדשה"**.
2. **"לקוח"** (**"בחר לקוח"**) — required. **"תוקף ההצעה"** (optional date). **"הערות"** (optional, placeholder **"הערות פנימיות (אופציונלי)"** — note: notes are printed on the quote document as **"הערות:"**).
3. VAT checkbox **"מחיר בפריטים כולל מע״מ (יומר לנטו לפני שמירה)"** (§1.5).
4. Section **"פריטים"**. Each card is **"פריט N"** (one line, numbered by position):
   1. **"אבן מהקטלוג"** → **"בחר אבן"** → stone. (If the customer has a special price and the line is per m³, the price auto-fills; otherwise the price is cleared.)
   2. Pricing tabs: **"לפי קו״ב"** (default) / **"לפי מ״ר"** / **"לפי יחידה"**. Switching tabs **clears the price**.
   3. Dimensions in cm: m³ → **"גובה / עובי (ס״מ)"** (required), **"רוחב (ס״מ)"**, **"אורך (ס״מ)"**, **"כמות"**. For m²/unit the thickness field is labelled **"גובה / עובי (ס״מ) — לצורך המרה להזמנה"** (placeholder **"ברירת מחדל 2"**; empty = 2 cm). Fill the real thickness — it is used to convert prices if the quote becomes an order.
   4. Price field labelled **"מחיר לקו״ב (₪)"**, **"מחיר למ״ר (₪)"** or **"מחיר ליחידה (₪)"**.
   5. **"תצוגת שורה (נטו לפני מע״מ)"** shows the computed line amount.
   6. **"הסרה"** removes the line (when more than one).
5. **"שורה נוספת"** adds a new line **at the top** (so existing lines are renumbered).
6. Check totals (**"סכום לפני מע״מ"**, **"מע״מ (18%)"**, **"סה״כ כולל מע״מ"**; **"סה״כ קוב (שורות m³)"** if any m³ lines).
7. **"יצירת הצעה"** → toast (e.g. **"הצעת המחיר נוצרה"**) → quote page.

**Edit a quote** (only status **פתוחה**)
- Quote page → **"עריכה"** (or `/dashboard/quotes/[id]/edit`). Same form; submit **"שמירת שינויים"**. All lines are replaced by what is on the form.

**Convert a quote to an order** (⚠ reserves inventory — confirm with human)
1. Quote page → **"צור הזמנה"** (or row **"צור הזמנה"** in the quotes table; disabled with tooltip **"כבר נוצרה הזמנה"** / **"לא ניתן להמיר הצעה זו"** when not allowed).
2. Page **"צור הזמנה מהצעה #N"**. Set **"תעדוף"**, **"יעד אספקה"**, **"קישור לחתימה"**.
3. Under **"פריטים"** each quote line (**"שורה N"**, with dims · ×qty · measure · price) needs a **"מקור"**:
   - an available shipment with **available ≥ line quantity** (same label format as orders), or
   - **"לא במלאי — ייווצר וייגרע"** (creates a new shipment and reserves it; then pick **"רמת גימור"** and **"חלק"**).
   - Defaults: if no shipment has enough stock → **לא במלאי** is preselected; if exactly one → it is preselected; otherwise you must choose (**"בחר משלוח או לא במלאי"**).
4. **"יצירת הזמנה"** (pending **"יוצר הזמנה…"**) → toast (e.g. **"ההצעה הומרה להזמנה"**) → new order page.
5. Quote becomes **הומרה להזמנה** and shows a link **"הזמנה: #N"**. Dimensions, quantities and prices come from the quote and cannot be edited during conversion; the order inherits the quote's VAT mode.

**Delete a quote** (⚠ confirm with human)
- Quotes table → **"מחיקה"** (disabled for converted quotes) → dialog **"מחיקת הצעת מחיר"** — **"למחוק את הצעת המחיר? פעולה זו לא ניתנת לביטול."** → **"מחיקה"**.

### 3.9 Printing and exporting documents

Available on the order page (**"תעודת הזמנה"**), quote page (**"הצעת מחיר"**), delivery page (**"תעודת משלוח"**) and debtors dialog (§3.7).
- **"הורדת PDF"** → downloads an A4 PDF: `תעודת-הזמנה-<N>.pdf`, `הצעת-מחיר-<N>.pdf`, `תעודת-משלוח-<N>.pdf`. Button shows **"מוריד…"** while working. Prefer this.
- **"הדפסה"** → renders a PDF in a hidden frame and opens the **browser's native print dialog** (**"מדפיס…"** while busy). Agents usually cannot operate native dialogs; ask the human or use the PDF.
- Errors: **"שגיאה בהדפסה. נסו שוב."**, **"שגיאה בהורדת PDF. נסו שוב."**
- Documents are generated client-side from what is on screen; no email sending exists.

---

## 4. Field-by-field validation rules

Client checks block submission with an inline message; server checks return a message shown inline or as a toast/dialog. Numbers: type plain digits with `.` for decimals (§7.3).

### 4.1 Login
| Field | Rule | Message |
|---|---|---|
| email | valid email | **"אימייל לא תקין"** |
| password | non-empty | **"נא להזין סיסמה"** |
| — | wrong credentials | **"אימייל או סיסמה שגויים."** / fallback **"ההתחברות נכשלה. נסו שוב."** |

### 4.2 Stone
| Field | Rule | Message |
|---|---|---|
| שם האבן | required; unique among active stones | **"שם חובה"** / **"כבר קיימת אבן פעילה בשם זה בקטלוג."** |
| צבע | hex `#RRGGBB` | **"צבע לא תקין"** / **"קוד הצבע אינו תקין."** |

### 4.3 Customer
| Field | Rule | Message |
|---|---|---|
| שם | required | **"שם חובה"** |
| ח.פ / ת״ז | required; unique (also vs. archived customers) | **"ח.פ / ת״ז חובה"** / **"כבר קיים לקוח עם ח.פ / ת״ז זה."** |
| דוא״ל | optional; valid email if given | **"אימייל לא תקין"** |
| טלפון, כתובת | optional free text | — |

Special price: stone required; **"מחיר קו״ב ללקוח (₪)"** must be a number > 0 (button stays disabled otherwise).

### 4.4 Inventory shipment
| Field | Rule | Message |
|---|---|---|
| אבן | required (new only); cannot change on edit | **"לא ניתן לשנות את האבן למשלוח קיים"** |
| אורך / רוחב / גובה (ס״מ) | > 0 (m² mode: thickness may be empty → 2 cm) | generic validation / **"המידות חייבות להיות גדולות מאפס."** |
| כמות במשלוח | integer > 0; on edit ≥ reserved + delivered | **"הכמות חייבת להיות גדולה מאפס."** / **"כמות כוללת לא יכולה להיות קטנה מהכמות המזומנת/סופקה (N)"** |
| מחיר לקו״ב / מחיר למ״ר | required for the chosen mode; ≥ 0 | **"חובה מחיר לקו״ב"** / **"חובה מחיר למ״ר"** |
| מחיר ללקוח | required; ≥ 0 | generic validation |
| סטטוס | זמין / לא זמין / בדרך | — |
| תאריך צפי הגעה | required when **בדרך**; valid date | **"בסטטוס ״בדרך״ חובה תאריך צפי הגעה"** / **"תאריך לא תקין"** |

Zero prices are accepted — double-check before saving a 0.

### 4.5 Order (new)
| Field | Rule | Message |
|---|---|---|
| לקוח | required | **"נא לבחור לקוח"** |
| תעדוף | נמוך/בינוני/דחוף | — |
| יעד אספקה | optional valid date | **"תאריך לא תקין"** |
| קישור לחתימה | optional; http(s) URL ≤ 2048 chars | **"קישור החתימה חייב להתחיל ב-https://"** / **"קישור ארוך מדי"** |
| Lines | at least one complete line | **"נא לבחור אבן ומשלוח במלאי לפחות לפריט אחד"** / **"נא להוסיף לפחות פריט אחד תקין"** |
| Line: stone | required | **"פריט N: חסרה בחירת אבן"** |
| Line: source | shipment or **לא במלאי** | **"פריט N: חסר משלוח במלאי"** |
| Line: dims | all three > 0 | **"פריט N: חסרות מידות תקינות"** |
| Line: quantity | integer > 0; ≤ available (server) | **"פריט N: כמות לא תקינה"** / **"אין מספיק כמות זמינה במלאי עבור אחד הפריטים."** |
| Line: price | number ≥ 0 | **"פריט N: מחיר לא תקין"** |
| לא במלאי line | finish and piece required (have defaults) | **"בפריט שלא במלאי חובה רמת גימור"** / **"בפריט שלא במלאי חובה סוג חלק"** |

Partially filled ("touched") but incomplete lines block submission; completely untouched empty lines are ignored.

### 4.6 Order header edit
תעדוף, סטטוס (any), יעד אספקה (valid date or empty), קישור חתימה (http/https or empty). Cancelling with a delivery note → **"לא ניתן לבטל הזמנה שכבר הופקה לה תעודת משלוח."**

### 4.7 Delivery note edit
| Field | Rule | Message |
|---|---|---|
| כתובת משלוח | required when **שילוח** | **"כתובת חובה בשילוח"** / **"בשילוח חובה למלא כתובת."** |
| יעד תשלום, תאריך מסירה | optional valid dates | **"תאריך לא תקין"** |
| others | from fixed lists | — |

### 4.8 Quote
| Field | Rule | Message |
|---|---|---|
| לקוח | required | **"נא לבחור לקוח"** |
| תוקף ההצעה | optional valid date | **"תאריך לא תקין"** |
| Lines | ≥ 1 complete | **"נא לבחור אבן מהקטלוג לפחות לפריט אחד"** |
| Line: stone | required, active | **"פריט N: חסרה בחירת אבן"** / **"אחת האבנים לא נמצאה או הועברה לארכיון."** |
| Line: length/width | > 0 | **"פריט N: חסרות אורך/רוחב תקינים"** |
| Line: thickness | > 0 for **לפי קו״ב** | **"פריט N: חסר גובה/עובי תקין"** |
| Line: quantity | integer > 0 | **"פריט N: כמות לא תקינה"** |
| Line: price | ≥ 0, required for the unit | **"פריט N: מחיר לא תקין"** / **"חובה מחיר לקו״ב"** / **"חובה מחיר למ״ר"** / **"חובה מחיר ליחידה"** |
| Edit | only open quotes | **"ניתן לערוך או להמיר רק הצעת מחיר פתוחה."** |

### 4.9 Quote conversion
Every line needs a source: **"נא לבחור משלוח או ״לא במלאי״ לפריט: <stone>"**. Server: quote must be open; line count must match (**"ההצעה השתנתה בינתיים — רעננו את הדף ונסו שוב."**); stock sufficient; price derivable (**"לא ניתן לגזור מחיר לקו״ב מפריט ההצעה"**).

### 4.10 Debtors print
At least one note selected (**"יש לבחור לפחות תעודה אחת"**); all from one customer; all unpaid (**"ניתן להדפיס רק תעודות שלא שולמו"**).

---

## 5. Side effects, irreversible actions, confirm-with-human list

### 5.1 Inventory math

For each shipment: **available (זמין) = total (כמות במשלוח) − reserved (בהזמנה) − delivered (סופק)**. The DB enforces reserved + delivered ≤ total.

| Action | Effect on shipment quantities |
|---|---|
| Create order / convert quote (line from shipment) | reserved += line quantity |
| "לא במלאי" line | creates a new shipment with total = quantity, then reserved = quantity |
| Order → **בוטלה** (no delivery) | reserved −= order's quantities |
| Order **בוטלה** → other status | reserved += quantities (fails if not enough available) |
| Create delivery note | reserved −= qty, delivered += qty |
| Delete order without delivery | reserved −= qty (skipped if order was already cancelled) |
| Delete order with delivery | delivered −= qty (stock comes back as available), delivery note deleted |
| Delivery status **בוטל** | **nothing** |
| Edit order item status | nothing |
| Edit shipment total | only allowed ≥ reserved + delivered |

### 5.2 What deletes / cascades

| Action | Also removes / changes | Reversible? |
|---|---|---|
| Delete order | its order items; its delivery note and delivery items (if any); returns stock as above; a quote converted into it returns to **פתוחה** | **No.** Number is lost. Auto-created "לא במלאי" shipments are **not** deleted — they remain as available stock and may need manual cleanup (ask the human). |
| Delete quote | its lines | No |
| Delete inventory shipment | if used by any order line → becomes **לא זמין** instead | Deleted rows: no. "לא זמין": edit back to **זמין**. |
| Archive stone | hidden from catalog and dropdowns | **No UI to restore** |
| Remove customer special price | — | Re-add manually |
| Create delivery note | order items → **הושלם**, order → **מוכנה למשלוח**, stock reserved → delivered | Only by deleting the whole order |
| Delivery → **נמסר** | order → **הושלמה**; delivered date set | Edit back manually (order status must be fixed separately) |
| Mark paid | removed from debtors and receivables KPIs | Edit **"סטטוס תשלום"** back to **לא שולם** |

There is **no undo, no trash, no audit log** in the UI.

### 5.3 Confirm with the human BEFORE

Always get explicit approval (state what will happen, including numbers/amounts) before:
1. **Any delete**: order, quote, inventory shipment, customer special price.
2. **Archiving a stone.**
3. **Cancelling an order** (status **בוטלה**) or un-cancelling one.
4. **Creating a delivery note** (no confirmation dialog; changes stock and statuses).
5. **Marking a delivery note paid** (any of the three ways) or changing payment status back to unpaid.
6. Setting a delivery to **נמסר** (completes the order) or **בוטל**.
7. **Converting a quote** into an order (reserves stock / creates shipments).
8. Using **"לא במלאי"** lines (creates new shipments).
9. Reducing a shipment's quantity, or setting it to **לא זמין**.
10. Any bulk action (more than ~3 records) — confirm the list first.
11. Anything where the VAT-included choice or pricing unit is unclear.

When a confirmation dialog appears in the UI, it is a second safety net — **do not** treat clicking it as the human's approval.

---

## 6. Limitations

- **Lists are capped**: orders, quotes and delivery notes show only the latest **400**; order items max **800**; customer page shows up to **30** orders / **30** notes; dashboard to-dos up to **40**; sidebar previews 12/12/8. Older records beyond the cap are not reachable through the lists (ask the human).
- **One filter per table**, on one fixed column (customers: **email only**). No date ranges, no status filters, no global search. The command palette only lists navigation + preview items.
- **Order lines cannot be edited** after creation (only header fields). No adding/removing lines. Customer cannot be changed on an order or delivery.
- **Delivery note = snapshot**: totals/lines are copied at creation; later changes to the order (impossible anyway for lines) or stone names don't update it. One delivery note per order — **no partial deliveries**.
- **No direct delete for delivery notes**; no delete/archive for customers in the UI; no un-archive for stones; no way to set a quote to **בוטלה** or an order item to **בוטל**.
- **In-transit (בדרך) stock cannot be ordered from** directly.
- **Orders are priced per m³ only**; m² and unit prices exist only in inventory display and quotes.
- **VAT is fixed at 18%** in the UI.
- **No invoicing integration**: "Green Invoice ID" is a free-text field only. No emails, no SMS, no payment processing. Printing = local PDF/print.
- **No partial payments**: payment status is paid/unpaid for the whole note.
- **No roles/permissions**: every logged-in CRM user can do everything (optional allow-list at DB level only). No per-user history/audit.
- **No undo.**
- Concurrent edits are last-write-wins (except stock reservation, which is checked atomically).
- KPI **"הכנסות החודש"** sums totals of all orders created this month (including cancelled ones) — treat it as indicative.
- The deliveries table column headed **"מזומן"** actually shows the payment method's raw English code (e.g. `bank_transfer`), and **"GI"** is the Green Invoice ID. Read the delivery page for the Hebrew method name.
- Dimension precision is 1 mm; money is stored with 2 decimals (small rounding differences are normal).
- Avatar menu **"פרופיל"** / **"הגדרות"** do nothing.

---

## 7. Browser-use practical tips

### 7.1 RTL layout
- Reading order is right → left. The sidebar is on the **right**; the header CTA and the **"עמודות"** button are on the **left**; in sticky footers the primary button (**"שמירה"**) is at the far **left** end and **"ביטול"** next to it; destructive buttons (**"ארכיון"**, **"סמן כשולם"**) are at the opposite (right) end.
- Numbers, emails, URLs and dimensions are LTR inside RTL text. Dimension strings read `L×W×H` left-to-right.
- In the order-line grid, columns from right to left are: **מקור**, **גובה**, **רוחב**, **אורך**, **כמות**, **נפח**. Identify inputs by their placeholder/aria-label (**"גובה"** / **"רוחב"** / **"אורך"** / **"כמות"**), never by position.
- Currency appears as `‎4,200 ₪` (thousands separator in display only).

### 7.2 Dropdowns (Radix Select)
- They are **not** native `<select>` elements. You cannot "select option" programmatically or type into them reliably.
- Procedure: **click the trigger** (button showing the current value or placeholder such as **"בחר לקוח"**) → a floating list (role="listbox") opens, often rendered at the end of `<body>` → **click the option text** (role="option"). Then verify the trigger now shows the chosen text.
- Long lists scroll inside the popup; scroll within it, or type the first letters while it is open (typeahead works on option text, may be unreliable with Hebrew).
- Press **Escape** to close without choosing. While open, the rest of the page is not clickable.
- Disabled triggers (e.g. the line source before choosing a stone) do nothing — fill the prerequisite first.
- The order-line source options are long strings like `זמין 5 גרניט שחור פאנל חלק, 240×135×2`; match on stone + dimensions + available count.

### 7.3 Numeric inputs
- Inputs are text fields (`inputMode="decimal"`), LTR.
- **Type plain digits. Do NOT type thousands separators** (`4,200`). A comma may be interpreted as a decimal point (`12,34` → 12.34). Type `4200`. Use `.` for decimals (`2.5`). No currency symbols, no spaces, no units.
- Clear the field before typing (select-all + type, or triple-click + type); new-inventory fields have pre-filled defaults (240/135/2/1).
- Invalid text (e.g. `12abc`) is treated as invalid, not guessed.
- After typing, read back the live previews (volume/area/line totals) to confirm the number was parsed as intended.

### 7.4 Date inputs
- Native `<input type="date">`. The stored value is `YYYY-MM-DD`; the **display/typing format depends on the browser locale** (e.g. `dd/mm/yyyy` or `mm/dd/yyyy`).
- Most reliable: click the field, then type the digits in the order the field displays its segments (check the placeholder segments), without separators if the browser auto-advances. If your tool can set the value directly, set `YYYY-MM-DD` **and** make sure an input/change event fires (React-controlled inputs ignore silent value changes).
- Always read the field back after entering. Dates in lists/documents are shown as `YYYY-MM-DD` or Hebrew long dates (e.g. `5 בנובמבר 2026`).
- To clear an optional date, clear the field fully (some browsers need clearing each segment).

### 7.5 Color picker (stones)
- Native `<input type="color">` (aria-label **"בחירת צבע"**) opens an OS dialog. Prefer setting the value directly to `#rrggbb` with an input event if your tool supports it; otherwise ask the human or keep the default and tell them.

### 7.6 Waiting and verifying
- After clicking a submit button, wait until **either** a toast appears, the URL changes, **or** an inline red error / error dialog appears. The button is disabled with a pending label (**"שומר…"**, **"יוצר…"**, **"יוצר הזמנה…"**, **"מתחבר…"/"מתחברים…"**, **"מוריד…"**, **"מדפיס…"**) while working. Do **not** click again while pending.
- Pages no longer do full reloads after most actions (in-progress change); lists update in place. Some row actions (deletes, item status, debtors **"סמן כשולם"**) may still reload the page — wait for it to finish.
- Toasts (sonner) appear at a screen corner and disappear after a few seconds. Known success texts include **"האבן נוספה לקטלוג"**, **"האבן עודכנה"**, **"הלקוח נוסף"**, **"פרטי הלקוח עודכנו"**, **"המחיר המיוחד נשמר"**, **"הפריט נוסף למלאי"**, **"פריט המלאי עודכן"**, **"ההזמנה נוצרה"**, **"ההזמנה עודכנה"**, **"הצעת המחיר נוצרה"**, **"הצעת המחיר עודכנה"**, **"ההצעה הומרה להזמנה"**, **"תעודת המשלוח עודכנה"** (texts may change; don't depend on exact wording).
- **Never rely on the toast alone.** Verify by re-reading the destination page: the new row in the table (use the filter), the status text on the detail page, KPI changes, the order/delivery number. If unsure, reload the page (F5) and re-read.

### 7.7 Dialogs
- Confirmation dialogs (**"מחיקת הזמנה"**, **"מחיקת פריט מלאי"**, **"מחיקת הצעת מחיר"**, **"ארכיון אבן"**) **ignore clicks outside** and have no close "X". You must click the confirm button (**"מחיקה"** / **"ארכיון"**) or **"ביטול"**. Escape may also close them.
- Error dialogs (title **"שגיאה"**) show a message and a **"סגירה"** button. Read the message, then close.
- The debtors **"סיכום חוב"** dialog has **"ביטול"**, **"הורדת PDF"**, **"הדפסה"**.
- While any dialog is open, the page behind is inert — close it before interacting elsewhere.

### 7.8 Recovering from errors / uncertain outcomes
1. Read the exact Hebrew message (inline, toast, or dialog) and map it via §8.
2. If the outcome is unknown (timeout, network error, **"הפעולה לא הושלמה — ייתכן שאין חיבור לשרת או שהמערכת עודכנה. רעננו את הדף ונסו שוב."**): **reload and check whether the record was created/changed before retrying** — creating orders/deliveries twice has real consequences (stock reservations, numbers).
3. Validation errors: fix the named field and resubmit. Form contents normally stay on screen after an error.
4. After two failed attempts at the same step, stop and report to the human with the message text and what you entered.

### 7.9 Downloads and print
- **"הורדת PDF"** triggers a normal file download; the file name includes the document number.
- **"הדפסה"** opens the native print dialog (outside the DOM). If your tool cannot handle it, press Escape/cancel and use **"הורדת PDF"** instead, or ask the human.

### 7.10 Other
- Row clicks navigate; to act on a row without opening it, click the specific button (**"עריכה"**, **"מחיקה"**, **"צור תעודת משלוח"**, **"צור הזמנה"**) — these stop propagation.
- Collapsibles (dashboard to-dos, order items, sidebar groups) start closed except debtors; click the header to expand before looking for content.
- Hidden columns: if a column you expect is missing, open **"עמודות"** and re-enable it.
- The UI is single-language Hebrew; don't switch browser translation on — it breaks label matching.

---

## 8. Error messages and what to do

Server/database errors are translated to Hebrew (`lib/db/errors.ts`). Unknown errors show the fallback.

| Message (exact) | Meaning | Agent action |
|---|---|---|
| **אין מספיק כמות זמינה במלאי עבור אחד הפריטים.** | A line's quantity exceeds the shipment's available pieces (or un-cancelling needs stock that is gone). | Re-check **זמין** in the source label / inventory list; reduce quantity, split across shipments, or (with approval) use **לא במלאי**. |
| **כבר קיים לקוח עם ח.פ / ת״ז זה.** | Duplicate tax id. | Search existing customers (the customer may already exist, possibly archived); ask the human. Don't invent a different id. |
| **כבר קיימת אבן פעילה בשם זה בקטלוג.** | Duplicate active stone name. | Use the existing stone, or ask for a distinct name. |
| **כבר הוגדר מחיר מיוחד לאבן זו אצל הלקוח.** | Duplicate special price (normally upsert prevents this). | Reload the customer page; edit by re-saving the price for that stone. |
| **כבר קיימת תעודת משלוח להזמנה זו.** | Delivery note already exists. | Open the existing note from **תעודות משלוח**; don't retry. |
| **לא ניתן לבטל הזמנה שכבר הופקה לה תעודת משלוח.** | Tried to cancel an order with a delivery note. | Report to human. Options (human decides): set delivery **בוטל** and leave order, or delete the order (destructive). |
| **לא ניתן להפיק תעודת משלוח להזמנה מבוטלת.** | Order is **בוטלה**. | Report; un-cancel only with approval. |
| **המשלוח שנבחר במלאי לא תואם לאבן שנבחרה.** | Line's stone ≠ shipment's stone. | Re-select the stone and shipment for that line. |
| **אחת האבנים לא נמצאה או הועברה לארכיון.** | A stone was archived. | Reload the form; pick an active stone; ask human. |
| **ניתן לערוך או להמיר רק הצעת מחיר פתוחה.** | Quote not open (already converted). | Open the quote page; follow the **"הזמנה: #N"** link. |
| **לא ניתן למחוק הצעת מחיר שכבר הומרה להזמנה.** | Converted quote. | Don't delete; report. |
| **ההצעה השתנתה בינתיים — רעננו את הדף ונסו שוב.** | Quote lines changed since the page loaded. | Reload the convert page, redo mapping. |
| **הרשומה לא נמצאה — ייתכן שנמחקה.** | Record deleted (maybe by someone else). | Go back to the list, reload, re-locate. |
| **הכמויות במלאי לא מסתדרות (מוזמן + סופק גדול מהכמות הכוללת).** | Inventory constraint violated. | Don't reduce quantity below reserved+delivered; report. |
| **בסטטוס ״בדרך״ חובה תאריך צפי הגעה.** | Missing expected arrival date. | Fill **"תאריך צפי הגעה"**. |
| **בשילוח חובה למלא כתובת.** | Shipping without address. | Fill **"כתובת משלוח"** or switch to **איסוף**. |
| **קוד הצבע אינו תקין.** | Bad color hex. | Set a valid `#rrggbb`. |
| **המידות חייבות להיות גדולות מאפס.** | A dimension ≤ 0. | Fix dimensions (cm). |
| **הכמות חייבת להיות גדולה מאפס.** | Quantity ≤ 0. | Fix quantity. |
| **תאריך לא תקין.** / **תאריך לא תקין** | Malformed date. | Re-enter the date (§7.4). |
| **מזהה לא תקין.** / **מזהה לא תקין** | Bad id in URL/action. | Navigate from the list instead of typed URLs. |
| **פג תוקף ההתחברות — התחברו מחדש.** | Session expired. | Log in again, then verify last action before retrying. |
| **אין לכם הרשאה לבצע פעולה זו.** | RLS/permission denied (user not in CRM allow-list?). | Stop; tell the human. |
| **אימייל או סיסמה שגויים.** | Wrong login. | Don't guess; ask the human. |
| **כתובת האימייל עוד לא אומתה.** | Unconfirmed account. | Ask the human. |
| **יותר מדי ניסיונות — המתינו דקה ונסו שוב.** | Rate-limited. | Wait ≥ 60 s, retry once. |
| **אין חיבור לשרת — בדקו את החיבור לאינטרנט ונסו שוב.** | Network failure. | Wait, reload, verify state, then retry. |
| **לא ניתן לבצע — קיימות רשומות אחרות שמקושרות לרשומה זו.** | Foreign-key block (record in use). | Report; don't force. |
| **רשומה זהה כבר קיימת.** | Generic duplicate. | Look for the existing record. |
| **אירעה שגיאה. נסו שוב.** | Unmapped error (also possible for expired session). | Reload, check login and state; retry once; then report. |
| **הפעולה לא הושלמה — ייתכן שאין חיבור לשרת או שהמערכת עודכנה. רעננו את הדף ונסו שוב.** | The action call itself crashed (network / new deployment). | Reload, verify whether it was saved, retry once. |
| **התעודה נשמרה, אך עדכון סטטוס ההזמנה נכשל: …** | Delivery saved, order not set to **הושלמה**. | Report; with approval, set order status manually. |
| **שגיאת ולידציה** or an English validation text | A field failed schema validation without a custom message. | Re-check all numbers/dates for that form against §4. |
| **שגיאה בהדפסה. נסו שוב.** / **שגיאה בהורדת PDF. נסו שוב.** / **לא ניתן להכין את המסמך** | Export failed. | Retry once; otherwise report. |

---

## 9. Troubleshooting table

| Symptom | Likely cause | Fix |
|---|---|---|
| Redirected to `/login` | Session missing/expired | Log in; you return via `?next=`. |
| Lists are empty everywhere after login | User not allowed by DB (allow-list) or DB issue | Stop; tell the human. |
| Shipment missing from the order line source list | Status not **זמין**, or available = 0, or a different stone chosen | Check it in **מלאי**; change status to **זמין** (with approval) or use **לא במלאי**. |
| Shipment missing from quote-conversion source list | Its available < the quote line quantity | Use another shipment or **לא במלאי** (approval). |
| Inventory checkbox greyed out | Row not **זמין** or available 0 | Can't be selected; that's by design. |
| **"צור תעודת משלוח"** disabled | Order already has a delivery note | Open **תעודות משלוח**, filter by customer. |
| **"צור הזמנה"** disabled on a quote | Already converted or not open | Open the quote; follow **"הזמנה: #N"**. |
| Quote **"עריכה"** missing / edit URL redirects | Quote not **פתוחה** | Nothing to do; report. |
| Prices I typed in an order changed | Customer was (re)selected after typing; or stone changed | Select customer first, then set prices; re-check before saving. |
| Totals off by ~18% | Wrong VAT checkbox state | Fix checkbox (§1.5) before saving; after saving, the order must be recreated (approval). |
| Numbers wrong by ×1000 or ÷1000 | Typed thousands separator / comma | Retype digits only (§7.3). |
| Volume preview looks 100× / 10 000× off | Entered metres instead of cm (or mm) | All dimensions are **cm**. |
| Can't find a customer by name in the filter | Customers filter is by **email** | Scan/sort the **"שם"** column, or use Ctrl+F. |
| Can't find an old order/delivery | Beyond the 400-row cap | Ask the human; try the customer page (30 latest) or stone edit page (orders tab). |
| Paid note shows unpaid again | Used **"סמן כשולם"** then **"שמירה"** with stale **"סטטוס תשלום"** | Set **"סטטוס תשלום"** = **שולם**, save, verify. |
| Delivery cancelled (**בוטל**) still listed in debtors | Debtors only checks payment status | Report; resolving it (mark paid or not) is the human's call. |
| Item status change "didn't stick" | It did, and the item left the open view | Click **"הצג הכל"** to see it. |
| Clicking a row did nothing | Clicked inside a button cell, or a dialog is open | Click a plain text cell; close dialogs. |
| Dialog won't close by clicking outside | By design | Use **"ביטול"** / **"סגירה"** / Escape. |
| Button stuck on **"שומר…"** | Request hanging | Wait ~30 s; then reload and verify before retrying. |
| Print does nothing visible | Native print dialog outside DOM | Use **"הורדת PDF"**. |
| 404 page | Record deleted or bad URL | Navigate from lists. |
| New stone missing from dropdowns | Page loaded before creation | Reload the form page. |

---

## 10. Quick-reference cheat sheet

**Routes**: `/dashboard` · `/stones[/new|/:id/edit]` · `/inventory[/new|/:id/edit]` · `/orders[/new?inventory=a,b|/:id|/:id/edit]` · `/quotes[/new|/:id|/:id/edit|/:id/convert]` · `/order-items[?view=all]` · `/deliveries[/:id|/:id/edit]` · `/customers[/new|/:id|/:id/edit]` · `/debtors` (all under `/dashboard`).

**Create buttons**: אבן חדשה · הוסף למלאי · תעודת הזמנה / הוסף הזמנה · הצעת מחיר חדשה · הוסף לקוח.
**Submit buttons**: שמירה · שמירת מחיר · יצירת הזמנה · יצירת הצעה · שמירת שינויים. **Cancel**: ביטול.
**Row actions**: עריכה · מחיקה · צור תעודת משלוח · צור הזמנה · צור הזמנה (N) (inventory selection).
**Document actions**: הדפסה · הורדת PDF · עריכה · חזרה · צור הזמנה (quote).
**Payment**: סמן כשולם (immediate, no dialog).

**Statuses**
- Order: פתוחה → בייצור → מוכנה למשלוח → הושלמה ; בוטלה (releases stock; not if delivery exists).
- Order item: ממתין / בייצור / הושלם.
- Delivery: ממתין לאיסוף / בדרך / נמסר (→ order הושלמה) / בוטל. Payment: לא שולם / שולם.
- Quote: פתוחה / הומרה להזמנה / בוטלה.
- Inventory: זמין / לא זמין / בדרך (needs תאריך צפי הגעה).
- Priority: נמוך / בינוני / דחוף. Finish: חלק / טובזה / מסמסם. Piece: פאנל / מסגרת / פלטה / אבן עומדת.
- Payment method: ללא / מזומן / העברה בנקאית / צ׳ק / כרטיס אשראי / אחר. Fulfillment: איסוף / שילוח (needs כתובת משלוח).

**Units**: dims in **cm**; קו״ב = m³; מ״ר = m²; יחידה = piece. Orders priced per m³. Line = L×W×H×qty(m) × price/m³.
**VAT**: 18%. "כולל מע״מ" checkbox = entered prices include VAT → divided by 1.18. Total always = net × 1.18.
**Numbers**: digits only, `.` decimal, no `,` separators. **Dates**: native date input, verify after typing.
**Dropdowns**: click trigger → click option → verify.
**Stock**: available = total − reserved − delivered. Order reserves; delivery moves reserved→delivered; cancel/delete releases.

**Always confirm with the human before**: deleting anything · archiving a stone · cancelling/un-cancelling an order · creating a delivery note · marking paid/unpaid · setting delivered/cancelled on a delivery · converting a quote · using "לא במלאי" · reducing stock · bulk actions.

**After every write**: wait for pending to end → read toast/error → re-read the page to verify → never blind-retry.
