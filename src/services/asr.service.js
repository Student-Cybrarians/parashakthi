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
  buffer.writeUInt16LE(1, 20); // PCM
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

function commandForProvider(provider) {
  if (provider === 'parakeet') {
    const command = process.env.PARAKEET_COMMAND || 'python';
    const args = process.env.PARAKEET_ARGS
      ? process.env.PARAKEET_ARGS.split(' ').filter(Boolean)
      : [path.join(__dirname, '../../scripts/parakeet_worker.py')];
    return { command, args };
  }

  const command = process.env.WHISPER_COMMAND || 'python';
  const args = process.env.WHISPER_ARGS
    ? process.env.WHISPER_ARGS.split(' ').filter(Boolean)
    : ['-m', 'whisper'];
  return { command, args };
}

/**
 * Streaming ASR coordinator. Audio arrives as mono 16 kHz signed PCM. Each
 * natural pause is converted to a WAV and handed to the selected local ASR
 * backend. The provider boundary is deliberately process-based so heavy ML
 * runtimes do not become Electron renderer dependencies.
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
  }

  start() {
    this.running = true;
    this.buffer = [];
    this.startedAt = Date.now();
    this.emit('status', { state: 'listening', provider: this.provider });
  }

  async pushAudio(chunk) {
    if (!this.running || !chunk?.length) return;
    this.buffer.push(Buffer.from(chunk));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush('silence'), this.silenceMs);

    if (Date.now() - this.startedAt >= this.maxUtteranceMs) {
      await this.flush('max-duration');
    }
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
    if (audio.length < 3200) return ''; // <100 ms at 16 kHz mono 16-bit

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

  _transcribeFile(wavPath) {
    const { command, args } = commandForProvider(this.provider);
    const providerArgs = this.provider === 'whisper'
      ? [...args, wavPath, '--output_format', 'txt', '--output_dir', path.dirname(wavPath), '--fp16', 'False']
      : [...args, wavPath];

    return new Promise((resolve, reject) => {
      const child = spawn(command, providerArgs, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('error', (error) => reject(new Error(`ASR process failed: ${error.message}`)));
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${this.provider} exited with code ${code}: ${stderr.trim() || 'no diagnostic'}`));
          return;
        }

        if (this.provider === 'whisper') {
          const txtPath = path.join(path.dirname(wavPath), `${path.basename(wavPath, '.wav')}.txt`);
          resolve(fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8').trim() : stdout.trim());
        } else {
          // Parakeet worker emits plain text on stdout.
          resolve(stdout.trim());
        }
      });
    });
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
    this.emit('status', { state: 'stopped', provider: this.provider });
  }
}

module.exports = ASRService;
