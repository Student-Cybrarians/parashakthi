# Parashakthi

A privacy-conscious desktop meeting assistant with real-time desktop-audio capture, local streaming ASR, conversation context, and Gemini-assisted responses.

## Current implementation

```text
Google Meet / browser audio
          |
          v
 Electron desktop capture
   Windows: system loopback
   macOS/Linux: selected audio input
          |
          v
     16 kHz mono PCM
          |
          v
 Persistent local ASR worker
   - Whisper
   - Parakeet TDT v3
          |
          v
  Utterance / pause boundary
          |
          v
 Conversation context -> Gemini
          |
          v
 Streaming answer UI
```

### Desktop audio

- **Windows:** Electron desktop capture uses the system loopback audio path, so audio played by Google Meet or another browser application can enter the transcription pipeline after the user explicitly starts capture.
- **macOS 14.2+:** Electron 40 includes the current CoreAudio Tap integration. The application declares `NSAudioCaptureUsageDescription`. For configurations where desktop loopback is not exposed, select a virtual audio input such as BlackHole.
- **Linux:** select a PipeWire/Pulse monitor source as the audio input. Native desktop loopback is intentionally not assumed because Linux audio routing varies by desktop/session.

Capture is explicit and visible; users are responsible for applicable recording and workplace policies.

## ASR providers

Set:

```env
ASR_PROVIDER=whisper
ASR_PYTHON=python
WHISPER_MODEL=small
```

Or use NVIDIA Parakeet TDT v3 locally:

```env
ASR_PROVIDER=parakeet
ASR_PYTHON=python
PARAKEET_MODEL=nvidia/parakeet-tdt-0.6b-v3
```

Install the Python runtime dependencies:

```bash
python -m pip install -r requirements-asr.txt
```

The first Parakeet run downloads a model of roughly 2.5 GB. The model is loaded once into a persistent worker, rather than reloaded for every utterance.

Parakeet TDT v3 is NVIDIA's 600M-parameter multilingual ASR model and is distributed under CC-BY-4.0. Its current model documentation provides a Transformers pipeline example using `nvidia/parakeet-tdt-0.6b-v3`.

## Gemini

Create `.env`:

```env
GEMINI_API_KEY=your_key
ASR_PROVIDER=parakeet
```

The application will stream generated responses after an utterance is transcribed.

## Run

```bash
npm install
npm start
```

For development:

```bash
npm run dev
```

## Build

```bash
npm run build
npm run build:win
npm run build:mac
npm run build:linux
```

## Architecture

- `src/services/system-audio.service.js` — audio transport and platform policy.
- `src/services/asr.service.js` — buffering, utterance boundaries, and worker lifecycle.
- `scripts/asr_worker.py` — persistent Whisper/Parakeet process.
- `src/services/context.service.js` — rolling conversation context.
- `src/services/gemini.service.js` — Gemini streaming generation.
- `renderer/renderer.js` — desktop/input capture and PCM resampling.
- `preload.js` — narrow context-isolated IPC bridge.

## Known limitations

- Windows has the cleanest fully automatic system-audio path.
- macOS/Linux may require a virtual/monitor audio input depending on OS version and audio stack.
- Parakeet's local runtime is ML-heavy; CPU-only systems may have higher latency. NVIDIA's current model documentation lists Linux and supported NVIDIA GPU architectures as the preferred runtime environment.
- End-to-end audio and installer validation must run on the target operating system; GitHub source edits alone cannot verify a physical audio device.

## Privacy

Audio is streamed into the local ASR worker when using Whisper/Parakeet. Only the resulting transcript/context is sent to Gemini when the Gemini feature is configured. API secrets are loaded from environment/runtime configuration and are not committed.
