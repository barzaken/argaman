"use client";

import { Calendar, Package, Users, CircleDollarSign } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";


export default function DashboardPage() {
    return (
        <div className="h-[calc(100dvh-3.5rem)] flex flex-col">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 border-b">
                <KpiCard label="הזמנות" value={100} Icon={Calendar} />
                <KpiCard label="במלאי" value={48} Icon={Package} />
                <KpiCard label="לקוחות" value={256} Icon={Users} />
                <KpiCard label="בהמתנה" value={12400} Icon={CircleDollarSign} />
            </div>
            <div className="flex-1 flex">
                <div className="flex-3/4 border-l">
                    <h1>סטודנטים</h1>
                </div>
                <div className=" flex-1/4">
                    <h1>מורים</h1>
                </div>
            </div>
        </div>
    );
}
