"use client";

import { forwardRef } from "react";
import { Heebo } from "next/font/google";

import "@/lib/orders/document-print.css";
import { BRAND_CONTACT, BRAND_NAME } from "@/lib/brand";
import type { OrderItemViewRow, OrderViewRow } from "@/lib/db/types";
import {
  formatAreaM2,
  formatDimensionsCmFromMeters,
  formatIls,
  formatIssueDate,
  formatVolumeM3,
} from "@/lib/db/format";

function lineAreaM2(ln: OrderItemViewRow): number {
  return Number(ln.length_m) * Number(ln.width_m) * Number(ln.quantity);
}

function linePricePerM2(ln: OrderItemViewRow): number {
  return Number(ln.price_per_m3) * Number(ln.height_m);
}

export type OrderDocumentCustomer = {
  tax_id: string;
  address: string | null;
  phone: string | null;
};

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const orderStatusLabels: Record<OrderViewRow["status"], string> = {
  open: "פתוחה",
  in_production: "בייצור",
  ready_for_delivery: "מוכנה למשלוח",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

export const OrderDocumentSheet = forwardRef<
  HTMLDivElement,
  {
    order: OrderViewRow;
    customer: OrderDocumentCustomer;
    lines: OrderItemViewRow[];
  }
>(function OrderDocumentSheet({ order, customer, lines }, ref) {
  return (
    <div
      ref={ref}
      id="order-document-sheet"
      dir="rtl"
      lang="he"
      className={`ods-sheet ${heebo.className}`}
      aria-label="תעודת הזמנה"
    >
      <div className="ods-accent" aria-hidden />

      <header className="ods-header">
        <p className="ods-brand">{BRAND_NAME}</p>
        <h1 className="ods-title">תעודת הזמנה</h1>
        <p className="ods-order-num">הזמנה מס׳ {order.order_number}</p>

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
            <span className="ods-meta-value">{order.customer_name}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">ח.פ / ת.ז</span>
            <span className="ods-meta-value">{customer.tax_id}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">כתובת לקוח</span>
            <span className="ods-meta-value">
              {customer.address ?? "—"}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">טלפון לקוח</span>
            <span className="ods-meta-value">
              {customer.phone ?? order.customer_phone ?? "—"}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">תאריך הנפקה</span>
            <span className="ods-meta-value">
              {formatIssueDate(order.created_at)}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">סטטוס</span>
            <span className="ods-meta-value">
              {orderStatusLabels[order.status]}
            </span>
          </div>
        </div>

        <div className="ods-table-wrap">
          <table className="ods-table">
            <thead>
              <tr>
                <th>אבן</th>
                <th>מידות (ס״מ)</th>
                <th className="ods-num">כמות</th>
                <th className="ods-num">נפח / שטח</th>
                <th className="ods-num">מחיר לקו״ב / למ״ר</th>
                <th className="ods-num">סכום שורה</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => {
                const isM2 = (ln.inventory_pricing_unit ?? "m3") === "m2";

                return (
                  <tr key={ln.id}>
                    <td>{ln.stone_name}</td>
                    <td>
                      {formatDimensionsCmFromMeters(
                        Number(ln.length_m),
                        Number(ln.width_m),
                        Number(ln.height_m)
                      )}
                    </td>
                    <td className="ods-num">{ln.quantity}</td>
                    <td className="ods-num">
                      {isM2 ? (
                        <>
                          {formatAreaM2(lineAreaM2(ln))}
                          <span className="ods-unit"> מ״ר</span>
                        </>
                      ) : (
                        formatVolumeM3(Number(ln.volume_m3))
                      )}
                    </td>
                    <td className="ods-num">
                      {isM2 ? (
                        <>
                          {formatIls(linePricePerM2(ln))}
                          <span className="ods-unit"> /מ״ר</span>
                        </>
                      ) : (
                        formatIls(Number(ln.price_per_m3))
                      )}
                    </td>
                    <td className="ods-num ods-strong">
                      {formatIls(Number(ln.line_subtotal))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ods-totals">
          <div className="ods-totals-row">
            <span className="ods-totals-label">סכום לפני מע״מ</span>
            <span className="ods-totals-value">
              {formatIls(order.subtotal)}
            </span>
          </div>
          <div className="ods-totals-row">
            <span className="ods-totals-label">מע״מ</span>
            <span className="ods-totals-value">
              {formatIls(order.vat_amount)}
            </span>
          </div>
          <div className="ods-totals-row ods-totals-grand">
            <span className="ods-totals-label">סה״כ כולל מע״מ</span>
            <span className="ods-totals-value">{formatIls(order.total)}</span>
          </div>
        </div>

        <p className="ods-footer-note">
          מסמך זה הופק ממערכת ארגמן CRM · {formatIssueDate(order.created_at)}
        </p>
      </div>
    </div>
  );
});
