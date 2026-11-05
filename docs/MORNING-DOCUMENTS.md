# Morning (Green Invoice): every document type, every field

This is the reference for issuing Morning documents from the CRM. People and the AI agent both use it; the agent works in the browser as a regular user with the `agent` role.

- **Form:** `/dashboard/green-invoice/documents/new`
- **List and Morning search:** `/dashboard/green-invoice/documents`
- **Source of truth:** `lib/green-invoice/document-types.ts` holds the definitions and `lib/green-invoice/document-builder.ts` holds the payload builder and validation. The tables below are generated from those definitions.
- **Authoritative API:** the official OpenAPI spec (`developers.morning.co/docs/openapi.bundled.json`, checked on 2026-11-05).

> **Important.** The spec defines a single request schema, `CreateDocumentRequest`, for all 15 types. It does **not** say which field applies to which type.
> Everything in the type × field matrix that does not come from the spec is an **inference** (marked *(inferred)* or "not in the spec"). It is based on how Morning behaves and on Israeli bookkeeping rules.
> At runtime, `GET /documents/info?type=X` returns `incomeRowsEnabled / incomeRowsRequired / paymentRowsEnabled / vatTypes` for your specific business. The form shows a warning when that answer contradicts the definitions.

## Document types (spec: `DocumentType`)

| קוד | שם | צד שני | מסמך מס | מקושר בדרך כלל ל | סוגי עסק | הערות מה-spec | הסקות (לא ב-spec) |
|---|---|---|:-:|---|---|---|---|
| 10 | הצעת מחיר | לקוח | לא | — | — | income נדרש בסכמה (CreateDocumentRequest.required) | אין תקבולים<br>תאריך עתידי מותר<br>dueDate משמש כ"בתוקף עד" |
| 20 | חשבון / אישור תשלום | לקוח | לא | הצעת מחיר (10) — `link`<br>הזמנה (100) — `link` | — | סוג 20 קיים ב-DocumentType ו-ExpenseDocumentType | תקבולים אופציונליים<br>לא עתידי |
| 100 | הזמנה | לקוח | לא | הצעת מחיר (10) — `link` | — | — | אין תקבולים<br>תאריך עתידי מותר |
| 200 | תעודת משלוח | לקוח | לא | הזמנה (100) — `link`<br>הצעת מחיר (10) — `link` | — | — | אין תקבולים ואין תאריך לתשלום |
| 210 | תעודת החזרה | לקוח | לא | תעודת משלוח (200) — `link` | — | — | הכמויות נכתבות כחיוביות<br>מקושרת לתעודת המשלוח המקורית |
| 300 | חשבון עסקה | לקוח | לא | הצעת מחיר (10) — `link`<br>הזמנה (100) — `link`<br>תעודת משלוח (200) — `link` | — | DocumentInfo.settings.taxAuthorityProformaInvoiceEnabled — דיווח פרופורמה לרשות המסים | אין תקבולים (התשלום מתועד בקבלה 400 שמקושרת אליו) |
| 305 | חשבונית מס | לקוח | כן | הצעת מחיר (10) — `link`<br>הזמנה (100) — `link`<br>תעודת משלוח (200) — `link`<br>חשבון עסקה (300) — `link` | עוסק פטור אינו מפיק חשבונית מס (שגיאה 2403) *(הסקה)* | linkedPaymentId — רק בחשבונית מס (305)<br>client.self (חשבונית עצמית) — רק בחשבונית מס (שגיאה 2412)<br>2413: לפחות שורת הכנסה אחת | אין תקבולים — התשלום בקבלה 400 שמקושרת אליה<br>לא עתידי ולא לפני המסמך האחרון מאותו סוג (2405) |
| 320 | חשבונית מס / קבלה | לקוח | כן | הצעת מחיר (10) — `link`<br>הזמנה (100) — `link`<br>תעודת משלוח (200) — `link`<br>חשבון עסקה (300) — `link` | עוסק פטור אינו מפיק חשבונית מס *(הסקה)* | PaidDocumentType כולל 320<br>2419: לפחות שורת תקבול אחת<br>2422: סכום התקבולים = סכום ההכנסות<br>2428: צריך תקבול נוסף מלבד ניכוי במקור | לא עתידי |
| 330 | חשבונית זיכוי | לקוח | כן | חשבונית מס (305) — `cancel`<br>חשבונית מס / קבלה (320) — `cancel` | עוסק פטור אינו מפיק חשבונית מס *(הסקה)* | linkType=cancel: "Document cancels another"<br>DocumentStatus 3 מבטל / 4 בוטל | הסכומים נכתבים כחיוביים (כיוון הסימן לא מוגדר ב-spec)<br>בדרך כלל מקושרת בביטול (cancel) לחשבונית המקורית<br>מנהל בלבד (מדיניות ה-CRM) |
| 400 | קבלה | לקוח | כן | חשבונית מס (305) — `link` **[spec]**<br>חשבון עסקה (300) — `link`<br>חשבון / אישור תשלום (20) — `link` | — | linkedDocumentIds: "When creating a receipt, include the original invoice document ID — this will automatically close the original invoice"<br>PaidDocumentType כולל 400<br>2419: לפחות שורת תקבול אחת<br>DocumentInfo.settings.receiptIncomeEnabled — האם קבלה יכולה לכלול שורות הכנסה | income נשלח כ-[] כשאין שורות<br>כשיש שורות הכנסה — סכומן = סכום התקבולים |
| 405 | קבלה על תרומה | לקוח | כן | — | בדרך כלל עמותה / חל״צ בלבד (שגיאה 2403) *(הסקה)* | PaidDocumentType כולל 405 | כמו קבלה 400 |
| 410 | ביטול תרומה | לקוח | כן | קבלה על תרומה (405) — `cancel` | בדרך כלל עמותה / חל״צ בלבד *(הסקה)* | סוג 410 קיים ב-DocumentType | שורות תקבול = ההחזר<br>מקושר בביטול (cancel) לקבלה על התרומה<br>מנהל בלבד (מדיניות ה-CRM, כמו זיכוי) |
| 500 | הזמנת רכש | ספק | לא | — | — | הספק נשלח בשדה client (אין שדה supplier ב-CreateDocumentRequest) | אין תקבולים<br>תאריך עתידי מותר |
| 600 | קבלת פיקדון | לקוח | כן | — | — | PaidDocumentType כולל 600 | אין שורות הכנסה (פיקדון אינו הכנסה)<br>income נשלח כ-[] |
| 610 | משיכת פיקדון | לקוח | כן | קבלת פיקדון (600) — `link` | — | סוג 610 קיים ב-DocumentType | שורות תקבול = ההחזר<br>מקושרת לקבלת הפיקדון<br>מנהל בלבד (מדיניות ה-CRM) |

