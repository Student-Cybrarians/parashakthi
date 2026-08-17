class ContextService {
  constructor({ maxTurns = 80, maxScreenAgeMs = 15000 } = {}) {
    this.maxTurns = maxTurns;
    this.maxScreenAgeMs = maxScreenAgeMs;
    this.turns = [];
    this.latestScreenImage = null;
    this.latestScreenAt = 0;
  }

  addTranscript(text, source = 'interviewer') {
    const value = String(text || '').trim();
    if (!value) return;
    this.turns.push({ role: source === 'user' ? 'user' : 'interviewer', text: value, at: new Date().toISOString() });
    this._trim();
  }

  addAssistant(text) {
    const value = String(text || '').trim();
    if (!value) return;
    this.turns.push({ role: 'assistant', text: value, at: new Date().toISOString() });
    this._trim();
  }

  setScreenImage(base64Jpeg) {
    const value = String(base64Jpeg || '').trim();
    if (!value) return;
    this.latestScreenImage = value;
    this.latestScreenAt = Date.now();
  }

  getScreenImage() {
    if (!this.latestScreenImage || Date.now() - this.latestScreenAt > this.maxScreenAgeMs) return null;
    return this.latestScreenImage;
  }

  getPrompt({ mode = 'interview', language = 'auto' } = {}) {
    const transcript = this.turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    return [
      `You are a real-time ${mode} assistant.`,
      `Coding language: ${language}.`,
      'Answer the latest interviewer question using the available context.',
      'Do not mention that you are an AI assistant. Be concise enough for a live conversation.',
      'For coding questions, provide an efficient solution and brief complexity analysis.',
      'If the screenshot contains a coding problem, error, diagram, or relevant shared-screen context, incorporate it.',
      transcript ? `CONVERSATION:\n${transcript}` : ''
    ].filter(Boolean).join('\n\n');
  }

  _trim() {
    if (this.turns.length > this.maxTurns) this.turns.splice(0, this.turns.length - this.maxTurns);
  }
}

module.exports = ContextService;
