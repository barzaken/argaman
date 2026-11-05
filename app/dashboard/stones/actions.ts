"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-he";

import { toHebrewError } from "@/lib/db/errors";

import { normalizeHex } from "@/lib/db/format";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

const stoneSchema = z.object({
  name: z.string().min(1, "שם חובה"),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "צבע לא תקין"),
  /** מק״ט — ריק = null (ייחודי כשמוגדר) */
  sku: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(64, "מק״ט ארוך מדי").nullable().optional()
  ),
  /** שמות חלופיים (JSON של מערך מחרוזות) */
  aliases: z
    .array(z.string().trim().min(1).max(120, "שם חלופי ארוך מדי"))
    .max(50, "יותר מדי שמות חלופיים")
    .optional(),
});

/** מערך שמות חלופיים מ-FormData (JSON) — מנוקה ובלי כפילויות */
function aliasesFromForm(formData: FormData): string[] | undefined {
  const raw = formData.get("aliases");
  if (typeof raw !== "string") return undefined;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
      if (typeof v !== "string") continue;
      const t = v.replace(/\s+/g, " ").trim();
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
    return out;
  } catch {
    return [];
  }
}

export async function createStone(formData: FormData): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = stoneSchema.safeParse({
    name: formData.get("name"),
    color_hex: normalizeHex(String(formData.get("color_hex") ?? "#000000")),
    sku: formData.get("sku") ?? undefined,
    aliases: aliasesFromForm(formData),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase.from("stones").insert({
    name: parsed.data.name.trim(),
    color_hex: parsed.data.color_hex,
    sku: parsed.data.sku ?? null,
    aliases: parsed.data.aliases ?? [],
    is_active: true,
  });

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/stones");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateStoneSchema = stoneSchema.extend({
  id: z.string().uuid(),
});

export async function updateStone(formData: FormData): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = updateStoneSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    color_hex: normalizeHex(String(formData.get("color_hex") ?? "#000000")),
    sku: formData.get("sku") ?? undefined,
    aliases: aliasesFromForm(formData),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase
    .from("stones")
    .update({
      name: parsed.data.name.trim(),
      color_hex: parsed.data.color_hex,
      // לא נשלחו (טופס ישן) = לא נוגעים
      ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku } : {}),
      ...(parsed.data.aliases !== undefined ? { aliases: parsed.data.aliases } : {}),
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/stones");
  revalidatePath(`/dashboard/stones/${parsed.data.id}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function archiveStone(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "מזהה לא תקין" };

  const { error } = await auth.supabase
    .from("stones")
    .update({ is_active: false })
    .eq("id", parsed.data);

  if (error) return { ok: false, message: toHebrewError(error) };

  revalidatePath("/dashboard/stones");
  revalidatePath("/dashboard");
  return { ok: true };
}
