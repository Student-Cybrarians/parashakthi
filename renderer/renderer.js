const state = document.getElementById('state');
const transcript = document.getElementById('transcript');
const answer = document.getElementById('answer');
const deviceSelect = document.getElementById('device');

let mediaStream = null;
let audioContext = null;
let processor = null;
let source = null;
let running = false;

function setState(text) {
  state.textContent = text;
}

async function refreshAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    deviceSelect.innerHTML = '<option value="">Default audio input</option>';
    for (const device of inputs) {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Audio input ${deviceSelect.length}`;
      deviceSelect.appendChild(option);
    }
  } catch (error) {
    setState(`audio devices: ${error.message}`);
  }
}

function floatToPcm16(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function downsampleTo16k(input, inputRate) {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  let offset = 0;
  for (let i = 0; i < outputLength; i += 1) {
    const nextOffset = Math.min(input.length, Math.round((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset; j += 1) {
      sum += input[j];
      count += 1;
    }
    output[i] = count ? sum / count : 0;
    offset = nextOffset;
  }
  return output;
}

async function startAudioTransport(mode) {
  if (mode === 'desktop') {
    // getDisplayMedia is handled by Electron's main-process permission handler.
    // Windows receives the OS loopback audio track; the video track is stopped
    // immediately because Parashakthi only needs the audio stream here.
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    mediaStream.getVideoTracks().forEach((track) => track.stop());
  } else {
    const constraints = {
      audio: deviceSelect.value
        ? { deviceId: { exact: deviceSelect.value }, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    if (!running) return;
    const mono = event.inputBuffer.getChannelData(0);
    const sixteenK = downsampleTo16k(mono, audioContext.sampleRate);
    const pcm = floatToPcm16(sixteenK);
    // Backpressure is intentionally handled by the main-process ASR queue.
    void window.parashakthi.sendAudio(pcm.buffer);
  };
  source.connect(processor);
  // ScriptProcessor needs an output connection to fire in Chromium. Connect
  // to a silent gain node rather than the speakers to avoid feedback.
  const silent = audioContext.createGain();
  silent.gain.value = 0;
  processor.connect(silent);
  silent.connect(audioContext.destination);
}

async function stopAudioTransport() {
  running = false;
  if (processor) processor.disconnect();
  if (source) source.disconnect();
  if (audioContext) await audioContext.close().catch(() => {});
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  processor = null;
  source = null;
  audioContext = null;
  mediaStream = null;
}

document.getElementById('start').addEventListener('click', async () => {
  if (running) return;
  try {
    const platformStatus = await window.parashakthi.status();
    const mode = platformStatus.platform === 'win32' ? 'desktop' : 'input';
    setState('starting…');
    await window.parashakthi.start({ mode });
    await startAudioTransport(mode);
    running = true;
    setState(mode === 'desktop' ? 'capturing system audio' : 'capturing selected input');
    await refreshAudioDevices();
  } catch (error) {
    await stopAudioTransport();
    try { await window.parashakthi.stop(); } catch (_) {}
    setState(error.message);
  }
});

document.getElementById('stop').addEventListener('click', async () => {
  await stopAudioTransport();
  await window.parashakthi.stop();
  setState('stopped');
});

window.parashakthi.onAudioStatus((s) => {
  if (s?.state) setState(s.state);
});
window.parashakthi.onAsrStatus((s) => {
  if (s?.state === 'transcribing') setState(`transcribing with ${s.provider}`);
  else if (s?.state === 'listening' && running) setState('listening');
});
window.parashakthi.onTranscript(({ text }) => {
  transcript.classList.remove('muted');
  transcript.textContent += `${transcript.textContent.trim() && !transcript.textContent.includes('Waiting for') ? '\n' : ''}${text}`;
  transcript.scrollTop = transcript.scrollHeight;
  answer.textContent = '';
  answer.classList.remove('muted');
});
window.parashakthi.onAnswerStart(() => {
  answer.classList.remove('muted');
  answer.textContent = '';
});
window.parashakthi.onAnswerToken((token) => {
  answer.classList.remove('muted');
  answer.textContent += token;
  answer.scrollTop = answer.scrollHeight;
});
window.parashakthi.onAnswerComplete(() => {
  if (running) setState('listening');
});
window.parashakthi.onError(({ message }) => {
  setState(message);
});

refreshAudioDevices();
