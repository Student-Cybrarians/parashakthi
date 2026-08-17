class ContextService {
  constructor({ maxTurns = 80, maxScreenAgeMs = 15000 } = {}) {
    this.maxTurns = maxTurns;
    this.maxScreenAgeMs = maxScreenAgeMs;
    this.turns = [];
    this.latestScreenImage = null;
    this.latestScreenAt = 0;
    this.profileContext = '';
  }
  setProfileContext(text) { this.profileContext = String(text || '').trim(); }
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
  getScreenImage() { return this.latestScreenImage && Date.now() - this.latestScreenAt <= this.maxScreenAgeMs ? this.latestScreenImage : null; }
  getPrompt({ mode = 'interview', language = 'auto', responseStyle = 'concise' } = {}) {
    const transcript = this.turns.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    return [
      `You are a real-time ${mode} interview assistant.`,
      `Response style: ${responseStyle}.`,
      `Answer in the interviewer's language when it is clear; otherwise use ${language}.`,
      'Ground candidate-specific claims in the supplied candidate context. Never invent employers, projects, metrics, education, skills, or experience.',
      'Make answers sound natural and spoken, not like a textbook or chatbot.',
      'For coding/DSA: state the approach, provide correct runnable code in the requested language, explain complexity, and cover important edge cases.',
      'For system design: clarify assumptions, propose architecture, discuss scale, storage, APIs, reliability, security, and trade-offs.',
      'For behavioral questions: use the candidate context and structure a concise STAR-style answer without fabricating facts.',
      'For real-world scenarios: reason from constraints, alternatives, risks, and practical trade-offs.',
      'If the question is ambiguous, make a reasonable assumption and state it briefly.',
      this.profileContext ? `CANDIDATE/JOB CONTEXT:\n${this.profileContext}` : '',
      transcript ? `CONVERSATION:\n${transcript}` : ''
    ].filter(Boolean).join('\n\n');
  }
  _trim() { if (this.turns.length > this.maxTurns) this.turns.splice(0, this.turns.length - this.maxTurns); }
}
module.exports = ContextService;
