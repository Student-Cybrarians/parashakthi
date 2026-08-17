const { EventEmitter } = require('events');
const os = require('os');

/**
 * Browser-backed desktop audio transport.
 *
 * Windows uses Electron's desktop-capture loopback device. macOS/Linux use an
 * explicit audio input device (for example BlackHole on macOS or a PipeWire /
 * Pulse monitor source on Linux). In both cases the renderer converts audio
 * to mono 16 kHz PCM and sends it here over a narrow IPC channel.
 */
class SystemAudioService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.platform = options.platform || os.platform();
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.running = false;
    this.mode = 'desktop';
    this.bytes = 0;
  }

  isConfigured() {
    // Desktop loopback is available through Electron on Windows. Other
    // platforms require the user to select a monitor/virtual input device.
    return this.platform === 'win32' || Boolean(process.env.SYSTEM_AUDIO_INPUT_DEVICE);
  }

  start({ mode = 'desktop' } = {}) {
    if (this.running) return;
    this.mode = mode;
    if (mode === 'desktop' && this.platform !== 'win32') {
      this.emit('status', {
        state: 'needs-input-device',
        platform: this.platform,
        reason: 'Select a system-audio input device (for example BlackHole or a PipeWire/Pulse monitor).'
      });
    }
    this.running = true;
    this.bytes = 0;
    this.emit('status', {
      state: 'started',
      platform: this.platform,
      mode: this.mode,
      sampleRate: this.sampleRate
    });
  }

  pushRendererPcm(chunk) {
    if (!this.running || !chunk?.length) return;
    const pcm = Buffer.from(chunk);
    this.bytes += pcm.length;
    this.emit('audio', pcm);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.emit('status', { state: 'stopped', platform: this.platform, bytes: this.bytes });
  }
}

module.exports = SystemAudioService;
