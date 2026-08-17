const path = require('path');
const os = require('os');

module.exports = {
  app: {
    name: 'Parashakthi',
    dataDir: path.join(os.homedir(), '.parashakthi')
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  },
  transcription: {
    provider: process.env.ASR_PROVIDER || 'whisper',
    language: process.env.ASR_LANGUAGE || 'auto',
    chunkMs: Number(process.env.ASR_CHUNK_MS || 2000),
    silenceMs: Number(process.env.ASR_SILENCE_MS || 700)
  },
  capture: {
    systemAudioEnabled: process.env.SYSTEM_AUDIO_ENABLED !== 'false',
    microphoneEnabled: process.env.MICROPHONE_ENABLED !== 'false',
    screenshotEnabled: process.env.SCREENSHOT_ENABLED !== 'false'
  }
};
