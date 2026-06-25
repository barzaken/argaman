"use client";

import { forwardRef } from "react";
import { Heebo } from "next/font/google";

import "@/lib/orders/document-print.css";
import { BRAND_CONTACT, BRAND_NAME } from "@/lib/brand";
import type { QuoteItemViewRow, QuoteViewRow } from "@/lib/db/types";
import {
  formatAreaM2,
  formatDimensionsCmFromMeters,
  formatIls,
  formatIssueDate,
  formatVolumeM3,
} from "@/lib/db/format";

export type QuoteDocumentCustomer = {
  tax_id: string;
  address: string | null;
  phone: string | null;
};

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const quoteStatusLabels: Record<QuoteViewRow["status"], string> = {
  open: "פתוחה",
  converted: "הומרה להזמנה",
  cancelled: "בוטלה",
};

export const QuoteDocumentSheet = forwardRef<
  HTMLDivElement,
  {
    quote: QuoteViewRow;
    customer: QuoteDocumentCustomer;
    lines: QuoteItemViewRow[];
  }
>(function QuoteDocumentSheet({ quote, customer, lines }, ref) {
  const totalVolumeM3 = lines
    .filter((ln) => (ln.pricing_unit ?? "m3") === "m3")
    .reduce((sum, ln) => sum + Number(ln.volume_m3), 0);

  const totalAreaM2 = lines
    .filter((ln) => ln.pricing_unit === "m2")
    .reduce((sum, ln) => sum + Number(ln.area_m2), 0);

  return (
    <div
      ref={ref}
      id="quote-document-sheet"
      dir="rtl"
      lang="he"
      className={`ods-sheet ${heebo.className}`}
      aria-label="הצעת מחיר"
    >
      <div className="ods-accent" aria-hidden />

      <header className="ods-header">
        <p className="ods-brand">{BRAND_NAME}</p>
        <h1 className="ods-title">הצעת מחיר</h1>
        <p className="ods-order-num">הצעה מס׳ {quote.quote_number}</p>

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
            <span className="ods-meta-value">{quote.customer_name}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">ח.פ / ת.ז</span>
            <span className="ods-meta-value">{customer.tax_id}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">כתובת לקוח</span>
            <span className="ods-meta-value">{customer.address ?? "—"}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">טלפון לקוח</span>
            <span className="ods-meta-value">
              {customer.phone ?? quote.customer_phone ?? "—"}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">תאריך הנפקה</span>
            <span className="ods-meta-value">
              {formatIssueDate(quote.created_at)}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">תוקף</span>
            <span className="ods-meta-value">
              {quote.valid_until
                ? formatIssueDate(quote.valid_until)
                : "—"}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">סטטוס</span>
            <span className="ods-meta-value">
              {quoteStatusLabels[quote.status]}
            </span>
          </div>
        </div>

        <div className="ods-table-wrap">
          <table className="ods-table">
            <thead>
              <tr>
                <th className="ods-num">סכום שורה</th>
                <th className="ods-num">מחיר לקו״ב</th>
                <th className="ods-num">נפח/שטח</th>
                <th className="ods-num">כמות</th>
                <th>מידות</th>
                <th>סוג אבן</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => {
                const unit = ln.pricing_unit ?? "m3";
                return (
                  <tr key={ln.id}>
                    <td className="ods-num ods-strong">
                      {formatIls(Number(ln.line_subtotal))}
                    </td>
                    <td className="ods-num">
                      {unit === "m2" ? (
                        <>
                          {formatIls(Number(ln.price_per_m2))}
                          <span className="ods-unit"> /מ״ר</span>
                        </>
                      ) : unit === "unit" ? (
                        <>
                          {formatIls(Number(ln.price_per_unit))}
                          <span className="ods-unit"> /יח׳</span>
                        </>
                      ) : (
                        formatIls(Number(ln.price_per_m3))
                      )}
                    </td>
                    <td className="ods-num">
                      {unit === "m2" ? (
                        <>
                          {formatAreaM2(Number(ln.area_m2))}
                          <span className="ods-unit"> מ״ר</span>
                        </>
                      ) : unit === "unit" ? (
                        <>
                          {ln.quantity}
                          <span className="ods-unit"> יח׳</span>
                        </>
                      ) : (
                        formatVolumeM3(Number(ln.volume_m3))
                      )}
                    </td>
                    <td className="ods-num">{ln.quantity}</td>
                    <td>
                      {formatDimensionsCmFromMeters(
                        Number(ln.length_m),
                        Number(ln.width_m),
                        Number(ln.height_m)
                      )}
                    </td>
                    <td>{ln.stone_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ods-totals">
          {totalVolumeM3 > 0 ? (
            <div className="ods-totals-row">
              <span className="ods-totals-label">סה״כ אבן בקו״ב</span>
              <span className="ods-totals-value">
                {formatVolumeM3(totalVolumeM3)} קו״ב
              </span>
            </div>
          ) : null}
          {totalAreaM2 > 0 ? (
            <div className="ods-totals-row">
              <span className="ods-totals-label">סה״כ אבן במ״ר</span>
              <span className="ods-totals-value">
                {formatAreaM2(totalAreaM2)} מ״ר
              </span>
            </div>
          ) : null}
          <div className="ods-totals-row">
            <span className="ods-totals-label">סכום לפני מע״מ</span>
            <span className="ods-totals-value">
              {formatIls(quote.subtotal)}
            </span>
          </div>
          <div className="ods-totals-row">
            <span className="ods-totals-label">מע״מ</span>
            <span className="ods-totals-value">
              {formatIls(quote.vat_amount)}
            </span>
          </div>
          <div className="ods-totals-row ods-totals-grand">
            <span className="ods-totals-label">סה״כ כולל מע״מ</span>
            <span className="ods-totals-value">{formatIls(quote.total)}</span>
          </div>
        </div>

        {quote.notes ? (
          <p className="ods-footer-note">הערות: {quote.notes}</p>
        ) : null}

        <p className="ods-footer-note">
          מסמך זה הופק ממערכת ארגמן CRM · {formatIssueDate(quote.created_at)}
        </p>
      </div>
    </div>
  );
});
