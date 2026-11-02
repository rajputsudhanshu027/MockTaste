import { PDFDocument } from 'pdfkit';
import { fileURLToPath } from 'node:url';

const font = fileURLToPath(new URL('../public/fonts/public-sans-regular.ttf', import.meta.url));
const headingFont = fileURLToPath(new URL('../public/fonts/public-sans-semibold.ttf', import.meta.url));
const sections = { awareness: 'General Awareness', math: 'Mathematics', reasoning: 'Reasoning' };
const colors = { ink: '#17233C', muted: '#607086', blue: '#384BC2', line: '#E2E7EF', green: '#16765C', red: '#B13E48' };
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function reportFilename(name) {
  const slug = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'student';
  return `rrb-report-${slug}.pdf`;
}

export async function createReportPdf(report, { title = 'Mock test' } = {}) {
  const doc = new PDFDocument({ size: 'A4', bufferPages: true,
    margins: { top: 84, right: 48, bottom: 64, left: 48 },
    info: { Title: `Test report - ${clean(report.studentName)}`, Author: 'MockTaste', Subject: clean(title) },
  });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('Body', font).registerFont('Heading', headingFont).font('Body');
  const width = doc.page.width - 96;
  const header = () => {
    doc.save();
    doc.save().translate(48, 29).scale(27 / 64);
    doc.roundedRect(0, 0, 64, 64, 15).fill(colors.blue);
    doc.strokeColor('white').lineCap('round').lineJoin('round');
    doc.path('M15 46V18L32 34L49 18V46').lineWidth(6).stroke();
    doc.path('M32 34V46').lineWidth(4).stroke();
    doc.restore();
    doc.font('Heading').fontSize(12).fillColor(colors.ink).text('MockTaste', 82, 33, { lineBreak: false });
    doc.font('Body').fontSize(8).fillColor(colors.muted).text('Assessment report', 350, 36, { width: width - 302, align: 'right', lineBreak: false });
    doc.moveTo(48, 68).lineTo(doc.page.width - 48, 68).strokeColor(colors.line).lineWidth(.6).stroke();
    doc.restore();
    doc.x = 48; doc.y = 84;
  };
  doc.on('pageAdded', header);
  header();
  const space = needed => { if (doc.y + needed > doc.page.height - 64) doc.addPage(); };
  const paragraph = (text, { size = 10, color = colors.ink, gap = 7, strong = false } = {}) => {
    doc.font(strong ? 'Heading' : 'Body').fontSize(size).fillColor(color).text(clean(text), 48, doc.y, { width, lineGap: 3 });
    doc.y += gap;
  };
  const heading = text => {
    space(75);
    doc.y += 13;
    paragraph(text, { size: 14, color: colors.blue, gap: 10, strong: true });
  };
  const performance = (label, entries) => {
    if (!entries.length) return;
    heading(label);
    for (const [name, result] of entries) {
      doc.font('Body').fontSize(10);
      const height = Math.max(27, doc.heightOfString(clean(name), { width: width - 135, lineGap: 3 }) + 12);
      space(height);
      const y = doc.y;
      doc.fillColor(colors.ink).text(clean(name), 48, y, { width: width - 135, lineGap: 3 });
      doc.fillColor(colors.muted).text(`${result.correct}/${result.possible} correct`, 48 + width - 122, y, { width: 122, align: 'right' });
      doc.moveTo(48, y + height - 6).lineTo(48 + width, y + height - 6).lineWidth(.5).strokeColor(colors.line).stroke();
      doc.y = y + height;
    }
  };

  paragraph('Test report', { size: 10, color: colors.muted, gap: 5 });
  paragraph(report.studentName, { size: 24, gap: 8, strong: true });
  paragraph(title, { size: 12, gap: 5 });
  const date = new Date(report.submittedAt);
  paragraph(`Submitted: ${Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} (IST)`, { size: 9, color: colors.muted, gap: 15 });
  space(100);
  const scoreY = doc.y;
  doc.roundedRect(48, scoreY, width, 84, 7).fill('#EEF0FF');
  doc.fontSize(9).fillColor(colors.blue).text('Total score', 65, scoreY + 14, { width: 190 });
  doc.font('Heading').fontSize(25).fillColor(colors.ink).text(`${report.result.score} / ${report.result.possible}`, 65, scoreY + 32, { width: 205 });
  [['Correct', report.result.correct], ['Incorrect', report.result.wrong], ['Unanswered', report.result.unanswered]].forEach(([label, value], index) => {
    const x = 48 + width - 238 + index * 76;
    doc.font('Body').fontSize(8).fillColor(colors.muted).text(label, x, scoreY + 17, { width: 73 });
    doc.font('Heading').fontSize(18).fillColor(colors.ink).text(String(value), x, scoreY + 37, { width: 73 });
  });
  doc.x = 48; doc.y = scoreY + 98;
  paragraph('Scoring: +1 correct, -1/3 incorrect, 0 unanswered.', { size: 8, color: colors.muted });

  const weak = Object.entries(report.result.byTopic || {}).filter(([, value]) => value.correct < value.possible)
    .sort((a, b) => a[1].correct / a[1].possible - b[1].correct / b[1].possible).slice(0, 3);
  heading('Focus next');
  paragraph(weak.length ? weak.map(([name]) => name).join(', ') : 'Every topic was answered correctly.');
  if (report.guidance?.trim()) {
    heading('Feedback from the creator');
    paragraph(report.guidance);
  }
  performance('Section performance', Object.entries(report.result.bySection || {}).map(([key, result]) => [sections[key] || key, result]));
  performance('Topic performance', Object.entries(report.result.byTopic || {}));

  heading('Answer review');
  for (const item of report.review || []) {
    space(110);
    const status = item.selected === null || item.selected === undefined ? 'Unanswered' : item.right ? 'Correct' : 'Incorrect';
    paragraph(`Question ${item.number} | ${status}${item.topic ? ` | ${item.topic}` : ''}`, { size: 9, color: colors.muted, gap: 6 });
    paragraph(item.stem, { size: 11, gap: 9, strong: true });
    for (const [index, option] of (item.options || []).entries()) {
      paragraph(`${String.fromCharCode(65 + index)}. ${option}`, { size: 9, color: option === item.correct ? colors.green : colors.ink, gap: 4 });
    }
    paragraph(`Your answer: ${item.selected ?? 'Unanswered'}`, { size: 9, color: item.right ? colors.green : colors.red, gap: 4 });
    paragraph(`Correct answer: ${item.correct}`, { size: 9, color: colors.green, gap: 8 });
    if (item.explanation) paragraph(`Explanation: ${item.explanation}`, { size: 9 });
    if (item.workedSolution && item.workedSolution !== item.explanation) paragraph(`Worked solution: ${item.workedSolution}`, { size: 9 });
    if (item.sourceReference) paragraph(`Source: ${[item.sourceReference.label, item.sourceReference.location, item.sourceReference.url].filter(Boolean).join(' | ')}`, { size: 8, color: colors.muted });
    doc.y += 12;
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Body').fontSize(8).fillColor(colors.muted).text('MockTaste | Personal assessment report', 48, doc.page.height - 35, { width: 350, lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, 430, doc.page.height - 35, { width: width - 382, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return complete;
}