**Role:** the agent issues every type **except** 330 credit note, 610 deposit withdrawal and 410 donation cancellation, which are admin only.
- The check runs on the server, in `issueMorningDocument` → `canRoleIssue`.
- The agent can still view a preview of those types.
- 410 was added to the list because, like a credit note, it cancels an earlier document.

## Type × field matrix

"Required" means the field must be filled. "Optional" means it is shown and may be filled. "—" means the form hides the field and does not send it.

| שדה (API) | 10 | 20 | 100 | 200 | 210 | 300 | 305 | 320 | 330 | 400 | 405 | 410 | 500 | 600 | 610 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| תאריך המסמך (`date`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| תאריך לתשלום (`dueDate`) | רשות | רשות | רשות | — | — | רשות | רשות | — | — | — | — | — | רשות | — | — |
| שפת המסמך (`lang`) | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה |
| מטבע (`currency`) | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה |
| סוג מע״מ למסמך (`vatType`) | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה |
| הנחה (`discount`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | — | — | — | רשות | — | — |
| עיגול סכומים (`rounding`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | — | — | — | רשות | — | — |
| חתימה דיגיטלית (`signed`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| תיאור המסמך (`description`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| הערות (`remarks`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| טקסט תחתון (`footer`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| תוכן נוסף למייל (`emailContent`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| צירוף PDF למייל (`attachment`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| לקוח (`client`) | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה |
| חשבונית עצמית (`client.self`) | — | — | — | — | — | — | רשות | — | — | — | — | — | — | — | — |
| מסמכים מקושרים (`linkedDocumentIds`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| סוג הקישור (`linkType`) | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות | רשות |
| מזהה תשלום מקושר (`linkedPaymentId`) | — | — | — | — | — | — | רשות | — | — | — | — | — | — | — | — |
| בקשת תשלום מקוון (`paymentRequestData`) | רשות | רשות | רשות | — | — | רשות | רשות | — | — | — | — | — | — | — | — |
| שורות הכנסה (`income`) | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | חובה | רשות | רשות | — | חובה | — | — |
| שורות תקבול (`payment`) | — | רשות | — | — | — | — | — | חובה | — | חובה | חובה | חובה | — | חובה | חובה |
| תקבולים = סה״כ | — | — | — | — | — | — | — | תמיד | — | כשיש הכנסות | כשיש הכנסות | — | — | — | — |
| תאריך עתידי | מותר | אסור | מותר | מותר | מותר | מותר | אסור | אסור | אסור | אסור | אסור | אסור | מותר | אסור | אסור |
| סוגי קישור | link/copy | link/copy | link/copy | link/copy | link/cancel/copy | link/copy | link/copy | link/copy | cancel/link | link/copy | link/copy | cancel/link | link/copy | link/copy | link/cancel |
| מנהל בלבד | — | — | — | — | — | — | — | — | כן | — | — | כן | — | — | כן |
| documents.kind | `other` | `other` | `other` | `other` | `other` | `other` | `customer_invoice` | `customer_invoice_receipt` | `customer_credit_note` | `customer_receipt` | `customer_receipt` | `other` | `other` | `other` | `other` |

Required fields per the spec (`CreateDocumentRequest.required`): `type`, `lang`, `currency`, `vatType`, `income`.
- `income` is **always** sent, as `[]` when the type has no income rows: receipts, deposits, donation cancellation.
- `client` is not required in the schema, but errors 2410 / 2201 require it, so the form treats it as required for every type.
- `maxPayments` is not a top-level field. It belongs to `paymentRequestData` (`{plugins:[{id, group, type}], maxPayments}`).
- **Agent field labels:** each field is wrapped in a `<label>` with the label text shown in the table. Row fields carry their number, for example "תיאור שורה 1", "מחיר ליחידה שורה 2", "אמצעי תשלום — תקבול 1", "מספר צ׳ק — תקבול 1".

### Customer (`client`)
| Field | Label in the form | Note |
|---|---|---|
| `id` | — | A CRM customer is found in Morning by name and tax ID, or created when it is missing (`findOrCreateClient`). The request then sends `{id, emails}`. |
| `name` | שם הלקוח / שם הספק | Required when there is no `id` (2201). |
| `taxId` | ח.פ / ת״ז | |
| `emails` | מיילים לשליחת המסמך | Up to 3 addresses (2200). The download link is sent to them. |
| `phone`, `mobile`, `fax` | טלפון, נייד, פקס | |
| `address`, `city`, `zip`, `country` | כתובת, עיר, מיקוד, מדינה | `country` is a 2-letter code; the default is IL. |
| `add` | הוספה לרשימת הלקוחות ב-Morning | One-off customer only. |
| `self` | חשבונית עצמית | Type 305 only (error 2412). |

Purchase order (500): the supplier's details are sent in `client`, because the request has no `supplier` field. The supplier is **not** added to Morning's customer list.

## Income rows (spec: `IncomeRowRequest`)

| שדה | תווית בטופס | חובה | הערות |
|---|---|:-:|---|
| `description` | תיאור | כן | לא ריק (2415) |
| `quantity` | כמות | כן | חיובית (2430) |
| `price` | מחיר ליחידה | כן | מחיר שלילי = שורת הנחה (מותר כל עוד סה״כ המסמך תקין) |
| `currency` | מטבע | כן | בטופס: מטבע המסמך |
| `currencyRate` | שער המרה לשקל | — | ברירת מחדל 1; גדול מאפס (1107) |
| `vatType` | מע״מ בשורה | כן | 0 לפני מע״מ (יתווסף מע״מ), 1 כולל מע״מ, 2 פטור ממע״מ |
| `vatRate` | שיעור מע״מ | — | למשל 0.18; בין 0 ל-1 (1108) |
| `catalogNum` | מק״ט | — |  |
| `itemId` | מזהה פריט ב-Morning | — |  |

**Totals.** The builder computes them the same way Morning does, and the form shows them.
- **Per row:** line = quantity × price.
  - `vatType` 0: VAT is added on top at the business rate, 18% by default, or at `vatRate`.
  - `vatType` 1: the price includes VAT, so before VAT = line / (1 + rate).
  - `vatType` 2: exempt.
- **Document `vatType`** (spec `DocumentVatType`): 0 normal, 1 exempt, 2 mixed.
  - An exempt document sends every row with `vatType` 2. Morning returns error 1109 for a taxable row in a document without VAT.
  - A normal document with an exempt row has to be mixed *(inferred)*.
- **`discount`:** the spec says "excluded from VAT". The discount is taken off the before-VAT amount, and VAT is calculated afterwards *(inferred)*.
- **`rounding`:** the total is rounded to a whole shekel *(inferred)*.

## Payment rows (spec: `PaymentRowRequest`)

| שדה | תווית | חובה | הערות |
|---|---|:-:|---|
| `type` | אמצעי תשלום | כן | 2421; 0 ניכוי במקור, 1 מזומן, 2 צ׳ק, 3 כרטיס אשראי, 4 העברה בנקאית, 5 פייפאל, 10 אפליקציית תשלום, 11 אחר |
| `date` | תאריך התשלום | כן | לא ריק ולא עתידי (2426) |
| `price` | סכום | כן | שונה מאפס (2434) |
| `currency` | מטבע | כן |  |
| `currencyRate` | שער המרה לשקל | — |  |

| אמצעי תשלום (`type`) | שדות נוספים |
|---|---|
| 0 ניכוי במקור | — |
| 1 מזומן | — |
| 2 צ׳ק | `chequeNum` מספר צ׳ק **(חובה)** — spec: required when using cheques<br>`bankName` בנק **(חובה)**<br>`bankBranch` סניף **(חובה)** — עד 5 תווים (2109)<br>`bankAccount` מספר חשבון **(חובה)** |
| 3 כרטיס אשראי | `cardType` סוג כרטיס [0 לא ידוע, 1 ישראכרט, 2 ויזה, 3 מאסטרקארד, 4 אמריקן אקספרס, 5 דיינרס] — 2423<br>`cardNum` 4 ספרות אחרונות — בדיוק 4 ספרות (2608)<br>`dealType` סוג עסקה [1 רגילה, 2 תשלומים, 3 קרדיט, 4 חיוב נדחה, 5 אחר, 6 הוראת קבע] — 2424<br>`numPayments` מספר תשלומים — 1–36 (2425)<br>`firstPayment` סכום תשלום ראשון |
| 4 העברה בנקאית | `bankName` בנק — spec: שדה כללי; חובה רק בצ׳ק *(הסקה)*<br>`bankBranch` סניף *(הסקה)*<br>`bankAccount` מספר חשבון *(הסקה)* |
| 5 פייפאל | `accountId` חשבון המשלם<br>`transactionId` מזהה עסקה |
| 10 אפליקציית תשלום | `appType` אפליקציה [1 Bit, 2 Pay, 3 PayBox, 5 Google Pay, 6 Apple Pay]<br>`accountId` חשבון המשלם<br>`transactionId` מזהה עסקה |
| 11 אחר | `subType` סוג התשלום **(חובה)** [1 ביטקוין, 2 שווה כסף, 3 V-Check, 4 שובר מתנה, 5 ניכוי חלק עובד ביטוח לאומי, 6 אתריום, 7 BUYME שובר, 9 ניכוי אחר] — spec: required when using 'other'<br>`accountId` חשבון המשלם<br>`transactionId` מזהה עסקה |

Payment rules:
- **2419:** at least one payment row in types that take payment rows.
- **2422:** the payments must equal the total. In 320 this always applies. In a receipt (400/405) it applies only when it has income rows *(inferred)*.
- **2426:** the date cannot be empty or in the future.
- **2428:** there must be a row besides withholding tax.
- **2434:** the amount must be non-zero.
- **2425:** 1–36 instalments.

The "מלא לפי הסה״כ" (fill from total) button updates the last row to the remaining amount, or adds a bank-transfer row when there is none.

## Links between documents

`linkedDocumentIds` holds Morning document IDs. `linkType` takes one of these values:
- `link` — קישור (מסמך קשור)
- `cancel` — ביטול / זיכוי המסמך
- `copy` — העתק של המסמך

From the spec:
- A receipt that includes the invoice ID **closes the original invoice automatically**.
- `linkType` applies only together with `linkedDocumentIds`.
- `linkedPaymentId` is allowed only in type 305.
- Error 2404 accepts only copy / cancel / link.
- Error 2429 means a linked document was not found.

Usual links, all inferred except receipt → invoice:

| New document | Linked to | linkType |
|---|---|---|
| Receipt 400 | Tax invoice 305 / proforma invoice 300 / bill 20 | `link` |
| Tax invoice 305 / tax invoice-receipt 320 | Quote 10 / order 100 / delivery note 200 / proforma invoice 300 | `link` |
| Credit note 330 | 305 / 320 | `cancel` |
| Return note 210 | Delivery note 200 | `link` |
| Delivery note 200 | Order 100 / quote 10 | `link` |
| Deposit withdrawal 610 | Deposit receipt 600 | `link` |
| Donation cancellation 410 | Donation receipt 405 | `cancel` |

**Inside the CRM:** the `document_links` table (`sql/patch-2026-11-document-links.sql`) stores the links.
- When a document is issued with `linkedDocumentIds`, rows are created automatically. Each row goes from the new document to every archive document that has the matching `green_invoice_id`.
- A link of type `cancel` to an invoice of a delivery note clears `deliveries.green_invoice_id`, so a corrected invoice can be issued.
- On a document page, the `DocumentLinksPanel` shows links in both directions and has a "קישור למסמך" (link to document) button.
- Any CRM user can add a link. Only an admin can remove one.

## Issuing flow and safeguards
1. **Form.** Fields that do not apply to the type are hidden. Validation messages are in Hebrew and appear next to each field and in a list at the bottom.
2. **Preview** (`POST /documents/preview`). Opens a PDF in a dialog and does not use up a document number.
3. **Issue** after an explicit confirmation (`ConfirmDialog`).
4. **Double-issue lock:**
   - Each form sends a `requestId`, and the `gi_issue_requests` row is the lock.
   - A double click, or a retry with the same ID, never issues a second document.
   - A timeout keeps the lock. After 3 minutes the server first searches Morning, by type, date, amount and customer, and only then allows another attempt.
5. **Archive row (`documents`):**
   - `source='green_invoice'`, with number, date, amounts, PDF link and `extracted.green_invoice`.
   - `kind` mapping: 305 → `customer_invoice`, 320 → `customer_invoice_receipt`, 400/405 → `customer_receipt`, 330 → `customer_credit_note`, everything else → `other` with `green_invoice_type`.
   - The duplicate guard includes the Morning type when `kind='other'`.
   - Links to customer, supplier, order, delivery and payment.
   - A 305/320 issued from a delivery note is also written to the delivery note. A 400/320/405 issued from a payment is written to the payment.

## Form URL parameters
`/dashboard/green-invoice/documents/new?type=<code>&customer=<id>&supplier=<id>&delivery=<id>&order=<id>&quote=<id>&payment=<id>&link=<Morning document ID>`
- `delivery`: income rows from the delivery note's lines and the order's charges, the customer, the due date, and a suggested link to the delivery note's Morning invoice.
- `order` / `quote`: lines and charges, or the quote's lines.
- `payment`: one payment row (method, date, amount, cheque number or bank), plus a link to the invoices of the delivery notes the payment is allocated to.
- `link`: a Morning document to link to. Its label comes from the archive or from `GET /documents/{id}`.
- Without `type`: delivery or order → 305, quote → 10, payment → 400, supplier → 500.

## Not specified in the spec (decided here)
- Which field or row type applies to each document type. See the matrix; it is inferred.
- Which business type can issue which document. Only error 2403 says so. The assumption here: a VAT-exempt dealer (עוסק פטור) does not issue 305/320/330, and 405/410 are for non-profits / public-benefit companies (עמותה / חל״צ).
- Which document types may be future-dated. Only error 2405 says so. The assumption: a tax document cannot be in the future or earlier than the last document of its type (`lastDocumentDate`).
- The sign of the amounts in a credit note or a refund. They are sent as positive numbers.
- How discount and rounding are calculated.
- `copy`. It appears in the `DocumentLinkType` enum and error 2404, but the `linkType` field description lists only link and cancel.
- No idempotency key. Error 1010 is the only server-side guard, so the CRM keeps its own lock.
- Whether `client.id` together with other details overrides them. With an `id` the form sends only `id` and `emails`.
- Bank fields for a bank transfer. They are listed as required only for a cheque.
