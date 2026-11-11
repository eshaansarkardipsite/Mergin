import { describe, expect, it } from 'vitest';
import { escapeCsvCell } from '../shared/csv';

describe('CSV escaping', () => {
  it('neutralises spreadsheet formulas in text cells', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('keeps negative amounts numeric and quotes separators', () => {
    expect(escapeCsvCell('-12.00')).toBe('-12.00');
    expect(escapeCsvCell('Acme, Inc.')).toBe('"Acme, Inc."');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell(null)).toBe('');
  });
});
