"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { crmRoleShortLabel } from "@/components/role-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionCrashed } from "@/lib/action-client";
import { formatDateShort } from "@/lib/db/format";
import { crmRoleLabels } from "@/lib/db/labels";
import type { CrmRoleDb, CrmUserRow } from "@/lib/db/types";

import { setUserRole } from "./actions";

export function UsersRolesTable({
  users,
  currentUserId,
  canEdit,
}: {
  users: CrmUserRow[];
  currentUserId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingChange, setPendingChange] = useState<{
    user: CrmUserRow;
    role: CrmRoleDb;
  } | null>(null);

  async function applyChange() {
    if (!pendingChange) return;
    const { user, role } = pendingChange;
    const res = await setUserRole({ user_id: user.user_id, role }).catch(actionCrashed);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(`התפקיד של ${user.email ?? "המשתמש"} עודכן ל${crmRoleShortLabel(role)}`);
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <Table dir="rtl">
        <TableHeader>
          <TableRow>
            <TableHead>משתמש</TableHead>
            <TableHead>שם תצוגה</TableHead>
            <TableHead>תפקיד</TableHead>
            <TableHead>נוסף</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isMe = u.user_id === currentUserId;
            return (
              <TableRow key={u.user_id}>
                <TableCell>
                  <span dir="ltr" className="font-medium">
                    {u.email ?? "—"}
                  </span>
                  {isMe ? (
                    <Badge variant="outline" className="ms-2 font-normal">
                      אני
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.display_name ?? "—"}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <label className="flex items-center gap-2">
                      <span className="sr-only">תפקיד של {u.email}</span>
                      <Select
                        dir="rtl"
                        value={u.role}
                        onValueChange={(v) => {
                          if (v !== u.role) setPendingChange({ user: u, role: v as CrmRoleDb });
                        }}
                      >
                        <SelectTrigger className="w-52" aria-label={`תפקיד של ${u.email ?? ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          <SelectItem value="admin">{crmRoleLabels.admin}</SelectItem>
                          <SelectItem value="agent">{crmRoleLabels.agent}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  ) : (
                    <Badge variant={u.role === "admin" ? "secondary" : "outline"}>
                      {crmRoleLabels[u.role]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDateShort(u.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                אין משתמשים להצגה.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={pendingChange != null}
        onOpenChange={(open) => {
          if (!open) setPendingChange(null);
        }}
        title="שינוי תפקיד"
        description={
          pendingChange
            ? `לשנות את התפקיד של ${pendingChange.user.email ?? "המשתמש"} ל״${crmRoleLabels[pendingChange.role]}״?${
                pendingChange.role === "agent"
                  ? " סוכן יכול ליצור ולעדכן הכול, אבל לא למחוק."
                  : " מנהל יכול גם למחוק רשומות ולשנות תפקידים."
              }`
            : ""
        }
        confirmLabel="שינוי"
        pendingLabel="שומר…"
        onConfirm={applyChange}
      />
    </div>
  );
}

export function CopyableSql({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre
        dir="ltr"
        className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 pl-12 text-left font-mono text-xs leading-relaxed text-foreground"
      >
        {sql}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute end-1.5 top-1.5 size-7"
        aria-label="העתקת הפקודה"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(sql)
            .then(() => {
              setCopied(true);
              toast.success("הפקודה הועתקה");
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => toast.error("ההעתקה נכשלה — סמנו את הטקסט והעתיקו ידנית"));
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}
