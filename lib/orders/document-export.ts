import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import { DOCUMENT_PRINT_CSS } from "./document-print-styles";

const HEBOO_FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap";

function mountIsolatedSheet(node: HTMLElement): {
  root: HTMLElement;
  cleanup: () => void;
} {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;pointer-events:none;z-index:-1;overflow:visible;";

  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  host.appendChild(clone);
  document.body.appendChild(host);

  return {
    root: clone,
    cleanup: () => host.remove(),
  };
}

function buildHtmlDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${HEBOO_FONT_LINK}" rel="stylesheet" />
  <style>${DOCUMENT_PRINT_CSS}</style>
  <style>
    @page { size: A4; margin: 12mm; }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      direction: rtl;
    }
    body { padding: 0; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

async function waitForFonts(doc: Document): Promise<void> {
  if (doc.fonts?.ready) {
    await doc.fonts.ready;
  }
  await new Promise((r) => setTimeout(r, 600));
}

async function renderSheetInIframe(
  sheetEl: HTMLElement
): Promise<{ iframe: HTMLIFrameElement; target: HTMLElement; cleanup: () => void }> {
  const { root, cleanup: cleanupClone } = mountIsolatedSheet(sheetEl);
  const html = buildHtmlDocument(root.outerHTML);
  cleanupClone();

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("לא ניתן ליצור מסמך לייצוא");
  }

  doc.open();
  doc.write(html);
  doc.close();

  await waitForFonts(doc);

  const target = doc.body.firstElementChild as HTMLElement | null;
  if (!target) {
    iframe.remove();
    throw new Error("מסמך ריק");
  }

  const contentHeight = Math.max(target.scrollHeight, target.offsetHeight, 1123);
  iframe.style.height = `${contentHeight}px`;

  return {
    iframe,
    target,
    cleanup: () => iframe.remove(),
  };
}

function unclipAncestors(sheetEl: HTMLElement): () => void {
  const restored: Array<{
    el: HTMLElement;
    overflow: string;
    overflowY: string;
  }> = [];

  let parent = sheetEl.parentElement;
  while (parent && parent !== document.body) {
    const cs = getComputedStyle(parent);
    if (cs.overflow !== "visible" || cs.overflowY !== "visible") {
      restored.push({
        el: parent,
        overflow: parent.style.overflow,
        overflowY: parent.style.overflowY,
      });
      parent.style.overflow = "visible";
      parent.style.overflowY = "visible";
    }
    parent = parent.parentElement;
  }

  return () => {
    for (const { el, overflow, overflowY } of restored) {
      el.style.overflow = overflow;
      el.style.overflowY = overflowY;
    }
  };
}

async function canvasFromElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  const ownerDoc = element.ownerDocument;
  if (ownerDoc.fonts?.ready) {
    await ownerDoc.fonts.ready;
  }
  if (ownerDoc === document) {
    await new Promise((r) => setTimeout(r, 150));
  }

  const contentWidth = element.scrollWidth || element.offsetWidth || 794;
  const contentHeight = element.scrollHeight || element.offsetHeight || 1123;
  const scale = Math.min(2, 4096 / Math.max(contentWidth, contentHeight, 1));

  return html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: contentWidth,
    height: contentHeight,
    windowWidth: contentWidth,
    windowHeight: contentHeight,
    scrollX: 0,
    scrollY: 0,
    foreignObjectRendering: false,
  });
}

async function captureSheetCanvas(sheetEl: HTMLElement): Promise<HTMLCanvasElement> {
  const restoreOverflow = unclipAncestors(sheetEl);
  try {
    const canvas = await canvasFromElement(sheetEl);
    if (!canvas.width || !canvas.height) {
      throw new Error("יצירת תמונה נכשלה");
    }
    return canvas;
  } finally {
    restoreOverflow();
  }
}

function addCanvasToPdf(canvas: HTMLCanvasElement, pdf: jsPDF): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;

  const imgWidth = printableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  if (imgHeight <= 0 || !Number.isFinite(imgHeight)) {
    throw new Error("גודל תמונה לא תקין");
  }

  let offset = 0;
  let page = 0;
  const maxPages = Math.ceil(imgHeight / printableHeight) + 1;

  while (offset < imgHeight && page < maxPages) {
    if (page > 0) pdf.addPage();
    pdf.addImage(
      imgData,
      "JPEG",
      margin,
      margin - offset,
      imgWidth,
      imgHeight
    );
    offset += printableHeight;
    page += 1;
  }
}

export async function printOrderDocument(sheetEl: HTMLElement): Promise<void> {
  const { iframe, cleanup } = await renderSheetInIframe(sheetEl);
  const win = iframe.contentWindow;

  if (!win) {
    cleanup();
    throw new Error("לא ניתן לפתוח חלון הדפסה");
  }

  await new Promise<void>((resolve) => {
    const done = () => {
      win.removeEventListener("afterprint", done);
      cleanup();
      resolve();
    };
    win.addEventListener("afterprint", done);
    win.focus();
    win.print();
    setTimeout(done, 60_000);
  });
}

export async function downloadOrderDocumentPdf(
  sheetEl: HTMLElement,
  orderNumber: number
): Promise<void> {
  let canvas: HTMLCanvasElement;

  try {
    canvas = await captureSheetCanvas(sheetEl);
  } catch {
    const { target, cleanup } = await renderSheetInIframe(sheetEl);
    try {
      await waitForFonts(target.ownerDocument);
      canvas = await canvasFromElement(target);
      if (!canvas.width || !canvas.height) {
        throw new Error("יצירת תמונה נכשלה");
      }
    } finally {
      cleanup();
    }
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addCanvasToPdf(canvas, pdf);
  pdf.save(`תעודת-הזמנה-${orderNumber}.pdf`);
}
