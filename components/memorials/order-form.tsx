"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createOrder, updateOrder } from "@/app/dashboard/memorials/actions";
import { FormPageShell, FormStickyFooter } from "@/components/form-sticky-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actionCrashed } from "@/lib/action-client";
import {
  MEM_ORDER_KIND_LABELS,
  MEM_ORDER_KINDS,
  type MemOrderRow,
} from "@/lib/memorials/constants";
import { Field, selectClass } from "./ui";

export function OrderForm({ order }: { order?: MemOrderRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backHref = order ? `/dashboard/memorials/orders/${order.id}` : "/dashboard/memorials/orders";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const input = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await (order ? updateOrder(order.id, input) : createOrder(input)).catch(actionCrashed);
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      toast.error(res.message);
      return;
    }
    toast.success(order ? "ההזמנה עודכנה" : "ההזמנה נפתחה");
    router.push(`/dashboard/memorials/orders/${res.id}`);
  }

  const o = order;
  return (
    <FormPageShell>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            <h2 className="text-lg font-semibold">{o ? `עריכת הזמנה #${o.number}` : "הזמנה פרטית חדשה"}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="סוג">
                <select name="kind" className={selectClass} defaultValue={o?.kind ?? "headstone"}>
                  {MEM_ORDER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {MEM_ORDER_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="שם הלקוח (המשפחה)">
                <Input name="customer_name" required defaultValue={o?.customer_name ?? ""} />
              </Field>
              <Field label="טלפון">
                <Input name="phone" dir="ltr" inputMode="tel" className="text-start" defaultValue={o?.phone ?? ""} />
              </Field>
              <Field label="דוא״ל" hint="לשליחת חשבוניות מ-Morning">
                <Input name="email" type="email" dir="ltr" className="text-start" defaultValue={o?.email ?? ""} />
              </Field>
              <Field label="כתובת">
                <Input name="address" defaultValue={o?.address ?? ""} />
              </Field>
              <Field label="עיר">
                <Input name="city" defaultValue={o?.city ?? ""} />
              </Field>
            </div>
            <h3 className="text-sm font-semibold">הנפטר/ת והקבר</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שם הנפטר/ת">
                <Input name="deceased_name" defaultValue={o?.deceased_name ?? ""} />
              </Field>
              <Field label="תאריך פטירה (לועזי)" hint="יוצר תזכורות שלושים ואזכרה">
                <Input name="death_date" type="date" defaultValue={o?.death_date ?? ""} />
              </Field>
              <Field label="תאריך פטירה עברי">
                <Input name="hebrew_death_date" defaultValue={o?.hebrew_death_date ?? ""} placeholder="כ״ג בחשוון תשפ״ז" />
              </Field>
              <Field label="בית עלמין">
                <Input name="cemetery" defaultValue={o?.cemetery ?? ""} />
              </Field>
              <Field label="מיקום הקבר" className="sm:col-span-2">
                <Input name="grave_location" defaultValue={o?.grave_location ?? ""} placeholder="גוש / חלקה / שורה / קבר" />
              </Field>
            </div>
            <h3 className="text-sm font-semibold">מחיר ותכנון</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="מחיר מוסכם (כולל מע״מ)">
                <Input name="price" inputMode="decimal" dir="ltr" className="text-start" defaultValue={o?.price ?? ""} />
              </Field>
              <Field label="מקדמה נדרשת (ריק = 20% מהמחיר)">
                <Input name="deposit_amount" inputMode="decimal" dir="ltr" className="text-start" defaultValue={o?.deposit_amount ?? ""} />
              </Field>
              <Field label="תאריך התקנה">
                <Input name="installation_date" type="date" defaultValue={o?.installation_date ?? ""} />
              </Field>
            </div>
            <Field label="קישור לעיצוב באתר">
              <Input name="design_url" dir="ltr" className="text-start" defaultValue={o?.design_url ?? ""} />
            </Field>
            <Field label="נוסח המצבה" hint="הנוסח שנשלח למשפחה לאישור">
              <Textarea name="wording" rows={6} defaultValue={o?.wording ?? ""} />
            </Field>
            <Field label="הערות">
              <Textarea name="notes" rows={3} defaultValue={o?.notes ?? ""} />
            </Field>
            {error ? <p className="text-destructive text-sm" role="alert">{error}</p> : null}
          </div>
        </div>
        <FormStickyFooter>
          <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
            ביטול
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "שומר…" : o ? "שמירת שינויים" : "פתיחת הזמנה"}
          </Button>
        </FormStickyFooter>
      </form>
    </FormPageShell>
  );
}
