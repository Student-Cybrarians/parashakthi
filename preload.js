const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parashakthi', {
  start: (options) => ipcRenderer.invoke('pipeline:start', options),
  stop: () => ipcRenderer.invoke('pipeline:stop'),
  cancelAnswer: () => ipcRenderer.invoke('pipeline:cancel-answer'),
  status: () => ipcRenderer.invoke('pipeline:status'),
  metrics: () => ipcRenderer.invoke('pipeline:metrics'),
  sendAudio: (arrayBuffer) => ipcRenderer.invoke('pipeline:audio-chunk', arrayBuffer),
  sendScreen: (base64Jpeg) => ipcRenderer.invoke('pipeline:screen', base64Jpeg),
  captureScreenNow: () => ipcRenderer.invoke('pipeline:capture-screen'),
  onCaptureScreen: (handler) => ipcRenderer.on('capture-screen', () => handler()),
  onHotkeyState: (handler) => ipcRenderer.on('pipeline-hotkey-state', (_event, data) => handler(data)),
  onPartialTranscript: (handler) => ipcRenderer.on('partial-transcript', (_event, data) => handler(data)),
  onTranscript: (handler) => ipcRenderer.on('transcript', (_event, data) => handler(data)),
  onAnswerStart: (handler) => ipcRenderer.on('answer-start', (_event, data) => handler(data)),
  onAnswerToken: (handler) => ipcRenderer.on('answer-token', (_event, token) => handler(token)),
  onAnswerComplete: (handler) => ipcRenderer.on('answer-complete', (_event, data) => handler(data)),
  onAnswerCancelled: (handler) => ipcRenderer.on('answer-cancelled', (_event, data) => handler(data)),
  onTelemetry: (handler) => ipcRenderer.on('telemetry', (_event, data) => handler(data)),
  onAudioStatus: (handler) => ipcRenderer.on('audio-status', (_event, data) => handler(data)),
  onAsrStatus: (handler) => ipcRenderer.on('asr-status', (_event, data) => handler(data)),
  onError: (handler) => ipcRenderer.on('pipeline-error', (_event, data) => handler(data))
});
