"use client";

import { CrmDataTable } from "@/components/crm/data-table";
import type { PaymentViewRow } from "@/lib/db/types";

import { paymentsColumnLabels, paymentsColumns } from "./columns";

/** טבלת התשלומים — לחיצה על שורה פותחת את פרטי התשלום. */
export function PaymentsTable({ rows, truncatedAt }: { rows: PaymentViewRow[]; truncatedAt?: number }) {
  return (
    <CrmDataTable
      columns={paymentsColumns}
      data={rows}
      filterPlaceholder="חיפוש לפי לקוח, מספר, אסמכתא, סכום…"
      searchKeys={["customer_tax_id"]}
      columnLabels={paymentsColumnLabels}
      navigateRows="payment-detail"
      truncatedAt={truncatedAt}
    />
  );
}
