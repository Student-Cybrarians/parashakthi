require('dotenv').config();
const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const SystemAudioService = require('./src/services/system-audio.service');
const ASRService = require('./src/services/asr.service');
const ContextService = require('./src/services/context.service');
const GeminiService = require('./src/services/gemini.service');

let mainWindow;
let audio;
let asr;
let context;
let gemini;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 440,
    minHeight: 600,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function configureDesktopCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      });
      if (!sources.length) throw new Error('No desktop capture source is available.');

      // Electron's loopback device is supported on Windows. On macOS/Linux,
      // the renderer falls back to a user-selected audio input (e.g. BlackHole
      // on macOS or a PipeWire/Pulse monitor source on Linux).
      if (process.platform === 'win32') {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({ video: sources[0] });
      }
    } catch (error) {
      mainWindow?.webContents.send('pipeline-error', { message: error.message });
      callback({});
    }
  });
}

function wirePipeline() {
  context = new ContextService();
  gemini = new GeminiService();

  asr = new ASRService({
    provider: process.env.ASR_PROVIDER || 'whisper',
    silenceMs: Number(process.env.ASR_SILENCE_MS || 800),
    transcribeChunk: (audioBuffer) => asr.transcribe(audioBuffer)
  });

  audio = new SystemAudioService({
    platform: process.platform,
    sampleRate: 16000,
    channels: 1
  });

  audio.on('audio', (chunk) => asr.pushAudio(chunk));
  audio.on('status', (status) => mainWindow?.webContents.send('audio-status', status));
  audio.on('error', (error) => mainWindow?.webContents.send('pipeline-error', { message: error.message }));

  asr.on('status', (status) => mainWindow?.webContents.send('asr-status', status));
  asr.on('error', (error) => mainWindow?.webContents.send('pipeline-error', { message: error.message }));

  asr.on('utterance', async ({ text }) => {
    context.addTranscript(text, 'interviewer');
    mainWindow?.webContents.send('transcript', { text });

    if (!gemini.isConfigured()) {
      mainWindow?.webContents.send('pipeline-error', { message: 'Gemini is not configured. Add GEMINI_API_KEY to .env.' });
      return;
    }

    try {
      let answer = '';
      mainWindow?.webContents.send('answer-start');
      for await (const token of gemini.stream(context.getPrompt())) {
        answer += token;
        mainWindow?.webContents.send('answer-token', token);
      }
      context.addAssistant(answer);
      mainWindow?.webContents.send('answer-complete', { text: answer });
    } catch (error) {
      mainWindow?.webContents.send('pipeline-error', { message: error.message });
    }
  });
}

app.whenReady().then(async () => {
  await configureDesktopCapture();
  createWindow();
  wirePipeline();

  ipcMain.handle('pipeline:start', async (_event, options = {}) => {
    asr.start();
    audio.start({ mode: options.mode || 'desktop' });
    return {
      configured: audio.isConfigured(),
      asr: asr.provider,
      mode: audio.mode,
      platform: process.platform
    };
  });

  ipcMain.handle('pipeline:stop', async () => {
    audio.stop();
    await asr.stop();
    return { stopped: true };
  });

  ipcMain.handle('pipeline:audio-chunk', (_event, arrayBuffer) => {
    if (!arrayBuffer) return { accepted: false };
    audio.pushRendererPcm(Buffer.from(arrayBuffer));
    return { accepted: true };
  });

  ipcMain.handle('pipeline:status', () => ({
    audioConfigured: audio.isConfigured(),
    audioRunning: audio.running,
    audioMode: audio.mode,
    asrProvider: asr.provider,
    geminiConfigured: gemini.isConfigured(),
    platform: process.platform
  }));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
