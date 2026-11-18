"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { actionCrashed } from "@/lib/action-client";

import { setUserMemorialsOnly } from "./actions";

export function MemorialsOnlyToggles({
  users,
  restricted,
  currentUserId,
}: {
  users: { user_id: string; email: string | null; display_name: string | null; role: string }[];
  restricted: string[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const set = new Set(restricted);
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {users.map((u) => (
        <li key={u.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span>
            {u.display_name ?? u.email}
            {u.display_name && u.email ? <span className="text-muted-foreground"> · {u.email}</span> : null}
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={set.has(u.user_id)}
              disabled={pending === u.user_id || (u.user_id === currentUserId) || u.role === "admin"}
              onChange={async (e) => {
                setPending(u.user_id);
                const res = await setUserMemorialsOnly(u.user_id, e.target.checked).catch(actionCrashed);
                setPending(null);
                if (!res.ok) toast.error(res.message);
                else {
                  toast.success("ההרשאה עודכנה");
                  router.refresh();
                }
              }}
            />
            מצבות בלבד
          </label>
        </li>
      ))}
    </ul>
  );
}
