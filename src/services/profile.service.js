const fs = require('fs');
const path = require('path');

class ProfileService {
  constructor(file) {
    this.file = file;
    this.data = { candidateContext: '', jobContext: '', company: '', preferredLanguage: 'auto' };
    this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.file)) this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (_) {}
  }
  get() { return { ...this.data }; }
  update(patch = {}) {
    for (const key of Object.keys(this.data)) if (typeof patch[key] === 'string') this.data[key] = patch[key];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    return this.get();
  }
  reset() { return this.update({ candidateContext: '', jobContext: '', company: '', preferredLanguage: 'auto' }); }
  promptContext() {
    const p = [];
    if (this.data.candidateContext.trim()) p.push(`CANDIDATE CONTEXT:\n${this.data.candidateContext.trim()}`);
    if (this.data.jobContext.trim()) p.push(`TARGET JOB DESCRIPTION:\n${this.data.jobContext.trim()}`);
    if (this.data.company.trim()) p.push(`TARGET COMPANY: ${this.data.company.trim()}`);
    if (this.data.preferredLanguage !== 'auto') p.push(`PREFERRED RESPONSE LANGUAGE: ${this.data.preferredLanguage}`);
    return p.join('\n\n');
  }
}
module.exports = ProfileService;
