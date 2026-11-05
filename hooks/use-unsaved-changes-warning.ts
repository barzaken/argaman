"use client";

import { useEffect } from "react";

/**
 * מזהיר לפני סגירת הטאב / רענון כשיש בטופס נתונים שלא נשמרו.
 * (ניווט פנימי בתוך האפליקציה לא נחסם — רק יציאה מהדפדפן/רענון.)
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
