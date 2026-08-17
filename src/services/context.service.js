class ContextService {
  constructor({ maxTurns = 80 } = {}) {
    this.maxTurns = maxTurns;
    this.turns = [];
    this.latestScreenContext = '';
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

  setScreenContext(text) {
    this.latestScreenContext = String(text || '').trim();
  }

  getPrompt({ mode = 'interview', language = 'auto' } = {}) {
    const transcript = this.turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    return [
      `You are a real-time ${mode} assistant.`,
      `Coding language: ${language}.`,
      'Answer the latest interviewer question using the available context.',
      'Prefer a direct, technically correct answer. For coding questions, provide an efficient solution and brief complexity analysis.',
      this.latestScreenContext ? `SCREEN CONTEXT:\n${this.latestScreenContext}` : '',
      transcript ? `CONVERSATION:\n${transcript}` : ''
    ].filter(Boolean).join('\n\n');
  }

  _trim() {
    if (this.turns.length > this.maxTurns) this.turns.splice(0, this.turns.length - this.maxTurns);
  }
}

module.exports = ContextService;
