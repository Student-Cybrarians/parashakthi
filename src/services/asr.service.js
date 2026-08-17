const { EventEmitter } = require('events');

/**
 * Streaming ASR boundary. A concrete provider can implement transcribeChunk.
 * The service keeps timing/utterance state independent from the provider so
 * Whisper, Parakeet, or a remote ASR can be swapped without changing UI code.
 */
class ASRService extends EventEmitter {
  constructor({ provider = 'whisper', transcribeChunk = null, silenceMs = 700 } = {}) {
    super();
    this.provider = provider;
    this.transcribeChunk = transcribeChunk;
    this.silenceMs = silenceMs;
    this.running = false;
    this.timer = null;
    this.buffer = [];
    this.startedAt = 0;
  }

  start() {
    this.running = true;
    this.buffer = [];
    this.startedAt = Date.now();
    this.emit('status', { state: 'listening', provider: this.provider });
  }

  async pushAudio(chunk) {
    if (!this.running) return;
    this.buffer.push(Buffer.from(chunk));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush('silence'), this.silenceMs);

    // Keep low latency while protecting the model from tiny, noisy requests.
    if (Date.now() - this.startedAt >= 1800) {
      await this.flush('interval');
    }
  }

  async flush(reason = 'manual') {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer.length) return '';

    const audio = Buffer.concat(this.buffer);
    this.buffer = [];
    this.startedAt = Date.now();
    if (typeof this.transcribeChunk !== 'function') {
      this.emit('partial', { text: '', reason, provider: this.provider });
      return '';
    }

    try {
      const text = String(await this.transcribeChunk(audio) || '').trim();
      if (text) this.emit('utterance', { text, reason, provider: this.provider });
      return text;
    } catch (error) {
      this.emit('error', error);
      return '';
    }
  }

  async stop() {
    if (!this.running) return;
    await this.flush('stop');
    this.running = false;
    this.emit('status', { state: 'stopped', provider: this.provider });
  }
}

module.exports = ASRService;
