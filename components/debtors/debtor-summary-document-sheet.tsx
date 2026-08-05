"use client";

import { forwardRef } from "react";
import { Heebo } from "next/font/google";

import "@/lib/orders/document-print.css";
import { BRAND_CONTACT, BRAND_NAME } from "@/lib/brand";
import type { DebtorPrintData } from "@/app/dashboard/debtors/actions";
import { formatIls, formatIssueDate } from "@/lib/db/format";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const DebtorSummaryDocumentSheet = forwardRef<
  HTMLDivElement,
  { data: DebtorPrintData }
>(function DebtorSummaryDocumentSheet({ data }, ref) {
  const subtotal = data.deliveries.reduce((s, d) => s + d.subtotal, 0);
  const vatAmount = data.deliveries.reduce((s, d) => s + d.vat_amount, 0);
  const total = data.deliveries.reduce((s, d) => s + d.total, 0);

  const deliveryRefs = data.deliveries
    .map((d) => `משלוח #${d.delivery_number} / הזמנה #${d.order_number}`)
    .join(" · ");

  return (
    <div
      ref={ref}
      id="debtor-summary-document-sheet"
      dir="rtl"
      lang="he"
      className={`ods-sheet ${heebo.className}`}
      aria-label="סיכום חוב ללקוח"
    >
      <div className="ods-accent" aria-hidden />

      <header className="ods-header">
        <p className="ods-brand">{BRAND_NAME}</p>
        <h1 className="ods-title">סיכום חוב לתשלום</h1>
        <p className="ods-order-num">{deliveryRefs}</p>

        <div className="ods-company">
          <p>
            <span className="ods-company-label">כתובת: </span>
            {BRAND_CONTACT.address}
          </p>
          <p>
            {BRAND_CONTACT.phones.map((p, i) => (
              <span key={p.number}>
                {i > 0 ? " · " : null}
                <span className="ods-company-label">{p.label}</span> {p.number}
              </span>
            ))}
          </p>
          <p>
            <span className="ods-company-label">מייל: </span>
            <span dir="ltr">{BRAND_CONTACT.email}</span>
          </p>
        </div>
      </header>

      <div className="ods-body">
        <div className="ods-meta-grid">
          <div className="ods-meta-card">
            <span className="ods-meta-label">לקוח</span>
            <span className="ods-meta-value">{data.customer_name}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">ח.פ / ת.ז</span>
            <span className="ods-meta-value">{data.customer_tax_id}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">טלפון</span>
            <span className="ods-meta-value">{data.customer_phone ?? "—"}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">תאריך הפקה</span>
            <span className="ods-meta-value">
              {formatIssueDate(new Date().toISOString())}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">מס׳ תעודות</span>
            <span className="ods-meta-value">{data.deliveries.length}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">סטטוס תשלום</span>
            <span className="ods-meta-value">לא שולם</span>
          </div>
        </div>

        <div className="ods-table-wrap">
          <table className="ods-table">
            <thead>
              <tr>
                <th className="ods-num">סכום</th>
                <th>הזמנה</th>
                <th>משלוח</th>
              </tr>
            </thead>
            <tbody>
              {data.deliveries.map((d) => (
                <tr key={d.delivery_id}>
                  <td className="ods-num ods-strong">{formatIls(d.total)}</td>
                  <td className="ods-num">#{d.order_number}</td>
                  <td className="ods-num">#{d.delivery_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ods-totals">
          <div className="ods-totals-row">
            <span className="ods-totals-label">סכום לפני מע״מ</span>
            <span className="ods-totals-value">{formatIls(subtotal)}</span>
          </div>
          <div className="ods-totals-row">
            <span className="ods-totals-label">מע״מ</span>
            <span className="ods-totals-value">{formatIls(vatAmount)}</span>
          </div>
          <div className="ods-totals-row ods-totals-grand">
            <span className="ods-totals-label">סה״כ לתשלום</span>
            <span className="ods-totals-value">{formatIls(total)}</span>
          </div>
        </div>

        <p className="ods-footer-note">
          מסמך סיכום חוב ממערכת ארגמן CRM ·{" "}
          {formatIssueDate(new Date().toISOString())}
        </p>
      </div>
    </div>
  );
});
