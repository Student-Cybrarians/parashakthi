require('dotenv').config();
const { app, BrowserWindow, ipcMain, desktopCapturer, session, globalShortcut } = require('electron');
const path = require('path');
const SystemAudioService = require('./src/services/system-audio.service');
const ASRService = require('./src/services/asr.service');
const ContextService = require('./src/services/context.service');
const QuestionService = require('./src/services/question.service');
const GeminiService = require('./src/services/gemini.service');
const TelemetryService = require('./src/services/telemetry.service');

let mainWindow, audio, asr, context, questionDetector, gemini, telemetry;
let running = false;
let generation = null;
let assistantMode = process.env.ASSISTANT_MODE || 'interview';
let lastQuestionAt = 0;

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
    } catch (error) { mainWindow?.webContents.send('pipeline-error', { message: error.message }); callback({}); }
  });
}

function cancelGeneration(reason = 'superseded') {
  if (!generation) return;
  generation.controller.abort();
  mainWindow?.webContents.send('answer-cancelled', { reason });
  generation = null;
}

function wirePipeline() {
  context = new ContextService(); questionDetector = new QuestionService(); gemini = new GeminiService(); telemetry = new TelemetryService();
  telemetry.on('metric', metric => mainWindow?.webContents.send('telemetry', metric));
  asr = new ASRService({
    provider: process.env.ASR_PROVIDER || 'whisper',
    silenceMs: Number(process.env.ASR_SILENCE_MS || 800),
    maxUtteranceMs: Number(process.env.ASR_MAX_UTTERANCE_MS || 12000),
    partialIntervalMs: Number(process.env.ASR_PARTIAL_INTERVAL_MS || 2200),
    partialMinMs: Number(process.env.ASR_PARTIAL_MIN_MS || 1400)
  });
  audio = new SystemAudioService({ platform: process.platform, sampleRate: 16000, channels: 1 });
  audio.on('audio', chunk => asr.pushAudio(chunk));
  audio.on('status', status => mainWindow?.webContents.send('audio-status', status));
  audio.on('error', error => mainWindow?.webContents.send('pipeline-error', { message: error.message }));
  asr.on('status', status => mainWindow?.webContents.send('asr-status', status));
  asr.on('error', error => mainWindow?.webContents.send('pipeline-error', { message: error.message }));
  asr.on('partial', ({ text, provider }) => mainWindow?.webContents.send('partial-transcript', { text, provider }));

  asr.on('utterance', async ({ text }) => {
    const classification = questionDetector.classify(text);
    const isQuestion = classification.isQuestion;
    context.addTranscript(text, 'interviewer');
    mainWindow?.webContents.send('transcript', { text, question: isQuestion, score: classification.score, followUp: classification.isFollowUp });
    if (!isQuestion) return;
    const now = Date.now();
    if (!classification.isFollowUp && now - lastQuestionAt < Number(process.env.QUESTION_COOLDOWN_MS || 2500)) return;
    lastQuestionAt = now;
    if (!gemini.isConfigured()) return mainWindow?.webContents.send('pipeline-error', { message: 'Gemini is not configured. Add GEMINI_API_KEY to .env.' });

    cancelGeneration(classification.isFollowUp ? 'follow-up-question' : 'new-question');
    const controller = new AbortController();
    const current = { controller, question: text, startedAt: Date.now() };
    generation = current;
    telemetry.record('question_to_generation_ms', Date.now() - current.startedAt);
    try {
      let answer = '';
      mainWindow?.webContents.send('answer-start', { question: text, followUp: classification.isFollowUp });
      for await (const token of gemini.stream(context.getPrompt({ mode: assistantMode, language: process.env.CODING_LANGUAGE || 'auto' }), {
        screenshotBase64: context.getScreenImage(), signal: controller.signal,
        onMetric: metric => telemetry.record(metric.name, metric.value)
      })) {
        if (generation !== current) return;
        answer += token; mainWindow?.webContents.send('answer-token', token);
      }
      if (generation !== current) return;
      context.addAssistant(answer); telemetry.record('answer_total_ms', Date.now() - current.startedAt);
      mainWindow?.webContents.send('answer-complete', { text: answer });
    } catch (error) {
      if (!controller.signal.aborted) mainWindow?.webContents.send('pipeline-error', { message: error.message });
    } finally { if (generation === current) generation = null; }
  });
}

async function startPipeline(options = {}) {
  if (running) return { alreadyRunning: true, mode: audio.mode, assistantMode };
  assistantMode = options.assistantMode || assistantMode;
  asr.start(); audio.start({ mode: options.mode || 'desktop' }); running = true;
  return { configured: audio.isConfigured(), asr: asr.provider, mode: audio.mode, assistantMode, platform: process.platform };
}

async function stopPipeline() {
  if (!running) return { stopped: true };
  cancelGeneration('pipeline-stopped'); audio.stop(); await asr.stop(); running = false;
  return { stopped: true };
}

app.whenReady().then(async () => {
  await configureDesktopCapture(); createWindow(); wirePipeline();
  ipcMain.handle('pipeline:start', (_event, options = {}) => startPipeline(options));
  ipcMain.handle('pipeline:stop', () => stopPipeline());
  ipcMain.handle('pipeline:cancel-answer', () => { cancelGeneration('manual'); return { cancelled: true }; });
  ipcMain.handle('pipeline:audio-chunk', (_event, arrayBuffer) => { if (!arrayBuffer || !running) return { accepted: false }; audio.pushRendererPcm(Buffer.from(arrayBuffer)); return { accepted: true }; });
  ipcMain.handle('pipeline:screen', (_event, base64Jpeg) => { if (!running || !base64Jpeg) return { accepted: false }; context.setScreenImage(base64Jpeg); return { accepted: true }; });
  ipcMain.handle('pipeline:capture-screen', () => { mainWindow?.webContents.send('capture-screen'); return { requested: true }; });
  ipcMain.handle('pipeline:metrics', () => telemetry.snapshot());
  ipcMain.handle('pipeline:status', () => ({ audioConfigured: audio.isConfigured(), audioRunning: audio.running, audioMode: audio.mode, asrProvider: asr.provider, geminiConfigured: gemini.isConfigured(), platform: process.platform, running, assistantMode, generationActive: Boolean(generation) }));
  globalShortcut.register('CommandOrControl+Shift+Space', async () => { if (running) await stopPipeline(); else await startPipeline({ mode: process.platform === 'win32' ? 'desktop' : 'input' }); mainWindow?.webContents.send('pipeline-hotkey-state', { running, assistantMode }); });
});
app.on('will-quit', () => { cancelGeneration('application-quit'); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
