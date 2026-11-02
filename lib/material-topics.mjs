import { createHash } from 'node:crypto';

export const materialHash = text => createHash('sha256').update(String(text || '')).digest('hex');
const normalize = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();

export async function analyzeMaterials({ store, ai, materialIds, progress = () => {} }) {
  const ids = [...new Set(materialIds || [])];
  if (!ids.length) throw new Error('Upload or select study material first');
  const combined = new Map();
  for (const id of ids) {
    const material = store.state.materials.find(item => item.id === id);
    if (!material?.extractedText?.trim()) throw new Error('Read the selected document before identifying its topics');
    const hash = materialHash(material.extractedText);
    if (material.analysisHash !== hash || !material.detectedTopics?.length) {
      const found = new Map();
      // Inspect the complete selection, including chapters beyond the first model packet.
      for (let start = 0; start < material.extractedText.length; start += 11500) {
        const end = Math.min(start + 12000, material.extractedText.length);
        const text = material.extractedText.slice(start, end);
        progress(`Identifying topics in ${material.name} · ${Math.round(end / material.extractedText.length * 100)}%`);
        const topics = await ai.detectTopics({ text });
        if (!Array.isArray(topics)) throw new Error('Topic analysis returned an unreadable response. Try again.');
        for (const topic of topics.slice(0, 12)) {
          const name = String(topic.name || '').trim().slice(0, 100);
          const evidence = String(topic.evidence || '').trim();
          if (!name || !['awareness', 'math', 'reasoning'].includes(topic.section)
            || evidence.length < 8 || !normalize(text).includes(normalize(evidence))) continue;
          const key = `${topic.section}:${name.toLowerCase()}`;
          const entry = found.get(key) || { name, section: topic.section, evidence, ranges: [] };
          entry.ranges.push({ start, end });
          found.set(key, entry);
        }
        if (end === material.extractedText.length) break;
      }
      if (!found.size) throw new Error(`No supported test topics found in ${material.name}. Review the extracted text or upload clearer study notes.`);
      store.update(() => {
        material.detectedTopics = [...found.values()];
        material.analysisHash = hash;
      });
    }
    for (const topic of material.detectedTopics) {
      combined.set(`${topic.section}:${topic.name.toLowerCase()}`, { name: topic.name, section: topic.section });
    }
  }
  return [...combined.values()];
}
