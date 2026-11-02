import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const INITIAL = () => ({
  version: 1,
  settings: { approvedHosts: [], model: 'gpt-6.1-sol', reminderHour: 18 },
  materials: [], sourcePages: [], pastQuestions: [], tests: [], attempts: [], drafts: [],
  friendLinks: [], friendReports: [],
  weeks: [],
});

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.uploadDir = path.join(dir, 'uploads');
    this.file = path.join(dir, 'state.json');
    fs.mkdirSync(this.uploadDir, { recursive: true, mode: 0o700 });
    this.state = fs.existsSync(this.file) ? { ...INITIAL(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) } : INITIAL();
    this.save();
  }

  save() {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  update(change) {
    const result = change(this.state);
    this.save();
    return result;
  }

  addMaterial({ name, files }) {
    if (!Array.isArray(files) || !files.length) throw new Error('Choose at least one file');
    if (files.length > 25) throw new Error('An image group can contain at most 25 files');
    const total = files.reduce((sum, file) => sum + Buffer.byteLength(file.base64 || '', 'base64'), 0);
    if (total > 30 * 1024 * 1024) throw new Error('Upload must be 30 MB or smaller');
    const extensions = files.map((file) => path.extname(file.name || '').toLowerCase());
    const valid = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp'];
    if (extensions.some((ext) => !valid.includes(ext))) throw new Error('Use PDF, DOCX, PNG, JPEG, or WEBP files');
    if (files.length > 1 && extensions.some((ext) => !['.png', '.jpg', '.jpeg', '.webp'].includes(ext))) {
      throw new Error('Only images can be grouped');
    }
    const id = randomUUID();
    const storedFiles = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = Buffer.from(file.base64 || '', 'base64');
        if (!buffer.length) throw new Error('One of the files is empty');
        const storedName = `${id}-${i}${extensions[i]}`;
        fs.writeFileSync(path.join(this.uploadDir, storedName), buffer, { mode: 0o600 });
        storedFiles.push({ name: file.name, storedName, size: buffer.length });
      }
      const material = {
        id, name: String(name || files[0].name).slice(0, 160),
        kind: extensions[0] === '.pdf' ? 'pdf' : extensions[0] === '.docx' ? 'docx' : 'images',
        files: storedFiles, extractedText: '', skippedPages: [], pageCount: null,
        createdAt: new Date().toISOString(),
      };
      this.update((state) => state.materials.unshift(material));
      return material;
    } catch (error) {
      for (const file of storedFiles) fs.rmSync(path.join(this.uploadDir, file.storedName), { force: true });
      throw error;
    }
  }

  materialPath(material, index = 0) {
    const storedName = material?.files?.[index]?.storedName;
    if (!storedName || !/^[\w-]+\.(pdf|docx|png|jpg|jpeg|webp)$/.test(storedName)) throw new Error('File not found');
    return path.join(this.uploadDir, storedName);
  }

  deleteMaterial(id) {
    const material = this.state.materials.find((item) => item.id === id);
    if (!material) return false;
    for (const file of material.files) fs.rmSync(path.join(this.uploadDir, file.storedName), { force: true });
    this.update((state) => { state.materials = state.materials.filter((item) => item.id !== id); });
    return true;
  }
}
