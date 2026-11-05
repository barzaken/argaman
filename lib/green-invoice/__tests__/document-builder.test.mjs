// בדיקות לבונה מסמכי Morning — כל סוגי המסמכים. הרצה (Node 22.18+ עם type stripping):
//   node --test lib/green-invoice/__tests__/document-builder.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// הקבצים מייבאים זה את זה בלי סיומת (כמו בשאר הפרויקט) — משלימים ".ts" בזמן הבדיקה
register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (e) {
    if (specifier.startsWith(".") && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + ".ts", context);
    throw e;
  }
}`),
  import.meta.url
);

const T = await import("../document-types.ts");
const B = await import("../document-builder.ts");
const { GI_DOC_TYPES, GI_DOC_TYPE_DEFS } = T;
const { buildDocumentPayload, computeTotals, emptyDocumentModel, fillPaymentsToTotal, adaptModelToType, validateDocumentModel } = B;

const TODAY = "2026-11-05";
const client = { name: "אבני הגליל בע״מ", taxId: "514000001", emails: ["office@galil.example"], country: "IL" };

/** מודל תקין מינימלי לכל סוג */
function validModel(type) {
  const def = GI_DOC_TYPE_DEFS[type];
  const m = emptyDocumentModel(type, TODAY);
  m.client = { ...client };
  if (def.income === "required") m.income = [{ description: "אבן גליל 2×1", quantity: 2, price: 500, vatType: 0 }];
  if (def.payment !== "forbidden") {
    m.payment = [{ type: 1, date: TODAY, price: m.income.length ? 1180 : 700 }];
  }
  if (type === 330 || type === 410) {
    m.linkedDocumentIds = ["57ae2ff9-0c24-43e8-b39c-a5bdcc05573d"];
    m.linkType = "cancel";
  }
  return m;
}

test("כל 15 הסוגים מוגדרים, עם שם עברי וכללים", () => {
  assert.deepEqual([...GI_DOC_TYPES], [10, 20, 100, 200, 210, 300, 305, 320, 330, 400, 405, 410, 500, 600, 610]);
  for (const t of GI_DOC_TYPES) {
    const d = GI_DOC_TYPE_DEFS[t];
    assert.equal(d.type, t);
    assert.match(d.name, /[א-ת]/);
    assert.equal(d.fields.lang, "required");
    assert.equal(d.fields.currency, "required");
    assert.equal(d.fields.vatType, "required");
    assert.ok(d.linkTypes.includes(d.defaultLinkType));
  }
});

for (const type of [10, 20, 100, 200, 210, 300, 305, 320, 330, 400, 405, 410, 500, 600, 610]) {
  test(`סוג ${type}: מודל תקין נבנה לבקשה עם השדות הנכונים בלבד`, () => {
    const def = GI_DOC_TYPE_DEFS[type];
    const m = validModel(type);
    m.dueDate = "2026-12-01";
    m.discount = { amount: 0, type: "sum" };
    const r = buildDocumentPayload(m, { today: TODAY });
    assert.equal(r.ok, true, JSON.stringify(r.issues));
    const p = r.payload;
    assert.equal(p.type, type);
    assert.equal(p.lang, "he");
    assert.equal(p.currency, "ILS");
    assert.equal(p.vatType, 0);
    assert.ok(Array.isArray(p.income), "income תמיד נשלח (required בסכמה)");
    assert.equal(p.client.name, client.name);
    assert.equal(p.client.add, undefined);
    if (def.fields.dueDate === "forbidden") assert.equal(p.dueDate, undefined);
    else assert.equal(p.dueDate, "2026-12-01");
    if (def.payment === "forbidden") assert.equal(p.payment, undefined);
    else assert.equal(p.payment.length, 1);
    if (def.income === "forbidden") assert.deepEqual(p.income, []);
    if (type === 330 || type === 410) {
      assert.equal(p.linkType, "cancel");
      assert.equal(p.linkedDocumentIds.length, 1);
    }
    assert.equal(p.signed, true);
    assert.equal(p.attachment, true);
  });

  test(`סוג ${type}: שדות חובה חסרים → שגיאות בעברית`, () => {
    const def = GI_DOC_TYPE_DEFS[type];
    const m = emptyDocumentModel(type, TODAY);
    m.client = { name: "" };
    m.income = def.income === "required" ? [] : m.income;
    m.payment = def.payment === "required" ? [] : m.payment;
    const issues = validateDocumentModel(m, { today: TODAY });
    const paths = issues.map((i) => i.path);
    assert.ok(paths.includes("client.name"));
    if (def.income === "required") assert.ok(paths.includes("income"), "חסרה שורת הכנסה");
    if (def.payment === "required") assert.ok(paths.includes("payment"), "חסר תקבול");
    for (const i of issues) assert.match(i.message, /[א-ת]/);
  });
}

test("חישוב מע״מ: 0 = לפני מע״מ, 1 = כולל, 2 = פטור (מסמך מעורב)", () => {
  const m = validModel(305);
  m.vatType = 2;
  m.income = [
    { description: "א", quantity: 2, price: 500, vatType: 0 },
    { description: "ב", quantity: 1, price: 1180, vatType: 1 },
    { description: "ג", quantity: 1, price: 100, vatType: 2 },
  ];
  const t = computeTotals(m, 0.18);
  assert.equal(t.taxable, 2000);
  assert.equal(t.exempt, 100);
  assert.equal(t.vat, 360);
  assert.equal(t.total, 2460);
});

test("מסמך פטור (vatType 1): אין מע״מ והשורות נשלחות כפטורות", () => {
  const m = validModel(305);
  m.vatType = 1;
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.equal(r.ok, true);
  assert.equal(r.totals.vat, 0);
  assert.equal(r.totals.total, 1000);
  assert.equal(r.payload.income[0].vatType, 2);
});

test("מסמך רגיל עם שורה פטורה → דורש מעורב", () => {
  const m = validModel(305);
  m.income[0].vatType = 2;
  const issues = validateDocumentModel(m, { today: TODAY });
  assert.ok(issues.some((i) => i.path === "income.0.vatType" && /מעורב/.test(i.message)));
});

test("הנחה בסכום ובאחוזים מופחתת לפני מע״מ; עיגול לשקל", () => {
  const m = validModel(305);
  m.discount = { amount: 100, type: "sum" };
  let t = computeTotals(m, 0.18);
  assert.equal(t.beforeVat, 900);
  assert.equal(t.vat, 162);
  assert.equal(t.total, 1062);
  m.discount = { amount: "10", type: "percentage" };
  t = computeTotals(m, 0.18);
  assert.equal(t.total, 1062);
  m.discount = null;
  m.income = [{ description: "x", quantity: 1, price: 99.99, vatType: 0 }];
  m.rounding = true;
  t = computeTotals(m, 0.18);
  assert.equal(t.total, 118);
  assert.equal(t.rounding, 0.01);
  const r = buildDocumentPayload({ ...m, discount: { amount: 5, type: "percentage" } }, { today: TODAY });
  assert.deepEqual(r.payload.discount, { amount: 5, type: "percentage" });
  assert.equal(r.payload.rounding, true);
});

test("320: סכום התקבולים חייב להיות שווה לסה״כ; 'מלא לפי הסה״כ' מתקן", () => {
  const m = validModel(320);
  m.payment = [{ type: 1, date: TODAY, price: 1000 }];
  let issues = validateDocumentModel(m, { today: TODAY });
  assert.ok(issues.some((i) => i.path === "payment" && /אינו שווה/.test(i.message)));
  m.payment = fillPaymentsToTotal(m, { today: TODAY });
  assert.equal(m.payment[0].price, 1180);
  issues = validateDocumentModel(m, { today: TODAY });
  assert.deepEqual(issues, []);
  const empty = { ...m, payment: [] };
  const filled = fillPaymentsToTotal(empty, { today: TODAY });
  assert.equal(filled.length, 1);
  assert.equal(filled[0].type, 4);
  assert.equal(filled[0].price, 1180);
});

test("400 קבלה: בלי שורות הכנסה הסה״כ = התקבולים; עם שורות — חייבים להתאים", () => {
  const m = validModel(400);
  m.linkedDocumentIds = ["inv-1"];
  m.linkType = "link";
  m.payment = [
    { type: 2, date: TODAY, price: 700, chequeNum: "10002", bankName: "12", bankBranch: "600", bankAccount: "123456" },
    { type: 4, date: "2026-11-04", price: 480, bankName: "10" },
  ];
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual(r.payload.income, []);
  assert.equal(r.totals.documentAmount, 1180);
  assert.equal(r.payload.payment[0].chequeNum, "10002");
  assert.equal(r.payload.payment[1].bankName, "10");
  assert.equal(r.payload.payment[1].chequeNum, undefined);
  assert.equal(r.payload.linkType, "link");
  m.income = [{ description: "תשלום", quantity: 1, price: 100, vatType: 0 }];
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => i.path === "payment"));
});

test("שדות תקבול לכל אמצעי תשלום ושגיאות", () => {
  const m = validModel(400);
  m.payment = [
    { type: 2, date: TODAY, price: 100 },
    { type: 3, date: TODAY, price: 100, cardType: "2", cardNum: "12345", dealType: 2, numPayments: 40 },
    { type: 11, date: TODAY, price: 100 },
    { type: 1, date: "2099-01-01", price: 0 },
  ];
  const issues = validateDocumentModel(m, { today: TODAY });
  const paths = issues.map((i) => i.path);
  for (const p of ["payment.0.chequeNum", "payment.0.bankName", "payment.0.bankBranch", "payment.0.bankAccount",
    "payment.1.cardNum", "payment.1.numPayments", "payment.2.subType", "payment.3.date", "payment.3.price"]) {
    assert.ok(paths.includes(p), `חסרה שגיאה ל-${p}`);
  }
  m.payment = [
    { type: 3, date: TODAY, price: 50, cardType: "2", cardNum: "8765", dealType: "2", numPayments: "3", firstPayment: "20", chequeNum: "x" },
    { type: 10, date: TODAY, price: 50, appType: "1", accountId: "a", transactionId: "t" },
    { type: 11, date: TODAY, price: 50, subType: "4" },
    { type: 5, date: TODAY, price: 50, transactionId: "pp" },
    { type: 0, date: TODAY, price: 20 },
  ];
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual(r.payload.payment[0], { date: TODAY, type: 3, price: 50, currency: "ILS", cardType: 2, cardNum: "8765", dealType: 2, numPayments: 3, firstPayment: 20 });
  assert.equal(r.payload.payment[1].appType, 1);
  assert.equal(r.payload.payment[2].subType, 4);
  assert.equal(r.payload.payment[3].transactionId, "pp");
});

test("ניכוי במקור בלבד → שגיאה 2428", () => {
  const m = validModel(400);
  m.payment = [{ type: 0, date: TODAY, price: 100 }];
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => /ניכוי במקור/.test(i.message)));
});

test("תאריך עתידי: אסור במסמך מס, מותר בהצעת מחיר; לא לפני המסמך האחרון", () => {
  const inv = validModel(305);
  inv.date = "2026-12-01";
  assert.ok(validateDocumentModel(inv, { today: TODAY }).some((i) => i.path === "date"));
  inv.date = "2026-11-01";
  assert.ok(validateDocumentModel(inv, { today: TODAY, lastDocumentDate: "2026-11-03" }).some((i) => i.path === "date"));
  const q = validModel(10);
  q.date = "2026-12-01";
  assert.deepEqual(validateDocumentModel(q, { today: TODAY }), []);
});

test("לקוח: id → רק id + מיילים; אד-הוק עם add; self רק ב-305; עד 3 מיילים", () => {
  const m = validModel(305);
  m.client = { id: "c-1", name: "x", emails: ["a@b.co", "bad"] };
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => i.path === "client.emails"));
  m.client.emails = ["a@b.co"];
  let r = buildDocumentPayload(m, { today: TODAY });
  assert.deepEqual(r.payload.client, { id: "c-1", emails: ["a@b.co"] });
  m.client = { name: "חדש", taxId: "123", add: true, self: true, city: "חיפה", emails: [] };
  r = buildDocumentPayload(m, { today: TODAY });
  assert.deepEqual(r.payload.client, { name: "חדש", taxId: "123", city: "חיפה", country: "IL", add: true, self: true });
  assert.equal(r.payload.attachment, false, "אין מייל → בלי צירוף");
  const rec = validModel(400);
  rec.client.self = true;
  assert.ok(validateDocumentModel(rec, { today: TODAY }).some((i) => i.path === "client.self"));
  m.client = { name: "x", emails: ["a@a.co", "b@b.co", "c@c.co", "d@d.co"] };
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => i.path === "client.emails"));
});

test("מסמך לא חתום לא נשלח במייל (2427)", () => {
  const m = validModel(305);
  m.signed = false;
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => i.path === "signed"));
});

test("קישורים: linkType חייב להתאים לסוג; ברירת מחדל לפי הסוג", () => {
  const m = validModel(305);
  m.linkedDocumentIds = ["a"];
  m.linkType = "cancel";
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => i.path === "linkType"));
  m.linkType = "";
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.equal(r.payload.linkType, "link");
  const cn = validModel(330);
  cn.linkType = "";
  assert.equal(buildDocumentPayload(cn, { today: TODAY }).payload.linkType, "cancel");
  const bad = validModel(305);
  bad.linkType = "link";
  assert.ok(validateDocumentModel(bad, { today: TODAY }).some((i) => i.path === "linkType"));
});

test("linkedPaymentId ובקשת תשלום רק בסוגים שמאפשרים", () => {
  const m = validModel(305);
  m.linkedPaymentId = "pay-1";
  m.paymentRequest = { enabled: true, plugins: [{ id: "p1", group: 100, type: 12100 }], maxPayments: "3" };
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.equal(r.payload.linkedPaymentId, "pay-1");
  assert.deepEqual(r.payload.paymentRequestData, { plugins: [{ id: "p1", group: 100, type: 12100 }], maxPayments: 3 });
  const rec = validModel(400);
  rec.linkedPaymentId = "pay-1";
  assert.ok(validateDocumentModel(rec, { today: TODAY }).some((i) => i.path === "linkedPaymentId"));
});

test("הרשאות: סוכן לא מפיק 330 / 610 / 410 (תצוגה מקדימה מותרת)", () => {
  for (const t of [330, 610, 410]) {
    const m = validModel(t);
    assert.ok(validateDocumentModel(m, { today: TODAY, role: "agent" }).some((i) => i.path === "type"));
    assert.ok(!validateDocumentModel(m, { today: TODAY, role: "agent", forPreview: true }).some((i) => i.path === "type"));
    assert.deepEqual(validateDocumentModel(m, { today: TODAY, role: "admin" }), []);
  }
  assert.deepEqual(validateDocumentModel(validModel(305), { today: TODAY, role: "agent" }), []);
});

test("מטבע זר: שער המרה נכנס לשורות ולתקבולים", () => {
  const m = validModel(320);
  m.currency = "USD";
  m.currencyRate = "3.7";
  m.payment = [{ type: 4, date: TODAY, price: 1180 }];
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(r.payload.income[0].currency, "USD");
  assert.equal(r.payload.income[0].currencyRate, 3.7);
  assert.equal(r.payload.payment[0].currencyRate, 3.7);
  m.currencyRate = "0";
  assert.ok(validateDocumentModel(m, { today: TODAY }).some((i) => i.path === "currencyRate"));
});

test("שורות הכנסה: תיאור, כמות, מחיר, שיעור מע״מ", () => {
  const m = validModel(305);
  m.income = [{ description: " ", quantity: 0, price: "", vatType: 0, vatRate: "18" }];
  const paths = validateDocumentModel(m, { today: TODAY }).map((i) => i.path);
  for (const p of ["income.0.description", "income.0.quantity", "income.0.price", "income.0.vatRate", "total"]) assert.ok(paths.includes(p), p);
  m.income = [{ description: "x", quantity: "1,000", price: "2.5", vatType: 0, vatRate: "0.17", catalogNum: "SKU-1", itemId: "it-1" }];
  const r = buildDocumentPayload(m, { today: TODAY });
  assert.deepEqual(r.payload.income[0], { description: "x", quantity: 1000, price: 2.5, currency: "ILS", vatType: 0, vatRate: 0.17, catalogNum: "SKU-1", itemId: "it-1" });
  assert.equal(r.totals.vat, 425);
});

test("החלפת סוג מנקה שדות שלא חלים ומוסיפה שורות חובה", () => {
  const m = validModel(305);
  m.dueDate = "2026-12-01";
  m.discount = { amount: 5, type: "sum" };
  m.client.self = true;
  const r = adaptModelToType(m, 600, TODAY);
  assert.equal(r.dueDate, "");
  assert.equal(r.discount, null);
  assert.equal(r.client.self, false);
  assert.deepEqual(r.income, []);
  assert.equal(r.payment.length, 1);
  const back = adaptModelToType(r, 330, TODAY);
  assert.deepEqual(back.payment, []);
  assert.equal(back.income.length, 1);
});
