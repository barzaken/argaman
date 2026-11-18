"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/db/format";
import {
  MEM_LEAD_SOURCE_LABELS,
  MEM_LEAD_STATUS_LABELS,
  type MemLeadSource,
  type MemLeadStatus,
} from "@/lib/memorials/constants";

export type LeadTableRow = {
  id: string;
  created_at: string;
  name: string;
  phone: string | null;
  source: MemLeadSource;
  status: MemLeadStatus;
  deceased_name: string | null;
  utm_campaign: string | null;
  has_image: boolean;
  has_gclid: boolean;
};

export const leadColumnLabels: Record<string, string> = {
  created_at: "התקבל",
  name: "שם",
  phone: "טלפון",
  source: "מקור",
  status: "סטטוס",
  deceased_name: "נפטר/ת",
  utm_campaign: "קמפיין",
};

const STATUS_VARIANT: Record<MemLeadStatus, "default" | "secondary" | "outline"> = {
  new: "default",
  contacted: "secondary",
  converted: "outline",
  lost: "outline",
  spam: "outline",
};

export const leadColumns: ColumnDef<LeadTableRow>[] = [
  {
    accessorKey: "created_at",
    header: "התקבל",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDateShort(row.original.created_at)}{" "}
        <span className="text-muted-foreground text-xs">
          {new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }).format(new Date(row.original.created_at))}
        </span>
      </span>
    ),
  },
  {
    accessorKey: "name",
    header: "שם",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Link href={`/dashboard/memorials/leads/${row.original.id}`} className="font-medium hover:underline underline-offset-4">
          {row.original.name}
        </Link>
        {row.original.has_image ? <ImageIcon className="text-muted-foreground size-3.5" aria-label="יש הדמיה" /> : null}
      </div>
    ),
  },
  {
    accessorKey: "phone",
    header: "טלפון",
    cell: ({ row }) =>
      row.original.phone ? (
        <a href={`tel:${row.original.phone}`} dir="ltr" className="tabular-nums hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.phone}
        </a>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "source",
    header: "מקור",
    cell: ({ row }) => MEM_LEAD_SOURCE_LABELS[row.original.source] ?? row.original.source,
  },
  {
    accessorKey: "status",
    header: "סטטוס",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]} className="font-normal">
        {MEM_LEAD_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "deceased_name",
    header: "נפטר/ת",
    cell: ({ row }) => row.original.deceased_name ?? "—",
  },
  {
    accessorKey: "utm_campaign",
    header: "קמפיין",
    cell: ({ row }) => (
      <span className="text-xs">
        {row.original.utm_campaign ?? (row.original.has_gclid ? "Google Ads" : "—")}
      </span>
    ),
  },
];
