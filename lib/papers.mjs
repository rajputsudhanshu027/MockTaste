import { APPROVED_HOSTS } from './core.mjs';
import { fetchApproved, parseColorPaperQuestions } from './sources.mjs';

// Public English UG CBT-1 answer-key PDFs. These are third-party copies, not official RRB releases.
export const PAPER_CATALOG = Object.freeze([
  {
    label: 'Prepp · UG CBT-1 · 7 Aug 2025, Shift 1',
    url: 'https://cdn-images.prepp.in/public/image/RRB_NTPC_UG_Answer_Key_English_07_08_2025_Shift_1_Paper_2__95756d68b349d4c5f8e759a581479476.pdf',
  },
  {
    label: 'Prepp · UG CBT-1 · 7 Aug 2025, Shift 2',
    url: 'https://cdn-images.prepp.in/public/image/RRB_NTPC_UG_Answer_Key_English_07_08_2025_Shift_2_Paper_bd0aa034b5e4ccab7dfd55c793f9893f.pdf',
  },
  {
    label: 'Prepp · UG CBT-1 · 8 Aug 2025, Shift 1',
    url: 'https://cdn-images.prepp.in/public/image/RRB_NTPC_UG_Answer_Key_English_08_08_2025_Shift_1_Paper_35ad90b3baa6bb3a12286caa7e772c5a.pdf',
  },
]);

export async function ensurePastPaperPool({ store, ai, count, progress = () => {}, fetchPaper = fetchApproved }) {
  const existing = new Set(store.state.pastQuestions.map((item) => item.stem.toLowerCase()));
  let needed = Math.max(0, count - existing.size);
  if (!needed) return 0;
  let imported = 0;
  for (const paper of PAPER_CATALOG) {
    if (!needed) break;
    try {
      progress(`Finding past-paper questions · ${paper.label}`);
      const fetched = await fetchPaper(paper.url, APPROVED_HOSTS, 20 * 1024 * 1024);
      const candidates = parseColorPaperQuestions(fetched.answerKeyText || '')
        .filter((item) => !existing.has(item.stem.toLowerCase()))
        .slice(0, Math.min(60, needed * 2));
      for (let offset = 0; offset < candidates.length && needed; offset += 5) {
        const solved = await ai.enrichColorPaperQuestions({
          candidates: candidates.slice(offset, offset + Math.min(5, needed)),
          url: paper.url, label: paper.label, provenance: 'Third-party claimed paper',
        });
        const checked = await ai.auditQuestions(solved);
        store.update((state) => {
          needed = Math.max(0, count - state.pastQuestions.length);
          for (const question of checked) {
            const key = question.stem.toLowerCase();
            if (existing.has(key) || state.pastQuestions.some((item) => item.stem.toLowerCase() === key) || !needed) continue;
            state.pastQuestions.push(question);
            existing.add(key);
            needed--;
            imported++;
          }
        });
      }
    } catch {
      // An unavailable third-party paper must not prevent new practice questions.
    }
  }
  return imported;
}
