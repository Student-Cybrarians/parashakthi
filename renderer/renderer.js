const state = document.getElementById('state');
const transcript = document.getElementById('transcript');
const answer = document.getElementById('answer');
const deviceSelect = document.getElementById('device');
const modeSelect = document.getElementById('mode');
const captureScreenButton = document.getElementById('capture-screen');
let mediaStream = null, audioContext = null, processor = null, source = null, running = false, screenTimer = null;
let partialLine = '';
function setState(text) { state.textContent = text; }
async function refreshAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices(); const inputs = devices.filter((d) => d.kind === 'audioinput');
    deviceSelect.innerHTML = '<option value="">Default audio input</option>';
    for (const device of inputs) { const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Audio input ${deviceSelect.length}`; deviceSelect.appendChild(option); }
  } catch (error) { setState(`audio devices: ${error.message}`); }
}
function floatToPcm16(float32) { const pcm = new Int16Array(float32.length); for (let i = 0; i < float32.length; i += 1) { const sample = Math.max(-1, Math.min(1, float32[i])); pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff; } return pcm; }
function downsampleTo16k(input, inputRate) {
  if (inputRate === 16000) return input; const ratio = inputRate / 16000; const output = new Float32Array(Math.max(1, Math.floor(input.length / ratio))); let offset = 0;
  for (let i = 0; i < output.length; i += 1) { const next = Math.min(input.length, Math.round((i + 1) * ratio)); let sum = 0; for (let j = offset; j < next; j += 1) sum += input[j]; output[i] = next > offset ? sum / (next - offset) : 0; offset = next; }
  return output;
}
async function sendScreenSnapshot() {
  if (!running || !mediaStream) return; const videoTrack = mediaStream.getVideoTracks()[0]; if (!videoTrack) return;
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = new MediaStream([videoTrack]);
  try { await video.play(); await new Promise((resolve) => requestAnimationFrame(resolve)); const canvas = document.createElement('canvas'); const maxWidth = 1600; const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth)); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale)); canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); const dataUrl = canvas.toDataURL('image/jpeg', 0.62); await window.parashakthi.sendScreen(dataUrl.split(',')[1]); } catch (_) {}
}
function startScreenSnapshots() { clearInterval(screenTimer); void sendScreenSnapshot(); screenTimer = setInterval(() => void sendScreenSnapshot(), 3000); }
function stopScreenSnapshots() { clearInterval(screenTimer); screenTimer = null; }
async function startAudioTransport(mode) {
  if (mode === 'desktop') mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  else mediaStream = await navigator.mediaDevices.getUserMedia({ audio: deviceSelect.value ? { deviceId: { exact: deviceSelect.value }, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  audioContext = new AudioContext(); source = audioContext.createMediaStreamSource(mediaStream); processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => { if (!running) return; const mono = event.inputBuffer.getChannelData(0); const pcm = floatToPcm16(downsampleTo16k(mono, audioContext.sampleRate)); void window.parashakthi.sendAudio(pcm.buffer); };
  source.connect(processor); const silent = audioContext.createGain(); silent.gain.value = 0; processor.connect(silent); silent.connect(audioContext.destination);
}
async function stopAudioTransport() { running = false; stopScreenSnapshots(); if (processor) processor.disconnect(); if (source) source.disconnect(); if (audioContext) await audioContext.close().catch(() => {}); if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop()); processor = null; source = null; audioContext = null; mediaStream = null; partialLine = ''; }
async function startPipeline() {
  if (running) return;
  try { const platformStatus = await window.parashakthi.status(); const mode = platformStatus.platform === 'win32' ? 'desktop' : 'input'; setState('starting…'); await window.parashakthi.start({ mode, assistantMode: modeSelect.value }); await startAudioTransport(mode); running = true; startScreenSnapshots(); setState(mode === 'desktop' ? 'capturing system audio' : 'capturing selected input'); await refreshAudioDevices(); }
  catch (error) { await stopAudioTransport(); try { await window.parashakthi.stop(); } catch (_) {} setState(error.message); }
}
document.getElementById('start').addEventListener('click', startPipeline);
document.getElementById('stop').addEventListener('click', async () => { await stopAudioTransport(); await window.parashakthi.stop(); setState('stopped'); });
captureScreenButton.addEventListener('click', () => window.parashakthi.captureScreenNow());
modeSelect.addEventListener('change', () => setState(`mode: ${modeSelect.value}`));
window.parashakthi.onCaptureScreen(() => void sendScreenSnapshot());
window.parashakthi.onHotkeyState(({ running: active }) => { if (active && !running) void startPipeline(); else if (!active && running) void stopAudioTransport().then(() => setState('stopped')); });
window.parashakthi.onAudioStatus((s) => { if (s?.state) setState(s.state); });
window.parashakthi.onAsrStatus((s) => { if (s?.state === 'transcribing') setState(`transcribing with ${s.provider}`); else if (s?.state === 'listening' && running) setState('listening'); });
window.parashakthi.onPartialTranscript(({ text }) => {
  if (!running || !text) return;
  partialLine = text;
  const base = transcript.textContent.replace(/\n?◌ .*$/s, '').replace(/\n?… .*$/s, '');
  transcript.textContent = `${base}${base.trim() ? '\n' : ''}… ${partialLine}`;
  transcript.scrollTop = transcript.scrollHeight;
});
window.parashakthi.onTranscript(({ text, question }) => {
  transcript.classList.remove('muted'); partialLine = '';
  const base = transcript.textContent.replace(/\n?… .*$/s, '').replace(/\n?◌ .*$/s, '');
  const empty = !base.trim() || base.includes('Waiting for interviewer');
  transcript.textContent = `${empty ? '' : base + '\n'}${question ? '❓ ' : ''}${text}`;
  transcript.scrollTop = transcript.scrollHeight;
});
window.parashakthi.onAnswerStart(() => { answer.classList.remove('muted'); answer.textContent = ''; });
window.parashakthi.onAnswerToken((token) => { answer.classList.remove('muted'); answer.textContent += token; answer.scrollTop = answer.scrollHeight; });
window.parashakthi.onAnswerComplete(() => { if (running) setState('listening'); });
window.parashakthi.onError(({ message }) => setState(message));
refreshAudioDevices();
