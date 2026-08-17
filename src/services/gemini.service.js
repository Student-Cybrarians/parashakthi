const { GoogleGenAI } = require('@google/genai');

class GeminiService {
  constructor({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash' } = {}) {
    this.model = model;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async *stream(prompt, { screenshotBase64 = null } = {}) {
    if (!this.client) throw new Error('GEMINI_API_KEY is not configured');
    const parts = [{ text: prompt }];
    if (screenshotBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } });
    }
    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents: [{ role: 'user', parts }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1200
      }
    });
    for await (const chunk of response) {
      const text = chunk?.text || '';
      if (text) yield text;
    }
  }
}

module.exports = GeminiService;
