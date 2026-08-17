const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const os = require('os');

/**
 * System-audio capture boundary.
 *
 * OS support is intentionally adapter-based: Windows can use WASAPI loopback,
 * macOS can use a virtual loopback device, and Linux can use PipeWire/Pulse
 * monitor sources. The service emits PCM chunks and exposes a device contract;
 * it does not attempt to bypass OS security or meeting permissions.
 */
class SystemAudioService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.platform = options.platform || os.platform();
    this.process = null;
    this.running = false;
    this.bytes = 0;
    this.command = options.command || process.env.SYSTEM_AUDIO_COMMAND || '';
    this.args = options.args || [];
  }

  isConfigured() {
    return Boolean(this.command);
  }

  start() {
    if (this.running) return;
    if (!this.isConfigured()) {
      this.emit('status', { state: 'unavailable', platform: this.platform, reason: 'No system-audio adapter configured' });
      return;
    }

    this.process = spawn(this.command, this.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    this.running = true;
    this.process.stdout.on('data', (chunk) => {
      this.bytes += chunk.length;
      this.emit('audio', chunk);
    });
    this.process.stderr.on('data', (chunk) => {
      this.emit('log', String(chunk).trim());
    });
    this.process.on('error', (error) => {
      this.running = false;
      this.emit('error', error);
    });
    this.process.on('close', (code) => {
      this.running = false;
      this.emit('status', { state: 'stopped', code, bytes: this.bytes });
    });
    this.emit('status', { state: 'started', platform: this.platform });
  }

  stop() {
    if (!this.process) return;
    this.process.kill();
    this.process = null;
    this.running = false;
  }
}

module.exports = SystemAudioService;
