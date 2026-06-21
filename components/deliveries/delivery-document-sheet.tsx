"use client";

import { forwardRef } from "react";
import { Heebo } from "next/font/google";

import "@/lib/orders/document-print.css";
import { BRAND_CONTACT, BRAND_NAME } from "@/lib/brand";
import type { DeliveryItemRow, DeliveryViewRow } from "@/lib/db/types";
import {
  formatDimensionsCmFromMeters,
  formatIls,
  formatIssueDate,
  formatVolumeM3,
} from "@/lib/db/format";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const deliveryStatusLabels: Record<DeliveryViewRow["status"], string> = {
  waiting_for_pickup: "ממתין לאיסוף",
  in_transit: "בדרך",
  delivered: "נמסר",
  cancelled: "בוטל",
};

const paymentStatusLabels: Record<DeliveryViewRow["payment_status"], string> = {
  unpaid: "לא שולם",
  paid: "שולם",
};

const paymentMethodLabels: Record<
  NonNullable<DeliveryViewRow["payment_method"]>,
  string
> = {
  cash: "מזומן",
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  credit_card: "כרטיס אשראי",
  other: "אחר",
};

function shippingAddressDisplay(delivery: DeliveryViewRow): string {
  if (delivery.fulfillment_method === "pickup") {
    return "איסוף עצמי";
  }
  return delivery.shipping_address ?? "—";
}

export const DeliveryDocumentSheet = forwardRef<
  HTMLDivElement,
  {
    delivery: DeliveryViewRow;
    lines: DeliveryItemRow[];
  }
>(function DeliveryDocumentSheet({ delivery, lines }, ref) {
  return (
    <div
      ref={ref}
      id="delivery-document-sheet"
      dir="rtl"
      lang="he"
      className={`ods-sheet ${heebo.className}`}
      aria-label="תעודת משלוח"
    >
      <div className="ods-accent" aria-hidden />

      <header className="ods-header">
        <p className="ods-brand">{BRAND_NAME}</p>
        <h1 className="ods-title">תעודת משלוח</h1>
        <p className="ods-order-num">משלוח מס׳ {delivery.delivery_number}</p>
        <p className="ods-order-num">הזמנה מס׳ {delivery.order_number}</p>

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
            <span className="ods-meta-value">{delivery.customer_name}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">ח.פ / ת.ז</span>
            <span className="ods-meta-value">{delivery.customer_tax_id}</span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">כתובת משלוח</span>
            <span className="ods-meta-value">
              {shippingAddressDisplay(delivery)}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">טלפון</span>
            <span className="ods-meta-value">
              {delivery.customer_phone ?? "—"}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">תאריך הנפקה / איסוף</span>
            <span className="ods-meta-value">
              {formatIssueDate(delivery.created_at)}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">אופן אספקה</span>
            <span className="ods-meta-value">
              {delivery.fulfillment_method === "shipping" ? "שילוח" : "איסוף"}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">סטטוס משלוח</span>
            <span className="ods-meta-value">
              {deliveryStatusLabels[delivery.status]}
            </span>
          </div>
          <div className="ods-meta-card">
            <span className="ods-meta-label">סטטוס תשלום</span>
            <span className="ods-meta-value">
              {paymentStatusLabels[delivery.payment_status]}
              {delivery.payment_method
                ? ` · ${paymentMethodLabels[delivery.payment_method]}`
                : ""}
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
                <th className="ods-num">נפח</th>
                <th className="ods-num">מחיר לקו״ב</th>
                <th className="ods-num">סכום שורה</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
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
                    {formatVolumeM3(Number(ln.volume_m3))}
                  </td>
                  <td className="ods-num">
                    {formatIls(Number(ln.price_per_m3))}
                  </td>
                  <td className="ods-num ods-strong">
                    {formatIls(Number(ln.line_subtotal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ods-totals">
          <div className="ods-totals-row">
            <span className="ods-totals-label">סכום לפני מע״מ</span>
            <span className="ods-totals-value">
              {formatIls(delivery.subtotal)}
            </span>
          </div>
          <div className="ods-totals-row">
            <span className="ods-totals-label">מע״מ</span>
            <span className="ods-totals-value">
              {formatIls(delivery.vat_amount)}
            </span>
          </div>
          <div className="ods-totals-row ods-totals-grand">
            <span className="ods-totals-label">סה״כ כולל מע״מ</span>
            <span className="ods-totals-value">{formatIls(delivery.total)}</span>
          </div>
        </div>

        <p className="ods-footer-note">
          מסמך זה הופק ממערכת ארגמן CRM · {formatIssueDate(delivery.created_at)}
        </p>
      </div>
    </div>
  );
});
