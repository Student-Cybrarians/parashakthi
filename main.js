require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
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
    width: 520,
    height: 720,
    minWidth: 420,
    minHeight: 560,
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

function wirePipeline() {
  context = new ContextService();
  gemini = new GeminiService();

  // The default ASR adapter is intentionally provider-neutral. A production
  // build can supply Parakeet or Whisper through a native/worker implementation.
  asr = new ASRService({
    provider: process.env.ASR_PROVIDER || 'whisper',
    silenceMs: Number(process.env.ASR_SILENCE_MS || 700),
    transcribeChunk: async () => ''
  });

  audio = new SystemAudioService();
  audio.on('audio', (chunk) => asr.pushAudio(chunk));
  audio.on('status', (status) => mainWindow?.webContents.send('audio-status', status));
  audio.on('error', (error) => mainWindow?.webContents.send('pipeline-error', { message: error.message }));

  asr.on('utterance', async ({ text }) => {
    context.addTranscript(text, 'interviewer');
    mainWindow?.webContents.send('transcript', { text });

    if (!gemini.isConfigured()) return;
    try {
      let answer = '';
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

app.whenReady().then(() => {
  createWindow();
  wirePipeline();

  ipcMain.handle('pipeline:start', () => {
    asr.start();
    audio.start();
    return { configured: audio.isConfigured(), asr: asr.provider };
  });

  ipcMain.handle('pipeline:stop', async () => {
    audio.stop();
    await asr.stop();
    return { stopped: true };
  });

  ipcMain.handle('pipeline:status', () => ({
    audioConfigured: audio.isConfigured(),
    audioRunning: audio.running,
    asrProvider: asr.provider,
    geminiConfigured: gemini.isConfigured()
  }));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
