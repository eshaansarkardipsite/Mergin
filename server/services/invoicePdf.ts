import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { formatMoney } from '../../shared/money';
import type { Invoice } from '../../shared/types';

const PAGE_WIDTH = 612; // 8.5in
const PAGE_HEIGHT = 792; // 11in
const MARGIN = 54; // 0.75in
const INK = rgb(0.06, 0.06, 0.06);
const INK_MUTED = rgb(0.35, 0.35, 0.35);
const SURFACE_RAISED = rgb(0.96, 0.96, 0.96);
const SURFACE_CONTAINER_LOW = rgb(0.92, 0.92, 0.92);

function money(minor: number): string {
  return formatMoney(minor, 'USD');
}

async function drawHeader(page: any, font: any, boldFont: any, workspaceName: string): Promise<void> {
  const { width } = page.getSize();
  const fontSize = 14;

  page.drawText('MERGIN', {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN + 8,
    size: fontSize,
    font: boldFont,
    color: INK,
  });
  page.drawText(workspaceName, {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 18,
    size: 10,
    font,
    color: INK_MUTED,
  });

  page.drawText('Invoice', {
    x: width - MARGIN - 100,
    y: PAGE_HEIGHT - MARGIN + 8,
    size: fontSize,
    font: boldFont,
    color: INK,
  });
}

async function drawMeta(
  page: any,
  font: any,
  boldFont: any,
  invoiceNumber: string,
  issueDate: string,
  dueDate: string,
): Promise<number> {
  const { width } = page.getSize();
  let y = PAGE_HEIGHT - MARGIN - 55;

  const meta = [
    { label: 'Invoice', value: invoiceNumber },
    { label: 'Issued', value: issueDate },
    { label: 'Due', value: dueDate },
  ];

  for (const m of meta) {
    page.drawText(m.label, {
      x: width - MARGIN - 120,
      y,
      size: 10,
      font: boldFont,
      color: INK_MUTED,
    });
    page.drawText(m.value, {
      x: width - MARGIN - 40,
      y,
      size: 10,
      font,
      color: INK,
    });
    y -= 16;
  }

  return y;
}

async function drawBillTo(
  page: any,
  font: any,
  boldFont: any,
  customerName: string,
  customerEmail: string,
  startY: number,
): Promise<number> {
  const y = startY - 20;

  page.drawText('Bill to', {
    x: MARGIN,
    y,
    size: 10,
    font: boldFont,
    color: INK_MUTED,
  });
  page.drawText(customerName, {
    x: MARGIN,
    y: y - 16,
    size: 11,
    font: boldFont,
    color: INK,
  });
  page.drawText(customerEmail, {
    x: MARGIN,
    y: y - 32,
    size: 10,
    font,
    color: INK_MUTED,
  });

  return y - 52;
}

async function drawItemsTable(
  page: any,
  font: any,
  boldFont: any,
  items: { description: string; detail?: string; quantityMilli: number; unitPriceMinor: number; totalMinor: number }[],
  startY: number,
): Promise<number> {
  const { width } = page.getSize();
  const colX = {
    item: MARGIN,
    qty: width - MARGIN - 140,
    amount: width - MARGIN - 60,
  };

  let y = startY;

  // Header
  page.drawRect({
    x: MARGIN,
    y: y - 12,
    width: width - MARGIN * 2,
    height: 24,
    color: SURFACE_RAISED,
  });

  page.drawText('Item', { x: colX.item, y: y - 8, size: 9, font: boldFont, color: INK_MUTED });
  page.drawText('Qty', { x: colX.qty, y: y - 8, size: 9, font: boldFont, color: INK_MUTED, textAlign: 'right' });
  page.drawText('Amount', { x: colX.amount, y: y - 8, size: 9, font: boldFont, color: INK_MUTED, textAlign: 'right' });

  y -= 28;

  for (const item of items) {
    const qty = (item.quantityMilli / 1000).toFixed(3).replace(/\.?0+$/, '');
    const amount = money(item.totalMinor);

    page.drawText(item.description, {
      x: colX.item,
      y: y - 6,
      size: 9.5,
      font,
      color: INK,
      maxWidth: colX.qty - colX.item - 10,
    });
    if (item.detail) {
      page.drawText(item.detail, {
        x: colX.item,
        y: y - 16,
        size: 8,
        font,
        color: INK_MUTED,
        maxWidth: colX.qty - colX.item - 10,
      });
    }
    page.drawText(qty, {
      x: colX.qty,
      y: y - 6,
      size: 9.5,
      font,
      color: INK,
      textAlign: 'right',
    });
    page.drawText(amount, {
      x: colX.amount,
      y: y - 6,
      size: 9.5,
      font,
      color: INK,
      textAlign: 'right',
    });

    y -= item.detail ? 32 : 22;
    // Draw row divider
    page.drawLine({
      start: { x: MARGIN, x2: width - MARGIN, y, y2: y },
      thickness: 0.5,
      color: SURFACE_CONTAINER_LOW,
    });
    y -= 2;
  }

  return y;
}

