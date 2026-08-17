const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parashakthi', {
  start: () => ipcRenderer.invoke('pipeline:start'),
  stop: () => ipcRenderer.invoke('pipeline:stop'),
  status: () => ipcRenderer.invoke('pipeline:status'),
  onTranscript: (handler) => ipcRenderer.on('transcript', (_event, data) => handler(data)),
  onAnswerToken: (handler) => ipcRenderer.on('answer-token', (_event, token) => handler(token)),
  onAnswerComplete: (handler) => ipcRenderer.on('answer-complete', (_event, data) => handler(data)),
  onAudioStatus: (handler) => ipcRenderer.on('audio-status', (_event, data) => handler(data)),
  onError: (handler) => ipcRenderer.on('pipeline-error', (_event, data) => handler(data))
});
