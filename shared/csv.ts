const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/;

/** Escape one CSV cell and stop spreadsheet formula injection in text values. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(text) && !NEGATIVE_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