async function drawTotals(
  page: any,
  font: any,
  boldFont: any,
  subtotalMinor: number,
  taxMinor: number,
  discountMinor: number,
  totalMinor: number,
  startY: number,
): Promise<number> {
  const { width } = page.getSize();
  let y = startY - 10;

  const rows = [
    { label: 'Subtotal', value: money(subtotalMinor) },
    { label: 'Tax', value: money(taxMinor) },
    { label: 'Discount', value: `−${money(discountMinor)}` },
    { label: 'Total due', value: money(totalMinor), bold: true },
  ];

  for (const row of rows) {
    page.drawText(row.label, {
      x: width - MARGIN - 100,
      y,
      size: row.bold ? 10 : 9,
      font: row.bold ? boldFont : font,
      color: row.bold ? INK : INK_MUTED,
    });
    page.drawText(row.value, {
      x: width - MARGIN - 30,
      y,
      size: row.bold ? 11 : 9,
      font: row.bold ? boldFont : font,
      color: row.bold ? INK : INK_MUTED,
      textAlign: 'right',
    });
    y -= 18;
  }

  return y - 12;
}

async function drawNotes(page: any, font: any, notes: string, paymentTerms: string, startY: number): Promise<void> {
  if (!notes && !paymentTerms) return;
  let y = startY - 10;

  if (notes) {
    page.drawText('Notes', {
      x: MARGIN,
      y,
      size: 10,
      font: undefined as any,
      color: INK_MUTED,
    });
    page.drawText(notes, {
      x: MARGIN,
      y: y - 16,
      size: 9.5,
      font,
      color: INK,
      maxWidth: PAGE_HEIGHT - MARGIN * 2 - 100,
    });
    y -= 32;
  }
  if (paymentTerms) {
    page.drawText('Payment terms', {
      x: MARGIN,
      y,
      size: 10,
      font: undefined as any,
      color: INK_MUTED,
    });
    page.drawText(paymentTerms, {
      x: MARGIN,
      y: y - 16,
      size: 9.5,
      font,
      color: INK,
    });
  }
}

/** Generates a PDF invoice buffer from invoice data. */
export async function generateInvoicePdf(invoice: Invoice, workspaceName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawHeader(page, font, boldFont, workspaceName);

  const metaY = await drawMeta(page, font, boldFont, invoice.number, invoice.issueDate, invoice.dueDate);

  const billToY = await drawBillTo(page, font, boldFont, invoice.customerName, invoice.customerEmail, metaY);

  const itemsY = await drawItemsTable(page, font, boldFont, invoice.items, billToY);

  const totalsY = await drawTotals(
    page,
    font,
    boldFont,
    invoice.subtotalMinor,
    invoice.taxMinor,
    invoice.discountMinor,
    invoice.totalMinor,
    itemsY,
  );

  await drawNotes(page, font, invoice.notes, invoice.paymentTerms, totalsY);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
