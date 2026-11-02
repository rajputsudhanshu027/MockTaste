import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readWholeMaterial } from '../lib/extract.mjs';

function pdfWithPages(count) {
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pages = [];
  for (let number = 1; number <= count; number++) {
    const text = `BT /F1 12 Tf 50 700 Td (Study marker page ${number}: percentages express numbers out of one hundred.) Tj ET`;
    const contentId = objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    pages.push(objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Count ${count} /Kids [${pages.map(id => `${id} 0 R`).join(' ')}] >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return pdf + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

test('upload preparation reads PDF pages beyond the previous range limit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-complete-pdf-'));
  const file = path.join(dir, 'study.pdf');
  try {
    fs.writeFileSync(file, pdfWithPages(41));
    const result = await readWholeMaterial({ kind: 'pdf', name: 'study.pdf' }, { materialPath: () => file });
    assert.equal(result.pageCount, 41);
    assert.match(result.text, /Study marker page 1:/);
    assert.match(result.text, /Study marker page 41:/);
    assert.deepEqual(result.skippedPages, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
