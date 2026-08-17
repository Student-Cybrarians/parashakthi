require('dotenv').config();
const { app, BrowserWindow, ipcMain, desktopCapturer, session, globalShortcut } = require('electron');
const path = require('path');
const SystemAudioService = require('./src/services/system-audio.service');
const ASRService = require('./src/services/asr.service');
const ContextService = require('./src/services/context.service');
const QuestionService = require('./src/services/question.service');
const GeminiService = require('./src/services/gemini.service');

let mainWindow, audio, asr, context, questionDetector, gemini;
let running = false;
let answerInFlight = false;
let assistantMode = process.env.ASSISTANT_MODE || 'interview';

function createWindow() {
  mainWindow = new BrowserWindow({ width: 560, height: 800, minWidth: 440, minHeight: 600, alwaysOnTop: true, transparent: true, frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function configureDesktopCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) throw new Error('No desktop capture source is available.');
      if (process.platform === 'win32') callback({ video: sources[0], audio: 'loopback' });
      else callback({ video: sources[0] });
    } catch (error) {
      mainWindow?.webContents.send('pipeline-error', { message: error.message });
      callback({});
    }
  });
}

function wirePipeline() {
  context = new ContextService();
  questionDetector = new QuestionService();
  gemini = new GeminiService();
  asr = new ASRService({ provider: process.env.ASR_PROVIDER || 'whisper', silenceMs: Number(process.env.ASR_SILENCE_MS || 800), maxUtteranceMs: Number(process.env.ASR_MAX_UTTERANCE_MS || 12000) });
  audio = new SystemAudioService({ platform: process.platform, sampleRate: 16000, channels: 1 });
  audio.on('audio', (chunk) => asr.pushAudio(chunk));
  audio.on('status', (status) => mainWindow?.webContents.send('audio-status', status));
  audio.on('error', (error) => mainWindow?.webContents.send('pipeline-error', { message: error.message }));
  asr.on('status', (status) => mainWindow?.webContents.send('asr-status', status));
  asr.on('error', (error) => mainWindow?.webContents.send('pipeline-error', { message: error.message }));

  asr.on('utterance', async ({ text }) => {
    const isQuestion = questionDetector.isQuestion(text);
    context.addTranscript(text, 'interviewer');
    mainWindow?.webContents.send('transcript', { text, question: isQuestion });
    if (!isQuestion || answerInFlight) return;
    if (!gemini.isConfigured()) return mainWindow?.webContents.send('pipeline-error', { message: 'Gemini is not configured. Add GEMINI_API_KEY to .env.' });

    answerInFlight = true;
    try {
      let answer = '';
      mainWindow?.webContents.send('answer-start');
      for await (const token of gemini.stream(context.getPrompt({ mode: assistantMode, language: process.env.CODING_LANGUAGE || 'auto' }), { screenshotBase64: context.getScreenImage() })) {
        answer += token;
        mainWindow?.webContents.send('answer-token', token);
      }
      context.addAssistant(answer);
      mainWindow?.webContents.send('answer-complete', { text: answer });
    } catch (error) {
      mainWindow?.webContents.send('pipeline-error', { message: error.message });
    } finally { answerInFlight = false; }
  });
}

async function startPipeline(options = {}) {
  if (running) return { alreadyRunning: true, mode: audio.mode, assistantMode };
  assistantMode = options.assistantMode || assistantMode;
  asr.start();
  audio.start({ mode: options.mode || 'desktop' });
  running = true;
  return { configured: audio.isConfigured(), asr: asr.provider, mode: audio.mode, assistantMode, platform: process.platform };
}

async function stopPipeline() {
  if (!running) return { stopped: true };
  audio.stop();
  await asr.stop();
  running = false;
  return { stopped: true };
}

app.whenReady().then(async () => {
  await configureDesktopCapture(); createWindow(); wirePipeline();
  ipcMain.handle('pipeline:start', (_event, options = {}) => startPipeline(options));
  ipcMain.handle('pipeline:stop', () => stopPipeline());
  ipcMain.handle('pipeline:audio-chunk', (_event, arrayBuffer) => { if (!arrayBuffer || !running) return { accepted: false }; audio.pushRendererPcm(Buffer.from(arrayBuffer)); return { accepted: true }; });
  ipcMain.handle('pipeline:screen', (_event, base64Jpeg) => { if (!running || !base64Jpeg) return { accepted: false }; context.setScreenImage(base64Jpeg); return { accepted: true }; });
  ipcMain.handle('pipeline:capture-screen', () => { mainWindow?.webContents.send('capture-screen'); return { requested: true }; });
  ipcMain.handle('pipeline:status', () => ({ audioConfigured: audio.isConfigured(), audioRunning: audio.running, audioMode: audio.mode, asrProvider: asr.provider, geminiConfigured: gemini.isConfigured(), platform: process.platform, running, assistantMode }));
  globalShortcut.register('CommandOrControl+Shift+Space', async () => { if (running) await stopPipeline(); else await startPipeline({ mode: process.platform === 'win32' ? 'desktop' : 'input' }); mainWindow?.webContents.send('pipeline-hotkey-state', { running, assistantMode }); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
