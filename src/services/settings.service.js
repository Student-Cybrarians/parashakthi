const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  assistantMode: 'interview',
  asrProvider: process.env.ASR_PROVIDER || 'whisper',
  responseStyle: 'concise',
  codingLanguage: process.env.CODING_LANGUAGE || 'auto',
  screenshotIntervalMs: 3000,
  partialIntervalMs: Number(process.env.ASR_PARTIAL_INTERVAL_MS || 2200),
  silenceMs: Number(process.env.ASR_SILENCE_MS || 800),
  questionCooldownMs: Number(process.env.QUESTION_COOLDOWN_MS || 2500)
});

class SettingsService {
  constructor(filePath) { this.filePath = filePath; this.settings = { ...DEFAULTS }; this.load(); }
  load() {
    try { if (fs.existsSync(this.filePath)) this.settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.filePath, 'utf8')) }; }
    catch (_) { this.settings = { ...DEFAULTS }; }
    return this.get();
  }
  get() { return { ...this.settings }; }
  update(patch = {}) {
    const allowed = Object.keys(DEFAULTS);
    for (const key of allowed) if (patch[key] !== undefined) this.settings[key] = patch[key];
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2));
    return this.get();
  }
  reset() { this.settings = { ...DEFAULTS }; return this.update(this.settings); }
}
module.exports = { SettingsService, DEFAULTS };
