"use client";

import { KpiCard } from "@/components/kpi-card";
import { Calendar, CircleDollarSign, Package, Users } from "lucide-react";

import { customerColumns } from "./columns";
import { customersDemoData } from "./customers-demo-data";
import { CustomersDataTable } from "./customers-data-table";

export default function CustomersPage() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="הזמנות" value={100} Icon={Calendar} />
        <KpiCard label="במלאי" value={48} Icon={Package} />
        <KpiCard label="לקוחות" value={256} Icon={Users} />
        <KpiCard label="בהמתנה" value={12400} Icon={CircleDollarSign} />
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-[min(100%,80rem)]">
          <CustomersDataTable
            columns={customerColumns}
            data={customersDemoData}
          />
        </div>
      </div>
    </div>
  );
}