import { ShieldCheck } from "lucide-react";

import { getCurrentCrmUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { toHebrewError } from "@/lib/db/errors";
import type { CrmRoleDb, CrmUserRow } from "@/lib/db/types";

import { CopyableSql, UsersRolesTable } from "./users-roles";

const ADD_USER_SQL = `INSERT INTO public.crm_users (user_id, role)
SELECT id, 'agent'
FROM auth.users
WHERE email = 'new.user@example.com'
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;`;

export default async function SettingsPage() {
  const supabase = await createClient();
  const [me, { data: users, error }] = await Promise.all([
    getCurrentCrmUser(),
    supabase.rpc("crm_list_users"),
  ]);

  const list = ((users ?? []) as CrmUserRow[]).map((u) => ({
    ...u,
    role: (u.role === "agent" ? "agent" : "admin") as CrmRoleDb,
  }));
  const isAdmin = me?.isAdmin ?? false;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-auto">
      <div className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-[min(100%,64rem)] flex-col gap-8">
          <section className="flex flex-col gap-4" aria-labelledby="users-title">
            <div>
              <h2 id="users-title" className="text-lg font-semibold text-foreground">
                משתמשים והרשאות
              </h2>
              <p className="text-muted-foreground text-sm">
                <strong className="font-medium text-foreground">מנהל</strong> —
                כל הפעולות, כולל מחיקה ושינוי תפקידים.{" "}
                <strong className="font-medium text-foreground">סוכן</strong> —
                (למשל בוט ה-AI בוואטסאפ) יוצר ומעדכן הכול, אבל לא מוחק.
              </p>
            </div>

            {!isAdmin ? (
              <p className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                רק מנהל יכול לראות את כל המשתמשים ולשנות תפקידים.
              </p>
            ) : null}

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {toHebrewError(error, "טעינת רשימת המשתמשים נכשלה.")}
              </p>
            ) : (
              <UsersRolesTable
                users={list}
                currentUserId={me?.userId ?? null}
                canEdit={isAdmin}
              />
            )}

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">
                הוספת משתמש חדש
              </h3>
              <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
                <li>
                  ב-Supabase: Authentication ← Users ← Add user — אימייל וסיסמה
                  (ההרשמה החופשית כבויה).
                </li>
                <li>
                  ב-SQL Editor להריץ את הפקודה הבאה עם האימייל שלו{" "}
                  (<span dir="ltr">&apos;agent&apos;</span> = סוכן AI בלי
                  מחיקות, <span dir="ltr">&apos;admin&apos;</span> = מנהל). בלי
                  זה המשתמש יוכל להתחבר, אבל יראה מערכת ריקה.
                </li>
                <li>אחר כך אפשר לשנות כאן את התפקיד שלו בכל רגע.</li>
              </ol>
              <CopyableSql sql={ADD_USER_SQL} />
            </div>
          </section>

          <section
            className="flex flex-col gap-4 border-t border-border pt-8"
            aria-label="חיבור Green Invoice"
          >
            {/* GREEN_INVOICE_SETTINGS_SLOT */}
          </section>
        </div>
      </div>
    </div>
  );
}
