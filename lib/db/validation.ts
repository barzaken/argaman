import { z } from "zod";

/** תאריך YYYY-MM-DD אופציונלי (מחרוזת ריקה → null). */
export const optionalDateSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין")
    .refine((s) => !Number.isNaN(Date.parse(s)), "תאריך לא תקין")
    .nullable()
    .optional()
);

/** קישור חתימה אופציונלי — רק http/https (מונע javascript: וכד׳). */
export const optionalHttpUrlSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .trim()
    .max(2048, "קישור ארוך מדי")
    .refine((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "קישור החתימה חייב להתחיל ב-https://")
    .nullable()
    .optional()
);

export const orderItemStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
