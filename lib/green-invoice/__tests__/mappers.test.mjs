// בדיקות למיפוי CRM → Morning. הרצה (Node 22.18+ עם type stripping):
//   node --test lib/green-invoice/__tests__/mappers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCreditNotePayload,
  buildExpensePayload,
  buildInvoicePayload,
  buildReceiptPayload,
  cleanEmails,
  deliveryLineToIncome,
  firstOfMonth,
  GiMappingError,
  incomeRowsTotal,
  normalizeClassifications,
  paymentLineToGi,
  pickClientMatch,
} from "../mappers.ts";

const TODAY = "2026-11-05";
const customer = {
  name: "אבני הגליל בע״מ",
  tax_id: "514000001",
  email: "office@galil.example",
  phone: "04-6000000",
  address: "הרצל 5, כרמיאל",
};
const lines = [
  {
    stone_name: "אבן ירושלמית",
    length_m: 1.2,
    width_m: 0.6,
    height_m: 0.03,
    quantity: 4,
    volume_m3: 0.0864,
    price_per_m3: 25000,
    line_subtotal: 2160,
    inventory_pricing_unit: "m3",
  },
  {
    stone_name: "בזלת",
    length_m: 0.4,
    width_m: 0.4,
    height_m: 0.02,
    quantity: 3,
    volume_m3: 0.0096,
    price_per_m3: 30000,
    line_subtotal: 288.01,
    inventory_pricing_unit: "m2",
  },
];
const charges = [
  { kind: "discount", description: "הנחת לקוח", amount: -100, sort_order: 2 },
  { kind: "shipping", description: "הובלה", amount: 300, sort_order: 1 },
  { kind: "other", description: "ריק", amount: 0, sort_order: 3 },
];
// 2160 + 288.01 + 300 - 100 = 2648.01 ; מע״מ 18% = 476.64 ; סה״כ 3124.65
const delivery = {
  delivery_number: 1000,
  order_number: 2000,
  status: "delivered",
  subtotal: 2648.01,
  vat_amount: 476.64,
  total: 3124.65,
  payment_due_date: "2026-12-05",
};

test("line → income: whole pieces when the line divides evenly", () => {
  const r = deliveryLineToIncome(lines[0], 0);
  assert.equal(r.quantity, 4);
  assert.equal(r.price, 540);
  assert.equal(r.vatType, 0);
  assert.match(r.description, /אבן ירושלמית · 120×60×3 ס״מ · 0\.0864 קו״ב/);
});

test("line → income: quantity 1 when cents do not divide", () => {
  const r = deliveryLineToIncome(lines[1], 0);
  assert.equal(r.quantity, 1);
  assert.equal(r.price, 288.01);
  assert.match(r.description, /3 יח׳/);
  assert.match(r.description, /0\.48 מ״ר/);
});

test("tax invoice 305: rows, VAT before-VAT rows, totals, email", () => {
  const b = buildInvoicePayload({
    type: 305,
    delivery,
    lines,
    charges,
    vatRate: 0.18,
    customer,
    clientId: "cli-1",
    emails: ["Office@galil.example", "bad", "office@galil.example"],
    today: TODAY,
  });
  const p = b.payload;
  assert.equal(p.type, 305);
  assert.equal(p.vatType, 0);
  assert.equal(p.lang, "he");
  assert.equal(p.currency, "ILS");
  assert.equal(p.date, TODAY);
  assert.equal(p.dueDate, "2026-12-05");
  assert.deepEqual(p.client, { id: "cli-1", emails: ["office@galil.example"] });
  assert.equal(p.attachment, true);
  assert.equal(p.payment, undefined);
  assert.equal(p.income.length, 4); // 2 stones + shipping + discount (zero charge skipped)
  assert.ok(p.income.every((r) => r.vatType === 0 && r.currency === "ILS"));
  assert.equal(p.income[2].description, "הובלה");
  assert.equal(p.income[3].price, -100);
  assert.equal(p.income[0].vatRate, undefined);
  assert.equal(incomeRowsTotal(p.income), 2648.01);
  assert.equal(b.amountBeforeVat, 2648.01);
  assert.equal(b.vatAmount, 476.64);
  assert.equal(b.amountTotal, 3124.65);
  for (const r of p.income) {
    for (const k of ["description", "quantity", "price", "currency", "vatType"]) assert.ok(k in r, k);
  }
});

test("305 without email → client {id} only and attachment false", () => {
  const b = buildInvoicePayload({ type: 305, delivery, lines, charges, vatRate: 0.18, customer, clientId: "c", emails: null, today: TODAY });
  assert.deepEqual(b.payload.client, { id: "c" });
  assert.equal(b.payload.attachment, false);
});

