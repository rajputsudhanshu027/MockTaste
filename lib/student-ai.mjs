import { ChatGPTAI } from './ai.mjs';

const localGenerationInstruction = 'Create single-answer multiple-choice practice questions';

export class StudentAI {
  constructor(auth, { localModelUrl = process.env.MOCKTASTE_LOCAL_MODEL_URL || '' } = {}) {
    this.chatgpt = new ChatGPTAI(auth);
    this.localModelUrl = localModelUrl ? new URL(localModelUrl) : null;
    if (this.localModelUrl && !['localhost', '127.0.0.1', '::1'].includes(this.localModelUrl.hostname)) {
      throw new Error('The fine-tuned model URL must point to this computer (localhost).');
    }
  }

  async request(options) {
    if (!this.localModelUrl || !options.instructions.startsWith(localGenerationInstruction)) {
      return this.chatgpt.request(options);
    }
    let request;
    try { request = JSON.parse(options.text); }
    catch { throw new Error('The local model request could not be read.'); }
    const response = await fetch(this.localModelUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sources: request.sources,
        count: Math.min(5, request.count),
        difficulty: request.difficulty,
        previousStems: request.previousStems || [],
      }),
      signal: AbortSignal.timeout(300000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Local model request failed (${response.status})`);
    return JSON.stringify(result);
  }

  imageToText(...args) { return this.chatgpt.imageToText(...args); }
}
