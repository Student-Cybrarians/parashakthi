# Parashakthi

**Privacy-conscious desktop meeting and interview assistant with local speech recognition and multimodal AI.**

Parashakthi captures system audio explicitly, performs local ASR, detects questions, maintains rolling context, and can send transcript/context plus the latest screen image to Gemini when enabled.

## Highlights

- Explicit Windows system-audio capture and selectable macOS/Linux audio input
- Local Whisper / Parakeet TDT v3 ASR
- Low-latency partial transcription with utterance segmentation
- Automatic interviewer-question and follow-up detection
- Duplicate suppression and cancellable Gemini responses
- Rolling conversation memory and screen context
- Interview, coding, system-design, and behavioral modes
- Secure context-isolated Electron IPC
- Local session export and local-only latency telemetry
- Automated tests, CI builds, packaging, and release checksums

## End-to-end flow

```text
Meeting / browser audio
        |
        v
Electron desktop capture
        |
        v
16 kHz mono PCM
        |
        v
Persistent local ASR worker
        |
        v
Question detection
        |
        +-------------------+
        |                   |
        v                   v
Rolling transcript    Latest screen image
        |                   |
        +---------+---------+
                  v
          Gemini multimodal
                  |
                  v
          Streaming answer UI
```

## Privacy model

Audio is processed by the configured local ASR worker. Only transcript/context and the latest screen image are sent to Gemini when enabled. API secrets are kept in runtime/environment configuration and are not persisted by the settings service.

Users are responsible for applicable recording, interview, workplace, and meeting policies.

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

## Test and build

```bash
npm test
npm run build
```

See the full repository documentation for platform-specific audio, packaging, ASR, Gemini, and release details.

## Focus

**Electron • Speech/ASR • Privacy • Multimodal AI • Desktop Systems**