test("mismatch between rows and delivery subtotal is refused", () => {
  assert.throws(
    () => buildInvoicePayload({ type: 305, delivery: { ...delivery, subtotal: 2700 }, lines, charges, vatRate: 0.18, customer, clientId: "c", emails: null, today: TODAY }),
    GiMappingError
  );
});

test("cancelled delivery refused", () => {
  assert.throws(
    () => buildInvoicePayload({ type: 305, delivery: { ...delivery, status: "cancelled" }, lines, charges, vatRate: 0.18, customer, clientId: "c", emails: null, today: TODAY }),
    /מבוטלת/
  );
});

test("invoice-receipt 320 requires payments = total", () => {
  const pays = [
    { date: "2026-11-01", method: "check", amount: 2000, reference: "0004512", bank_name: "הפועלים", bank_branch: "600", bank_account: "123456", label: "תשלום 1000" },
    { date: "2026-11-03", method: "bank_transfer", amount: 1124.65, reference: "TR-9", bank_name: null, label: "תשלום 1001" },
  ];
  const b = buildInvoicePayload({ type: 320, delivery, lines, charges, vatRate: 0.18, customer, clientId: "c", emails: null, payments: pays, today: TODAY });
  assert.equal(b.payload.type, 320);
  assert.equal(b.payload.dueDate, undefined);
  assert.deepEqual(b.payload.payment[0], {
    date: "2026-11-01", type: 2, price: 2000, currency: "ILS",
    chequeNum: "0004512", bankName: "הפועלים", bankBranch: "600", bankAccount: "123456",
  });
  assert.deepEqual(b.payload.payment[1], { date: "2026-11-03", type: 4, price: 1124.65, currency: "ILS" });
  assert.throws(
    () => buildInvoicePayload({ type: 320, delivery, lines, charges, vatRate: 0.18, customer, clientId: "c", emails: null, payments: [pays[0]], today: TODAY }),
    /אינו שווה/
  );
});

test("payment method mapping and validation", () => {
  const base = { date: "2026-11-01", amount: 10, reference: null, bank_name: null, label: "ת" };
  assert.equal(paymentLineToGi({ ...base, method: "cash" }, TODAY).type, 1);
  assert.equal(paymentLineToGi({ ...base, method: "bank_transfer" }, TODAY).type, 4);
  const cc = paymentLineToGi({ ...base, method: "credit_card", reference: "4580" }, TODAY);
  assert.deepEqual(cc, { date: "2026-11-01", type: 3, price: 10, currency: "ILS", cardType: 0, dealType: 1, numPayments: 1, cardNum: "4580" });
  assert.throws(() => paymentLineToGi({ ...base, method: "other" }, TODAY), /אחר/);
  assert.throws(() => paymentLineToGi({ ...base, method: "check", bank_name: "לאומי" }, TODAY), /מספר צ׳ק/);
  assert.throws(() => paymentLineToGi({ ...base, method: "cash", date: "2026-11-06" }, TODAY), /עתידי/);
});

test("receipt 400 linked to invoices", () => {
  const b = buildReceiptPayload({
    paymentNumber: 1000,
    payment: { date: "2026-11-01", method: "cash", amount: 1500, reference: null, bank_name: null, label: "תשלום 1000" },
    customer,
    clientId: "c",
    linkedInvoiceIds: ["inv-1", "inv-1", "inv-2"],
    deliveryNumbers: [1000, 1001],
    emails: null,
    today: TODAY,
  });
  const p = b.payload;
  assert.equal(p.type, 400);
  assert.deepEqual(p.linkedDocumentIds, ["inv-1", "inv-2"]);
  assert.equal(p.linkType, "link");
  assert.deepEqual(p.income, []);
  assert.equal(p.payment.length, 1);
  assert.equal(p.payment[0].price, 1500);
  assert.match(p.remarks, /1000, 1001/);
  const unlinked = buildReceiptPayload({
    paymentNumber: 1, payment: { date: "2026-11-01", method: "cash", amount: 5, reference: null, bank_name: null, label: "x" },
    customer, clientId: "c", linkedInvoiceIds: [], deliveryNumbers: [], emails: null, today: TODAY,
  });
  assert.equal(unlinked.payload.linkType, undefined);
  assert.equal(unlinked.payload.linkedDocumentIds, undefined);
});

test("credit note 330 cancels the original", () => {
  const b = buildCreditNotePayload({
    originalGreenInvoiceId: "inv-9", originalNumber: "40034", delivery, lines, charges, vatRate: 0.18,
    customer, clientId: "c", reason: "טעות במחיר", today: TODAY,
  });
  assert.equal(b.payload.type, 330);
  assert.equal(b.payload.linkType, "cancel");
  assert.deepEqual(b.payload.linkedDocumentIds, ["inv-9"]);
  assert.ok(b.payload.income.every((r) => r.vatType === 0));
  assert.equal(b.amountTotal, 3124.65);
  assert.match(b.payload.remarks, /40034/);
  assert.throws(() => buildCreditNotePayload({ originalGreenInvoiceId: "x", delivery, lines, charges, vatRate: 0.18, customer, clientId: "c", reason: " " }), /סיבה/);
});

