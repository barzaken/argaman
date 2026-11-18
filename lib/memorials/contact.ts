/** טלפון / וואטסאפ ללקוחות פרטיים (בלי WhatsApp Business: קישור wa.me עם הודעה מוכנה). */

/** 050-1234567 / +972501234567 → 972501234567 (null אם לא נראה כמו מספר ישראלי) */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  if (!/^\d{8,9}$/.test(d)) return null;
  return `972${d}`;
}

export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

export function whatsAppHref(phone: string | null | undefined, text: string): string | null {
  const n = toWhatsAppNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function leadWhatsAppText(lead: { name: string; source: string }): string {
  const hi = `שלום ${firstName(lead.name)}, כאן ארגמן מצבות.`;
  if (lead.source === "configurator") {
    return `${hi} קיבלנו את המצבה שעיצבת באתר ונשמח לעבור איתך על הפרטים ולתת הצעת מחיר. מתי נוח לדבר?`;
  }
  if (lead.source === "service") {
    return `${hi} קיבלנו את הפנייה שלך לגבי טיפול בקבר. מתי נוח לדבר כדי לתאם?`;
  }
  return `${hi} קיבלנו את הפנייה שלך ונשמח לעזור. מתי נוח לדבר?`;
}

export function approvalWhatsAppText(customerName: string, url: string): string {
  return `שלום ${firstName(customerName)}, כאן ארגמן מצבות. מצורף קישור לאישור נוסח המצבה וההדמיה. נא לעבור על הנוסח בעיון ולחתום בתחתית העמוד:\n${url}`;
}

export function reminderWhatsAppText(customerName: string, kind: string, deceased: string | null): string {
  const who = deceased ? ` ${deceased} ז״ל` : "";
  if (kind === "shloshim") {
    return `שלום ${firstName(customerName)}, כאן ארגמן מצבות. לקראת השלושים של${who}, רצינו לבדוק אם נוכל לעזור בתיאום המצבה.`;
  }
  if (kind === "azkara") {
    return `שלום ${firstName(customerName)}, כאן ארגמן מצבות. לקראת האזכרה של${who}, נשמח לעזור בניקוי הקבר או בחידוש האותיות.`;
  }
  return `שלום ${firstName(customerName)}, כאן ארגמן מצבות.`;
}
