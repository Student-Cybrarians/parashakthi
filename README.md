# Parashakthi

A privacy-conscious desktop meeting assistant with system-audio capture, local ASR, automatic question detection, screen context, conversation memory, and Gemini-assisted responses.

## Feature status

- ✅ Windows desktop/system-audio capture path
- ✅ macOS/Linux selectable audio input path
- ✅ 16 kHz mono PCM transport
- ✅ Persistent Whisper / Parakeet TDT v3 worker
- ✅ Pause/max-duration utterance segmentation
- ✅ Automatic interviewer-question detection
- ✅ Rolling conversation memory
- ✅ Automatic screen snapshots while capture is active
- ✅ Multimodal Gemini prompts with the latest screen image
- ✅ Interview / coding / system-design / behavioral modes
- ✅ Global `Ctrl/Cmd+Shift+Space` capture toggle
- ✅ Audio-device selector
- ✅ Cross-platform Electron packaging
- ✅ Automated unit tests and CI builds
- ✅ Tag-triggered release workflow
- 🟡 True token-level/partial ASR depends on the selected ASR runtime
- 🟡 Hardware-specific audio validation must run on the target OS
- 🟡 macOS signing/notarization requires developer credentials

## End-to-end flow

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
 Question detector
          |
          +-------------------+
          |                   |
          v                   v
 Rolling transcript     Latest screen image
          |                   |
          +---------+---------+
                    v
               Gemini multimodal
                    |
                    v
             Streaming answer UI
```

## Desktop audio

- **Windows:** Electron desktop capture requests the system loopback audio path, allowing browser/meeting playback to enter the transcription pipeline after the user explicitly starts capture.
- **macOS:** use Electron's supported desktop-audio path where available; otherwise select a virtual audio device such as BlackHole. The package declares the required audio/screen usage descriptions.
- **Linux:** select a PipeWire/Pulse monitor source. Native routing differs between desktop/session configurations, so the application does not assume one universal device.

Capture is explicit and visible. Users are responsible for applicable recording, interview, workplace, and meeting policies.

## ASR providers

Whisper:

```env
ASR_PROVIDER=whisper
ASR_PYTHON=python
WHISPER_MODEL=small
```

Parakeet TDT v3:

```env
ASR_PROVIDER=parakeet
ASR_PYTHON=python
PARAKEET_MODEL=nvidia/parakeet-tdt-0.6b-v3
```

Install the runtime dependencies:

```bash
python -m pip install -r requirements-asr.txt
```

The first Parakeet run downloads the model and loads it into a persistent worker. Subsequent utterances avoid model initialization overhead.

## Gemini

Create `.env`:

```env
GEMINI_API_KEY=your_key
ASR_PROVIDER=parakeet
GEMINI_MODEL=gemini-2.5-flash
```

Only the resulting transcript/context and the latest screen snapshot are sent to Gemini when the feature is configured. Raw audio remains with the local ASR worker.

## Run

```bash
npm install
python -m pip install -r requirements-asr.txt
npm start
```

Development:

```bash
npm run dev
```

Global capture toggle: **Ctrl+Shift+Space** on Windows/Linux or **Cmd+Shift+Space** on macOS.

## Test and build

```bash
npm test
npm run build
npm run build:win
npm run build:mac
npm run build:linux
```

Pushing to `master-branch` runs tests and Windows/macOS/Linux builds. Pushing a `v*` tag triggers the release workflow.

## Architecture

- `src/services/system-audio.service.js` — audio transport and platform policy.
- `src/services/asr.service.js` — buffering, segmentation, worker lifecycle, and recovery.
- `src/services/question.service.js` — question boundary heuristic.
- `scripts/asr_worker.py` — persistent Whisper/Parakeet process.
- `src/services/context.service.js` — rolling transcript and screen context.
- `src/services/gemini.service.js` — Gemini multimodal streaming generation.
- `renderer/renderer.js` — desktop/input capture, PCM conversion, screen snapshots, and UI.
- `preload.js` — narrow context-isolated IPC bridge.

## Known limitations

- True token-level partial transcription is provider/runtime dependent; the current stable path emits utterances after pause/max-duration segmentation.
- macOS/Linux may require a virtual/monitor audio input depending on OS version and audio stack.
- Parakeet is ML-heavy and may have high CPU latency without suitable acceleration.
- End-to-end audio, permissions, GPU behavior, and installers must still be exercised on real target machines.
- macOS release signing/notarization requires the repository owner's Apple Developer credentials.

## Privacy

Audio is processed by the configured local ASR worker. Only transcript/context and the latest screen image are sent to Gemini when enabled. API secrets are loaded from environment/runtime configuration and are never committed.
