# Parashakthi

A privacy-conscious Electron desktop meeting/interview assistant with explicit system-audio capture, local ASR, automatic question detection, screen context, conversation memory, cancellable Gemini responses, persistent settings, local session export, and cross-platform packaging.

## Feature status

- ✅ Windows desktop/system-audio capture path
- ✅ macOS/Linux selectable audio input path
- ✅ 16 kHz mono PCM transport
- ✅ Persistent Whisper / Parakeet TDT v3 worker
- ✅ Low-latency overlapping partial transcription
- ✅ Pause/max-duration utterance segmentation
- ✅ Automatic interviewer-question detection and follow-up detection
- ✅ Duplicate suppression and cooldown
- ✅ Automatic Gemini response triggering
- ✅ Cancellable/stale-safe Gemini generations
- ✅ Rolling conversation memory
- ✅ Automatic screen snapshots and manual capture
- ✅ Multimodal Gemini prompts with latest screen image
- ✅ Interview / coding / system-design / behavioral modes
- ✅ Persistent user settings
- ✅ Local session event log and JSON export
- ✅ Audio-device selector
- ✅ Global `Ctrl/Cmd+Shift+Space` capture toggle
- ✅ Secure context-isolated Electron IPC
- ✅ Latency telemetry
- ✅ Cross-platform Electron packaging
- ✅ Automated unit tests and CI builds
- ✅ Tag-triggered release workflow with SHA-256 checksums
- 🟡 Hardware-specific audio/GPU validation must run on target machines
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
          +----------------------+
          | low-latency partials |
          +----------+-----------+
                     v
             Pause/max boundary
                     |
                     v
             Question detector
                     |
          +----------+----------+
          |                     |
          v                     v
 Rolling transcript      Latest screen image
          |                     |
          +----------+----------+
                     v
              Gemini multimodal
                     |
              cancellable stream
                     |
                     v
              Streaming answer UI
```

## Desktop audio

- **Windows:** Electron desktop capture requests the system loopback audio path after the user explicitly starts capture.
- **macOS:** use the supported desktop-audio path where available; otherwise select a virtual device such as BlackHole. The package declares audio/screen usage descriptions.
- **Linux:** select a PipeWire/Pulse monitor source. Native routing differs between desktop/session configurations.

Capture is explicit. Users are responsible for applicable recording, interview, workplace, and meeting policies.

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

Latency tuning:

```env
ASR_PARTIAL_INTERVAL_MS=2200
ASR_PARTIAL_MIN_MS=1400
ASR_SILENCE_MS=800
ASR_MAX_UTTERANCE_MS=12000
QUESTION_COOLDOWN_MS=2500
```

Install runtime dependencies:

```bash
python -m pip install -r requirements-asr.txt
```

The first Parakeet run downloads and loads the model into a persistent worker. Subsequent utterances avoid model initialization overhead.

## Gemini

Create `.env`:

```env
GEMINI_API_KEY=your_key
ASR_PROVIDER=parakeet
GEMINI_MODEL=gemini-2.5-flash
```

Raw audio is processed by the configured local ASR worker. Transcript/context and the latest screen image are sent to Gemini when enabled.

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

## Settings and sessions

The application stores non-secret settings under Electron's per-user application data directory. The UI supports assistant mode, response style, ASR provider, and session export. Session exports are written locally to `Documents/Parashakthi Sessions`.

API secrets remain environment/runtime configuration and are never persisted by the settings service.

## Test and build

```bash
npm test
npm run build
npm run build:win
npm run build:mac
npm run build:linux
```

Pushing to `master-branch` runs tests and Windows/macOS/Linux builds. Pushing a `v*` tag triggers the release workflow and publishes generated artifacts plus SHA-256 checksums.

## Architecture

- `src/services/system-audio.service.js` — audio transport and platform policy.
- `src/services/asr.service.js` — buffering, partial recognition, segmentation, worker lifecycle, and recovery.
- `scripts/asr_worker.py` — persistent Whisper/Parakeet process.
- `src/services/question.service.js` — question/follow-up classification and duplicate suppression.
- `src/services/context.service.js` — rolling transcript and screen context.
- `src/services/gemini.service.js` — Gemini multimodal streaming generation.
- `src/services/settings.service.js` — validated persistent non-secret settings.
- `src/services/session.service.js` — local session event logging/export.
- `src/services/telemetry.service.js` — local latency metrics.
- `renderer/renderer.js` — desktop/input capture, PCM conversion, screen snapshots, and UI.
- `preload.js` — narrow context-isolated IPC bridge.

## Known hardware-dependent limitations

The application code is cross-platform, but a source repository cannot certify physical hardware behavior. The following must be validated on actual target machines before calling a release production-certified:

- Google Meet/browser system-audio capture on the target Windows setup.
- macOS CoreAudio permissions and virtual-device configurations.
- Linux PipeWire/Pulse monitor configurations.
- Parakeet CUDA/MPS/CPU latency and memory behavior.
- Device hot-plug/hot-switch behavior on the target audio stack.
- Windows/macOS/Linux packaged installers on clean machines.
- macOS signing and notarization, which require the owner's Apple Developer credentials.

Partial transcription intentionally uses overlapping short-window recognition. It is not advertised as native token-level decoder streaming.

## Privacy

Audio is processed by the configured local ASR worker. Only transcript/context and the latest screen image are sent to Gemini when enabled. API secrets are never committed or written to the settings/session files. Telemetry is local-only.
