class QuestionService {
  constructor({ minWords = 4, dedupeMs = 15000 } = {}) {
    this.minWords = minWords;
    this.dedupeMs = dedupeMs;
    this.recent = new Map();
  }

  normalize(text) {
    return String(text || '').trim().replace(/\s+/g, ' ');
  }

  score(text) {
    const value = this.normalize(text);
    if (!value) return 0;
    const lower = value.toLowerCase();
    const normalized = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ').filter(Boolean);
    if (words.length < this.minWords) return 0;

    let score = 0;
    if (/[?؟]\s*$/.test(value)) score += 0.65;
    const starters = new Set(['what','why','how','when','where','who','which','can','could','would','should','do','does','did','is','are','was','were','will','have','has','had']);
    if (starters.has(words[0])) score += 0.45;
    const patterns = [
      /\bhow (would|do|does|did|can|could|should|will)\b/,
      /\bwhat (would|do|does|did|is|are|can|could)\b/,
      /\bwhy (would|do|does|did|is|are|can|could)\b/,
      /\b(explain|describe|walk me through|tell me about|talk me through)\b/,
      /\b(your approach|trade[- ]?offs?|time complexity|space complexity|edge cases?)\b/,
      /\b(implement|design|debug|optimize|compare)\b.*\b(for|using|with|this|that|it)\b/
    ];
    for (const pattern of patterns) if (pattern.test(lower)) score += 0.35;
    if (/\b(what about|and if|how about|follow[- ]?up|why not|what happens if)\b/.test(lower)) score += 0.3;
    return Math.min(score, 1);
  }

  isDuplicate(text) {
    const value = this.normalize(text).toLowerCase();
    const now = Date.now();
    for (const [key, timestamp] of this.recent) if (now - timestamp > this.dedupeMs) this.recent.delete(key);
    if (this.recent.has(value)) return true;
    this.recent.set(value, now);
    return false;
  }

  classify(text) {
    const value = this.normalize(text);
    const score = this.score(value);
    return {
      text: value,
      score,
      isQuestion: score >= Number(process.env.QUESTION_THRESHOLD || 0.65),
      isFollowUp: /\b(what about|and if|how about|follow[- ]?up|why not|what happens if)\b/i.test(value)
    };
  }

  isQuestion(text) {
    const result = this.classify(text);
    return result.isQuestion && !this.isDuplicate(result.text);
  }
}

module.exports = QuestionService;
