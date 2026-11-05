"use client";

import { useRouter } from "next/navigation";

import { CrmDataTable } from "@/components/crm/data-table";
import type { PaymentViewRow } from "@/lib/db/types";

import { paymentsColumnLabels, paymentsColumns } from "./columns";

/**
 * CrmDataTable עם ניווט לפרטי תשלום בלחיצה על שורה.
 * (ל-CrmDataTable אין עדיין סוג ניווט "payment-detail", לכן לוכדים את הלחיצה
 * כאן ומנווטים לקישור שבעמודת המספר.)
 */
export function PaymentsTable({ rows, truncatedAt }: { rows: PaymentViewRow[]; truncatedAt?: number }) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, [role=menu], [role=menuitem]")) return;
    const tr = target.closest("tbody tr");
    const link = tr?.querySelector<HTMLAnchorElement>("a[data-row-link]");
    if (!link) return;
    if (window.getSelection()?.toString()) return;
    const href = link.getAttribute("href");
    if (!href) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  return (
    <div
      onClick={handleClick}
      className="[&_tbody_tr:has(a[data-row-link])]:cursor-pointer"
    >
      <CrmDataTable
        columns={paymentsColumns}
        data={rows}
        filterColumnId="customer_name"
        filterPlaceholder="סנן לפי לקוח..."
        columnLabels={paymentsColumnLabels}
        truncatedAt={truncatedAt}
      />
    </div>
  );
}
