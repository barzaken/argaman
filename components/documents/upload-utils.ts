import type { DocumentKindDb } from "@/lib/db/types";

/** סוגי קבצים שהדלי "documents" מקבל */
export const DOCUMENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export const DOCUMENT_ACCEPT_ATTR =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

/** סוג הקובץ — לפי file.type, ואם הדפדפן לא זיהה (נפוץ ב-HEIC) לפי הסיומת */
export function resolveMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "";
}

/** מחזיר הודעת שגיאה בעברית, או null כשהקובץ תקין */
export function validateDocumentFile(file: File): string | null {
  const mime = resolveMimeType(file);
  if (!(DOCUMENT_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return "סוג קובץ לא נתמך — אפשר להעלות תמונה (JPG/PNG/WEBP/HEIC) או PDF.";
  }
  if (file.size > DOCUMENT_MAX_BYTES) return "הקובץ גדול מדי (עד 20MB).";
  if (file.size === 0) return "הקובץ ריק.";
  return null;
}

/** אותיות/ספרות/נקודה/מקף/קו תחתון בלבד, עד ~80 תווים (שומרים על הסיומת) */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "");
  const base = cleaned || "file";
  if (base.length <= 80) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 6 ? base.slice(dot) : "";
  return base.slice(0, 80 - ext.length) + ext;
}

/** {kind}/{yyyy}/{mm}/{uuid}-{safeFileName} */
export function buildDocumentStoragePath(kind: DocumentKindDb, fileName: string): string {
  const [yyyy, mm] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-");
  return `${kind}/${yyyy}/${mm}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

/** תמונות שהדפדפן יודע להציג (HEIC/HEIF בדרך כלל לא) */
export function isBrowserRenderableImage(mime: string | null | undefined): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}
