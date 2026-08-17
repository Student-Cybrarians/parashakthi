class QuestionService {
  constructor({ minWords = 4 } = {}) { this.minWords = minWords; this.lastQuestion = ''; }

  isQuestion(text) {
    const value = String(text || '').trim().replace(/\s+/g, ' ');
    if (!value) return false;
    if (value === this.lastQuestion) return false;
    const words = value.split(' ').filter(Boolean);
    if (words.length < this.minWords) return false;

    const lower = value.toLowerCase();
    const normalized = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const first = normalized.split(' ')[0];
    const starters = new Set([
      'what','why','how','when','where','who','which','can','could','would','should',
      'do','does','did','is','are','was','were','will','have','has','had','explain',
      'describe','compare','implement','design','tell','walk','show','give'
    ]);
    const patterns = [
      /\bhow (would|do|does|did|can|could|should|will)\b/,
      /\bwhat (would|do|does|did|is|are|can|could)\b/,
      /\bwhy (would|do|does|did|is|are|can|could)\b/,
      /\b(explain|describe|walk me through|tell me about)\b/,
      /\b(what's|whats|what is|how is)\b/,
      /\b(your approach|trade[- ]?offs?|time complexity|space complexity)\b/,
      /\b(what would you|how would you|how do you)\b/
    ];
    const question = /[?؟]\s*$/.test(value) || starters.has(first) || patterns.some((p) => p.test(lower));
    if (question) this.lastQuestion = value;
    return question;
  }
}
module.exports = QuestionService;