test("exempt VAT rate → row vatType 2 and document vatType 1", () => {
  const d0 = { ...delivery, vat_amount: 0, total: 2648.01 };
  const b = buildInvoicePayload({ type: 305, delivery: d0, lines, charges, vatRate: 0, customer, clientId: "c", emails: null, today: TODAY });
  assert.equal(b.payload.vatType, 1);
  assert.ok(b.payload.income.every((r) => r.vatType === 2));
});

test("preview without client id sends inline client details (no add)", () => {
  const b = buildInvoicePayload({ type: 305, delivery, lines, charges, vatRate: 0.18, customer, clientId: null, emails: null, today: TODAY });
  assert.deepEqual(b.payload.client, { name: customer.name, taxId: "514000001", address: customer.address, phone: customer.phone, country: "IL" });
});

test("client match by tax id (search has no taxId filter)", () => {
  const items = [
    { id: "a", name: "אבני הגליל", taxId: "999" },
    { id: "b", name: "אבני הגליל בע״מ", taxId: "0514000001", active: false },
    { id: "c", name: "אבני הגליל בע״מ", taxId: "514000001" },
  ];
  assert.equal(pickClientMatch(items, customer), "c");
  assert.equal(pickClientMatch([{ id: "a", name: "x", taxId: "1" }], customer), null);
  assert.equal(pickClientMatch([{ id: "z", name: "לקוח" }], { ...customer, name: "לקוח", tax_id: "" }), "z");
});

test("expense payload", () => {
  const exp = {
    document_type: 305, document_number: "SI-2231", expense_date: "2026-10-20", reporting_month: null,
    amount_total: 14160, amount_before_vat: 12000, vat_amount: null, currency: "ILS",
    is_paid: true, payment_method: "bank_transfer", description: null, notes: "הערה",
  };
  const sup = { name: "מחצבת הגליל", tax_id: "513000002", email: null, phone: null, address: null, green_invoice_supplier_id: null };
  const cls = { id: "cls-1", key: "1310", code: "1300", title: "עבודות חוץ" };
  const p = buildExpensePayload({ expense: exp, supplier: sup, classification: cls, fallbackDescription: "רכש אבן", today: TODAY });
  assert.equal(p.documentType, 305);
  assert.equal(p.number, "SI-2231");
  assert.equal(p.reportingDate, "2026-10-01");
  assert.equal(p.vat, 2160);
  assert.equal(p.amount, 14160);
  assert.equal(p.paymentType, 4);
  assert.equal(p.description, "רכש אבן");
  assert.deepEqual(p.supplier, { name: "מחצבת הגליל", country: "IL", taxId: "513000002", add: true });
  assert.deepEqual(p.accountingClassification, cls);
  const p2 = buildExpensePayload({ expense: { ...exp, is_paid: false, reporting_month: "2026-11-01" }, supplier: { ...sup, green_invoice_supplier_id: "sup-1" }, classification: { id: "x" }, today: TODAY });
  assert.equal(p2.paymentType, -1);
  assert.equal(p2.reportingDate, "2026-11-01");
  assert.equal(p2.supplier.id, "sup-1");
  assert.equal(p2.supplier.add, undefined);
  for (const k of ["documentType", "number", "date", "reportingDate", "supplier", "accountingClassification"]) assert.ok(k in p, k);
  assert.throws(() => buildExpensePayload({ expense: { ...exp, document_number: "" }, supplier: sup, classification: cls, today: TODAY }), /מספר מסמך/);
  assert.throws(() => buildExpensePayload({ expense: exp, supplier: null, classification: cls, today: TODAY }), /ספק/);
});

test("helpers", () => {
  assert.equal(firstOfMonth("2026-02-17"), "2026-02-01");
  assert.deepEqual(cleanEmails(["a@b.co, c@d.co; a@b.co", "x", "e@f.co", "g@h.co"]), ["a@b.co", "c@d.co", "e@f.co"]);
  const cls = normalizeClassifications({
    expenses: [{ id: "2", title: "דלק", code: "2000" }, { id: "1", title: "שכירות", code: "1000", children: [{ id: "3", title: "משנה", code: "1100" }] }],
    other: { id: "2", title: "כפול" },
  });
  assert.deepEqual(cls.map((c) => c.id), ["1", "3", "2"]);
});
