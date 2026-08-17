class QuestionService {
  constructor({ minWords = 4 } = {}) {
    this.minWords = minWords;
  }

  isQuestion(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length < this.minWords) return false;
    if (/[?؟]\s*$/.test(value)) return true;

    const normalized = value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const first = normalized.split(/\s+/)[0];
    const starters = new Set([
      'what', 'why', 'how', 'when', 'where', 'who', 'which', 'can',
      'could', 'would', 'should', 'do', 'does', 'did', 'is', 'are',
      'was', 'were', 'will', 'have', 'has', 'explain', 'describe',
      'compare', 'implement', 'design', 'tell'
    ]);
    return starters.has(first);
  }
}

module.exports = QuestionService;
