import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { minorUnitDigits, toMajorString, type Money } from "@/lib/money";

// Plain, printable PDFs for contracts and invoices. Standard PDF fonts only cover Latin-1, so
// symbols they can't draw are replaced (currency shown by its ISO code, e.g. "NGN 1,500.00").

const REPLACE: [RegExp, string][] = [
  [/₦/g, "NGN "],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—]/g, "-"],
  [/→/g, "->"],
  [/•/g, "-"],
  [/…/g, "..."],
  [/ /g, " "],
];

export function pdfSafe(text: string): string {
  let out = text;
  for (const [re, to] of REPLACE) out = out.replace(re, to);
  // Anything else outside Latin-1 becomes "?" rather than failing the whole document.
  return out.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

/** Money for PDFs: "NGN 1,500,000.00". */
export function pdfMoney(m: Money, locale: string): string {
  const digits = minorUnitDigits(m.currency);
  const n = Number(toMajorString(m));
  return `${m.currency} ${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}`;
}

export interface PdfBlock {
  text: string;
  size?: number;
  bold?: boolean;
  /** Right-aligned second column (e.g. an amount). */
  right?: string;
  gapBefore?: number;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** A4 document from blocks of text; pages added as needed. */
export async function renderPdf(title: string, blocks: PdfBlock[], footer?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(title));
  doc.setCreator("Tideline");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H, M] = [595.28, 841.89, 56];
  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  for (const b of blocks) {
    const size = b.size ?? 10;
    const font = b.bold ? bold : regular;
    y -= b.gapBefore ?? 0;
    const rightWidth = b.right ? regular.widthOfTextAtSize(pdfSafe(b.right), size) + 16 : 0;
    const lines = pdfSafe(b.text)
      .replace(/\t/g, "    ")
      .split(/\r?\n/)
      .flatMap((para) => (para.trim() ? wrap(para, font, size, W - 2 * M - rightWidth) : [""]));
    for (const line of lines) {
      if (y < M + size * 2) newPage();
      page.drawText(line, { x: M, y, size, font, color: rgb(0.08, 0.1, 0.14) });
      if (b.right) {
        const r = pdfSafe(b.right);
        page.drawText(r, { x: W - M - regular.widthOfTextAtSize(r, size), y, size, font: regular });
        b.right = undefined;
      }
      y -= size * 1.45;
    }
  }
  if (footer) {
    for (const p of doc.getPages()) {
      p.drawText(pdfSafe(footer), { x: M, y: M / 2, size: 7, font: regular, color: rgb(0.45, 0.48, 0.55) });
    }
  }
  return doc.save();
}

/** Appends files after a document: PDF pages are copied; JPEG/PNG images get a page each. */
export async function appendFiles(
  base: Uint8Array,
  files: { title: string; bytes: Uint8Array; mimeType: string }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(base);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const f of files) {
    try {
      if (f.mimeType === "application/pdf") {
        const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
        for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p);
        continue;
      }
      const img =
        f.mimeType === "image/png"
          ? await doc.embedPng(f.bytes)
          : f.mimeType === "image/jpeg"
            ? await doc.embedJpg(f.bytes)
            : null;
      if (!img) continue;
      const page = doc.addPage([595.28, 841.89]);
      page.drawText(pdfSafe(f.title), { x: 56, y: 800, size: 11, font });
      const scale = Math.min((595.28 - 112) / img.width, (841.89 - 140) / img.height, 1);
      page.drawImage(img, { x: 56, y: 760 - img.height * scale, width: img.width * scale, height: img.height * scale });
    } catch {
      // A file that can't be read is listed in the index but not appended.
    }
  }
  return doc.save();
}
