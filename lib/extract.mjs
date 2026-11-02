import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options });
}

export function pdfPageCount(file) {
  const output = run('pdfinfo', [file]);
  return Number(output.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
}

function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    if (/^&#x/i.test(entity)) return String.fromCodePoint(parseInt(entity.slice(3, -1), 16));
    if (/^&#/i.test(entity)) return String.fromCodePoint(parseInt(entity.slice(2, -1), 10));
    return entity;
  });
}

export function docxParagraphs(file) {
  const xml = run('unzip', ['-p', file, 'word/document.xml']);
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match) => {
    const inner = match[1];
    const heading = inner.match(/<w:pStyle\s+w:val="([^"]+)"/i)?.[1] || '';
    const text = [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((part) => decodeXml(part[1])).join('');
    return { heading, text: text.trim() };
  }).filter((item) => item.text);
}

export function extractDocx(file) {
  return docxParagraphs(file).map((item, index) => `[Paragraph ${index + 1}${item.heading ? ` · ${item.heading}` : ''}] ${item.text}`).join('\n');
}

export async function extractMaterial(material, store, { from = 1, to = null, vision = null } = {}) {
  const skippedPages = [];
  let text = '';
  let pageCount = null;
  if (material.kind === 'docx') {
    const paragraphs = docxParagraphs(store.materialPath(material));
    pageCount = paragraphs.length;
    const start = Math.max(1, Number(from) || 1);
    const end = Math.min(pageCount, Number(to) || Math.min(pageCount, start + 39));
    if (end < start || end - start > 199) throw new Error('Choose at most 200 DOCX paragraphs at a time');
    text = paragraphs.slice(start - 1, end).map((item, index) => `[Paragraph ${start + index}${item.heading ? ` · ${item.heading}` : ''}] ${item.text}`).join('\n');
  } else if (material.kind === 'images') {
    pageCount = material.files.length;
    const start = Math.max(1, Number(from) || 1);
    const end = Math.min(pageCount, Number(to) || pageCount);
    if (end < start || end - start > 19) throw new Error('Choose at most 20 images at a time');
    for (let page = start; page <= end; page++) {
      if (!vision) { skippedPages.push(page); continue; }
      const filename = store.materialPath(material, page - 1);
      const ext = path.extname(filename).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const extracted = await vision(fs.readFileSync(filename), mime);
      if (extracted.includes('[complex visual skipped]')) { skippedPages.push(page); continue; }
      text += `[Image ${page}]\n${extracted}\n\n`;
    }
  } else if (material.kind === 'pdf') {
    const file = store.materialPath(material);
    pageCount = pdfPageCount(file);
    const start = Math.max(1, Number(from) || 1);
    const end = Math.min(pageCount, Number(to) || Math.min(pageCount, start + 19));
    if (end < start || end - start > 39) throw new Error('Choose at most 40 PDF pages at a time');
    for (let page = start; page <= end; page++) {
      const pageText = run('pdftotext', ['-f', String(page), '-l', String(page), '-layout', file, '-']).trim();
      if (pageText.length > 30) {
        text += `[Page ${page}]\n${pageText}\n\n`;
        continue;
      }
      if (!vision) { skippedPages.push(page); continue; }
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-page-'));
      try {
        const prefix = path.join(temp, 'page');
        run('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', '125', '-jpeg', file, prefix]);
        const extracted = await vision(fs.readFileSync(`${prefix}.jpg`), 'image/jpeg');
        if (extracted.includes('[complex visual skipped]')) { skippedPages.push(page); continue; }
        text += `[Page ${page}]\n${extracted}\n\n`;
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    }
  }
  return { text: text.trim(), pageCount, skippedPages };
}

export function htmlToText(html) {
  return decodeXml(String(html)
    .replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*\n+/g, '\n'));
}

export async function readWholeMaterial(material, store, { vision = null, progress = () => {} } = {}) {
  const size = material.kind === 'docx' ? 200 : material.kind === 'images' ? 20 : 40;
  const parts = [];
  const skippedPages = [];
  let pageCount = 1;
  for (let from = 1; from <= pageCount; from += size) {
    progress(`Reading ${material.name} · ${material.kind === 'docx' ? 'paragraphs' : 'pages'} ${from}–${from + size - 1}`);
    const result = await extractMaterial(material, store, { from, to: from + size - 1, vision });
    pageCount = result.pageCount;
    if (result.text) parts.push(result.text);
    skippedPages.push(...result.skippedPages);
  }
  return { text: parts.join('\n\n'), pageCount, skippedPages };
}
