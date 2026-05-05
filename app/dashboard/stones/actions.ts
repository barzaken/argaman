"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeHex } from "@/lib/db/format";
import { requireAuth } from "@/lib/supabase/auth-helpers";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

const stoneSchema = z.object({
  name: z.string().min(1, "שם חובה"),
  polish_type: z.string().min(1, "סוג ליטוש חובה"),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "צבע לא תקין"),
});

export async function createStone(formData: FormData): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = stoneSchema.safeParse({
    name: formData.get("name"),
    polish_type: formData.get("polish_type"),
    color_hex: normalizeHex(String(formData.get("color_hex") ?? "#000000")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "שגיאת ולידציה",
    };
  }

  const { error } = await auth.supabase.from("stones").insert({
    name: parsed.data.name.trim(),
    polish_type: parsed.data.polish_type.trim(),
    color_hex: parsed.data.color_hex,
    is_active: true,
  });

  if (error) return { ok: false, message: error.message };

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
    polish_type: formData.get("polish_type"),
    color_hex: normalizeHex(String(formData.get("color_hex") ?? "#000000")),
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
      polish_type: parsed.data.polish_type.trim(),
      color_hex: parsed.data.color_hex,
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: error.message };

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

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/stones");
  return { ok: true };
}
