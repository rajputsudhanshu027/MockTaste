import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { allowedSource } from './core.mjs';
import { htmlToText } from './extract.mjs';

const USER_AGENT = 'MockTaste/0.1 (personal local study tool)';

export function colorAnswerKeyText(xml) {
  const greenFonts = new Set();
  for (const match of String(xml).matchAll(/<fontspec\b([^>]*)\/?\s*>/gi)) {
    const id = match[1].match(/\bid="(\d+)"/)?.[1];
    const color = match[1].match(/\bcolor="#([0-9a-f]{6})"/i)?.[1];
    if (!id || !color) continue;
    const red = parseInt(color.slice(0, 2), 16);
    const green = parseInt(color.slice(2, 4), 16);
    const blue = parseInt(color.slice(4, 6), 16);
    if (green > red * 1.35 && green > blue * 1.35 && green > 90) greenFonts.add(id);
  }
  if (!greenFonts.size) return '';
  const lines = [];
  for (const match of String(xml).matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const font = match[1].match(/\bfont="(\d+)"/)?.[1];
    const value = htmlToText(match[2]).replace(/\s+/g, ' ').trim();
    if (value) lines.push(`${greenFonts.has(font) ? '[CORRECT] ' : ''}${value}`);
  }
  return lines.join('\n');
}

export function parseColorPaperQuestions(text) {
  const sections = ['awareness', 'math', 'reasoning'];
  const questions = [];
  let sectionIndex = -1;
  let current = null;
  const finish = () => {
    if (!current) return;
    if (current.section !== 'awareness' && current.stem.length >= 12 && current.options.length === 4 && current.correct.length === 1 && current.options.every(Boolean)) {
      questions.push({
        stem: current.stem.trim(), options: current.options.map((option) => option.trim()),
        answerIndex: current.correct[0], section: current.section,
        sourceLocation: `Question ${current.number}`,
      });
    }
  };
  for (const raw of String(text).split(/\n/)) {
    const line = raw.trim();
    const heading = line.match(/^Q\.\s*(\d+)\b\s*(.*)$/i);
    if (heading) {
      finish();
      const number = Number(heading[1]);
      if (number === 1) sectionIndex++;
      current = { number, section: sections[sectionIndex] || 'unknown', stem: heading[2] || '', options: [], correct: [], inAnswers: false };
      continue;
    }
    if (!current || !line || /^Section\s*:/i.test(line)) continue;
    const afterAns = line.replace(/^Ans\b\s*/i, '');
    if (afterAns !== line) current.inAnswers = true;
    if (!current.inAnswers) { current.stem += ` ${line}`; continue; }
    const correct = /^\[CORRECT\]\s*/.test(afterAns);
    const value = afterAns.replace(/^\[CORRECT\]\s*/, '');
    const option = value.match(/^([1-4])\.\s*(.*)$/);
    if (option) {
      const index = Number(option[1]) - 1;
      if (index !== current.options.length) continue;
      current.options.push(option[2]);
      if (correct) current.correct.push(index);
    } else if (value && current.options.length && current.options.length < 4 && !/^Ans$/i.test(value)) {
      current.options[current.options.length - 1] += ` ${value}`;
    }
  }
  finish();
  return questions;
}

export async function fetchApproved(rawUrl, hosts, maxBytes = 12 * 1024 * 1024) {
  let url = new URL(rawUrl);
  for (let redirect = 0; redirect < 5; redirect++) {
    if (!allowedSource(url.href, hosts)) throw new Error(`Approve ${url.hostname} before using this source`);
    const response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(25000),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf,text/plain;q=0.9' },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = new URL(response.headers.get('location'), url);
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maxBytes) throw new Error('Source is too large to import');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Source is too large to import');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const contentType = response.headers.get('content-type') || '';
    let text;
    let answerKeyText = '';
    if (contentType.includes('pdf') || url.pathname.toLowerCase().endsWith('.pdf') || bytes.subarray(0, 4).toString() === '%PDF') {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-source-'));
      try {
        const file = path.join(temp, 'source.pdf');
        fs.writeFileSync(file, bytes);
        text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
        const xmlPath = path.join(temp, 'source.xml');
        try {
          execFileSync('pdftohtml', ['-xml', '-hidden', '-i', file, xmlPath], { stdio: 'ignore', timeout: 30000 });
          answerKeyText = colorAnswerKeyText(fs.readFileSync(xmlPath, 'utf8'));
        } catch { /* Plain text remains available for PDFs without a colour key. */ }
      } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    } else {
      text = htmlToText(bytes.toString('utf8'));
    }
    const html = bytes.toString('utf8');
    const date = html.match(/(?:article:published_time|datePublished)[^>\n]{0,160}?(\d{4}-\d{2}-\d{2})/i)?.[1]
      || response.headers.get('last-modified') || null;
    return { url: url.href, text: text.trim().slice(0, 100000), answerKeyText: answerKeyText.slice(0, 100000), date, contentType, html: contentType.includes('html') ? html : null };
  }
  throw new Error('Source redirected too many times');
}

export function paperLinksFromHtml(html, pageUrl, hosts) {
  const links = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(match[1].replace(/&amp;/g, '&'), pageUrl).href; } catch { continue; }
    if (!allowedSource(url, hosts)) continue;
    const label = htmlToText(match[2]).replace(/\s+/g, ' ').trim();
    const descriptor = `${url} ${label}`.toLowerCase();
    if (!descriptor.includes('ntpc')) continue;
    if (!/\.pdf(?:[?#]|$)/i.test(url)) continue;
    if (!/(under.?graduate|\bug\b|cbt.?1)/i.test(descriptor)) continue;
    if (/cbt.?2/i.test(descriptor)) continue;
    if (!/(english|\beng\b)/i.test(descriptor)) continue;
    const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
    const readableLabel = /^(click here|download|view|pdf)$/i.test(label) ? filename : label;
    links.push({ url, label: readableLabel || 'RRB NTPC paper', provenance: /memory.?based/i.test(descriptor) ? 'Memory-based reconstruction' : 'Third-party claimed paper' });
  }
  return [...new Map(links.map((link) => [link.url, link])).values()];
}
