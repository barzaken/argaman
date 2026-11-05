"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CrmRoleDb } from "@/lib/db/types";

export type CrmRoleContextValue = {
  /** null = מחובר אבל לא ברשימת crm_users */
  role: CrmRoleDb | null;
  /** מנהל = כל הפעולות כולל מחיקה; סוכן (בוט AI) = בלי מחיקות */
  isAdmin: boolean;
  email: string | null;
  userId: string | null;
};

const CrmRoleContext = createContext<CrmRoleContextValue>({
  role: null,
  isAdmin: false,
  email: null,
  userId: null,
});

/**
 * מספק את תפקיד המשתמש לכל ה-Client Components שמתחת ל-/dashboard
 * (ה-layout מביא אותו ב-getCurrentCrmUser). השרת בודק שוב בכל פעולה —
 * זה רק כדי להסתיר / לנטרל כפתורים (מחיקה וכד׳) שסוכן לא יכול להפעיל.
 */
export function CrmRoleProvider({
  value,
  children,
}: {
  value: CrmRoleContextValue;
  children: ReactNode;
}) {
  return <CrmRoleContext.Provider value={value}>{children}</CrmRoleContext.Provider>;
}

/** `const { isAdmin } = useCrmRole(); if (!isAdmin) hide delete` */
export function useCrmRole(): CrmRoleContextValue {
  return useContext(CrmRoleContext);
}

/** תווית קצרה לתפקיד (לסרגל הצד / מסך ההגדרות) */
export function crmRoleShortLabel(role: CrmRoleDb | null): string {
  if (role === "admin") return "מנהל";
  if (role === "agent") return "סוכן AI";
  return "לא מורשה";
}
