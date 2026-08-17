const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function pcm16ToWav(pcm, sampleRate = 16000, channels = 1) {
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
}

/**
 * Streaming ASR coordinator with a persistent Python worker. Keeping Whisper
 * or Parakeet loaded in one process removes model-load latency from every
 * utterance and keeps the Electron main process responsive.
 */
class ASRService extends EventEmitter {
  constructor({ provider = 'whisper', silenceMs = 800, maxUtteranceMs = 12000 } = {}) {
    super();
    this.provider = provider;
    this.silenceMs = silenceMs;
    this.maxUtteranceMs = maxUtteranceMs;
    this.running = false;
    this.timer = null;
    this.buffer = [];
    this.startedAt = 0;
    this.flushInFlight = false;
    this.queuedFlush = false;
    this.worker = null;
    this.workerBuffer = '';
    this.requestId = 0;
    this.pending = new Map();
  }

  start() {
    this.running = true;
    this.buffer = [];
    this.startedAt = Date.now();
    this._ensureWorker();
    this.emit('status', { state: 'listening', provider: this.provider });
  }

  async pushAudio(chunk) {
    if (!this.running || !chunk?.length) return;
    this.buffer.push(Buffer.from(chunk));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush('silence'), this.silenceMs);
    if (Date.now() - this.startedAt >= this.maxUtteranceMs) await this.flush('max-duration');
  }

  _ensureWorker() {
    if (this.worker && !this.worker.killed) return;
    const python = process.env.ASR_PYTHON || process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const workerPath = path.join(__dirname, '../../scripts/asr_worker.py');
    this.worker = spawn(python, [workerPath, this.provider], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.workerBuffer = '';

    this.worker.stdout.on('data', (data) => {
      this.workerBuffer += data.toString();
      let newline;
      while ((newline = this.workerBuffer.indexOf('\n')) >= 0) {
        const line = this.workerBuffer.slice(0, newline).trim();
        this.workerBuffer = this.workerBuffer.slice(newline + 1);
        if (!line) continue;
        try {
          const response = JSON.parse(line);
          const pending = this.pending.get(response.id);
          if (!pending) continue;
          this.pending.delete(response.id);
          if (response.error) pending.reject(new Error(response.error));
          else pending.resolve(String(response.text || '').trim());
        } catch (error) {
          this.emit('error', new Error(`Invalid ASR worker response: ${error.message}`));
        }
      }
    });

    this.worker.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) this.emit('status', { state: 'worker-log', provider: this.provider, message });
    });

    this.worker.on('error', (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.emit('error', new Error(`Could not start ${this.provider} worker: ${error.message}`));
    });

    this.worker.on('close', (code) => {
      for (const pending of this.pending.values()) pending.reject(new Error(`${this.provider} worker exited with code ${code}`));
      this.pending.clear();
      this.worker = null;
    });
  }

  _transcribeFile(wavPath) {
    this._ensureWorker();
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${++this.requestId}`;
      this.pending.set(id, { resolve, reject });
      this.worker.stdin.write(`${JSON.stringify({ id, wav: wavPath })}\n`);
    });
  }

  async flush(reason = 'manual') {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer.length) return '';
    if (this.flushInFlight) {
      this.queuedFlush = true;
      return '';
    }

    const audio = Buffer.concat(this.buffer);
    this.buffer = [];
    this.startedAt = Date.now();
    if (audio.length < 3200) return '';

    this.flushInFlight = true;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parashakthi-asr-'));
    const wavPath = path.join(tempDir, 'utterance.wav');
    fs.writeFileSync(wavPath, pcm16ToWav(audio));

    try {
      this.emit('status', { state: 'transcribing', provider: this.provider });
      const text = await this._transcribeFile(wavPath);
      if (text) this.emit('utterance', { text, reason, provider: this.provider });
      return text;
    } catch (error) {
      this.emit('error', error);
      return '';
    } finally {
      this.flushInFlight = false;
      fs.rmSync(tempDir, { recursive: true, force: true });
      this.emit('status', { state: 'listening', provider: this.provider });
      if (this.queuedFlush) {
        this.queuedFlush = false;
        void this.flush('queued');
      }
    }
  }

  async transcribe(audioBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parashakthi-asr-'));
    const wavPath = path.join(tempDir, 'chunk.wav');
    fs.writeFileSync(wavPath, pcm16ToWav(audioBuffer));
    try {
      return await this._transcribeFile(wavPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async stop() {
    if (!this.running) return;
    await this.flush('stop');
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.worker && !this.worker.killed) this.worker.kill();
    this.worker = null;
    this.emit('status', { state: 'stopped', provider: this.provider });
  }
}

module.exports = ASRService;
