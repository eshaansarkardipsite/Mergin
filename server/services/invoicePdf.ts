import { readFileSync } from 'node:fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { formatMoney, formatQuantity } from '../../shared/money';
import type { Invoice } from '../../shared/types';

const PAGE_WIDTH = 612; // 8.5in
const PAGE_HEIGHT = 792; // 11in
const MARGIN = 54; // 0.75in
const BOTTOM = 64;
const INK = rgb(0.06, 0.06, 0.06);
const INK_MUTED = rgb(0.35, 0.35, 0.35);
const SURFACE_RAISED = rgb(0.96, 0.96, 0.96);
const RULE = rgb(0.85, 0.85, 0.85);
const RIGHT = PAGE_WIDTH - MARGIN;
const QTY_RIGHT = RIGHT - 90;
const DESC_MAX = QTY_RIGHT - MARGIN - 70;
const LOGO_PATH = new URL('../../public/brand/mergin-logo.png', import.meta.url);

/** StandardFonts use WinAnsi; map typographic characters and replace anything unencodable. */
function safe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

function measure(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightX: number,
  y: number,
  size: number,
  color = INK,
): void {
  const value = safe(text);
  page.drawText(value, { x: rightX - measure(font, value, size), y, size, font, color });
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(font, next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  workspaceName: string,
  logo: PDFImage,
): number {
  const logoHeight = 24;
  const logoWidth = (logo.width / logo.height) * logoHeight;
  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - logoHeight + 6,
    width: logoWidth,
    height: logoHeight,
  });
  page.drawText(safe(workspaceName), {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - logoHeight - 10,
    size: 9,
    font,
    color: INK_MUTED,
  });
  drawRight(page, bold, 'INVOICE', RIGHT, PAGE_HEIGHT - MARGIN - logoHeight + 6, 14, INK);
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - logoHeight - 22 },
    end: { x: RIGHT, y: PAGE_HEIGHT - MARGIN - logoHeight - 22 },
    thickness: 0.75,
    color: RULE,
  });
  return PAGE_HEIGHT - MARGIN - logoHeight - 46;
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number): number {
  page.drawRectangle({ x: MARGIN, y: y - 5, width: RIGHT - MARGIN, height: 20, color: SURFACE_RAISED });
  page.drawText('ITEM', { x: MARGIN + 8, y: y, size: 8, font: bold, color: INK_MUTED });
  drawRight(page, bold, 'QTY', QTY_RIGHT, y, 8, INK_MUTED);
  drawRight(page, bold, 'AMOUNT', RIGHT, y, 8, INK_MUTED);
  return y - 24;
}

function freshPage(doc: PDFDocument, font: PDFFont, bold: PDFFont, workspaceName: string, logo: PDFImage) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { page, y: drawHeader(page, font, bold, workspaceName, logo) };
}

/** Generates a PDF invoice buffer from invoice data. */
export async function generateInvoicePdf(invoice: Invoice, workspaceName: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(readFileSync(LOGO_PATH));

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawHeader(page, font, bold, workspaceName, logo);

  // Invoice meta (right) and bill-to (left) share the same top line.
  const metaRows: Array<[string, string]> = [
    ['Invoice', invoice.number],
    ['Issued', invoice.issueDate],
    ['Due', invoice.dueDate],
  ];
  metaRows.forEach(([label, value], index) => {
    drawRight(page, font, label, RIGHT - 80, y - index * 16, 9, INK_MUTED);
    drawRight(page, font, value, RIGHT, y - index * 16, 9, INK);
  });

  page.drawText('BILL TO', { x: MARGIN, y, size: 8, font: bold, color: INK_MUTED });
  page.drawText(safe(invoice.customerName), {
    x: MARGIN,
    y: y - 16,
    size: 11,
    font: bold,
    color: INK,
    maxWidth: 220,
  });
  page.drawText(safe(invoice.customerEmail), {
    x: MARGIN,
    y: y - 32,
    size: 9,
    font,
    color: INK_MUTED,
    maxWidth: 220,
  });

  y = drawTableHeader(page, bold, y - 64);

  for (const item of invoice.items) {
    const descLines = wrap(font, item.description, 9.5, DESC_MAX);
    const detailLines = item.detail ? wrap(font, item.detail, 8, DESC_MAX) : [];
    const rowHeight = descLines.length * 12 + detailLines.length * 10 + 12;

    if (y - rowHeight < BOTTOM) {
      ({ page, y } = freshPage(doc, font, bold, workspaceName, logo));
      y = drawTableHeader(page, bold, y);
    }

    let lineY = y;
    for (const line of descLines) {
      page.drawText(line, { x: MARGIN + 8, y: lineY, size: 9.5, font, color: INK });
      lineY -= 12;
    }
    for (const line of detailLines) {
      page.drawText(line, { x: MARGIN + 8, y: lineY, size: 8, font, color: INK_MUTED });
      lineY -= 10;
    }

    drawRight(page, font, formatQuantity(item.quantityMilli), QTY_RIGHT, y, 9.5, INK);
    drawRight(page, font, formatMoney(item.totalMinor, invoice.currency), RIGHT, y, 9.5, INK);

    y -= rowHeight;
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: RIGHT, y: y + 4 },
      thickness: 0.5,
      color: RULE,
    });
  }

  // Totals
  const totalRows: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(invoice.subtotalMinor, invoice.currency), false],
    ['Tax', formatMoney(invoice.taxMinor, invoice.currency), false],
  ];
  if (invoice.discountMinor > 0) {
    totalRows.push(['Discount', `-${formatMoney(invoice.discountMinor, invoice.currency)}`, false]);
  }
  totalRows.push(['Total due', formatMoney(invoice.totalMinor, invoice.currency), true]);

  y -= 16;
  if (y - totalRows.length * 18 < BOTTOM) {
    ({ page, y } = freshPage(doc, font, bold, workspaceName, logo));
  }
  for (const [label, value, strong] of totalRows) {
    const rowFont = strong ? bold : font;
    drawRight(page, rowFont, label, RIGHT - 90, y, strong ? 10 : 9, strong ? INK : INK_MUTED);
    drawRight(page, rowFont, value, RIGHT, y, strong ? 11 : 9, strong ? INK : INK_MUTED);
    y -= 18;
  }

  // Notes and payment terms
  const blocks: Array<[string, string]> = [];
  if (invoice.notes) blocks.push(['NOTES', invoice.notes]);
  if (invoice.paymentTerms) blocks.push(['PAYMENT TERMS', invoice.paymentTerms]);

  y -= 12;
  for (const [label, body] of blocks) {
    const lines = wrap(font, body, 9, RIGHT - MARGIN);
    const height = lines.length * 12 + 24;
    if (y - height < BOTTOM) {
      ({ page, y } = freshPage(doc, font, bold, workspaceName, logo));
    }
    page.drawText(label, { x: MARGIN, y, size: 8, font: bold, color: INK_MUTED });
    y -= 16;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: INK });
      y -= 12;
    }
    y -= 12;
  }

  return Buffer.from(await doc.save());
}
