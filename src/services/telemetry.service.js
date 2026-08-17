const { EventEmitter } = require('events');

class TelemetryService extends EventEmitter {
  constructor({ maxSamples = 100 } = {}) {
    super(); this.maxSamples = maxSamples; this.samples = new Map();
  }
  record(name, value, metadata = {}) {
    const sample = { name, value: Number(value), at: Date.now(), ...metadata };
    const list = this.samples.get(name) || [];
    list.push(sample); if (list.length > this.maxSamples) list.splice(0, list.length - this.maxSamples);
    this.samples.set(name, list); this.emit('metric', sample); return sample;
  }
  snapshot() {
    const result = {};
    for (const [name, list] of this.samples) {
      const values = list.map(x => x.value).filter(Number.isFinite);
      result[name] = { count: values.length, latest: values.at(-1) ?? null, average: values.length ? values.reduce((a,b) => a+b, 0) / values.length : null, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
    }
    return result;
  }
  clear() { this.samples.clear(); }
}
module.exports = TelemetryService;
