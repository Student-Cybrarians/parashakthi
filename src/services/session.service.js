const fs = require('fs');
const path = require('path');

class SessionService {
  constructor(directory) { this.directory = directory; this.reset(); }
  reset() { this.startedAt = null; this.events = []; }
  start(meta = {}) { this.reset(); this.startedAt = new Date().toISOString(); this.meta = { ...meta }; return this.snapshot(); }
  add(type, data) { this.events.push({ at: new Date().toISOString(), type, ...data }); }
  snapshot() { return { startedAt: this.startedAt, meta: { ...(this.meta || {}) }, events: [...this.events] }; }
  exportJson() {
    fs.mkdirSync(this.directory, { recursive: true });
    const filename = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const target = path.join(this.directory, filename);
    fs.writeFileSync(target, JSON.stringify(this.snapshot(), null, 2));
    return target;
  }
}
module.exports = SessionService;
