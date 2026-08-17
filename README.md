# Parashakthi

A privacy-conscious desktop interview and meeting assistant inspired by OpenCluely, extended with a real-time conversation pipeline for system-audio ingestion, streaming transcription, screen context, and Gemini-assisted responses.

## Status

This repository is initialized as a clean implementation target. It intentionally does not copy or redistribute proprietary Parakeet AI code. The design recreates the underlying capabilities with replaceable, documented components.

## Architecture

```text
Meeting / browser audio
        |
        v
System audio adapter -----> microphone adapter
        |                         |
        +-----------+-------------+
                    v
             Audio session
                    |
                    v
          Streaming ASR adapter
          (Whisper / Parakeet)
                    |
                    v
            Conversation buffer
                    |
          +---------+----------+
          |                    |
          v                    v
   Screenshot context     Transcript context
          |                    |
          +---------+----------+
                    v
              Gemini engine
                    |
                    v
           Streaming answer UI
```

## Implementation goals

- Real-time system-audio capture on supported desktop platforms.
- Pluggable ASR backends, including local Whisper and a Parakeet-compatible adapter.
- Rolling transcript with utterance boundaries and speaker/source metadata.
- Screenshot/context capture without OCR as the primary path.
- Gemini streaming answer generation with conversation memory.
- Explicit audio/capture state and privacy controls.
- CI builds for Windows, macOS, and Linux.
- Secrets supplied through environment variables or runtime settings; never committed.

## Ethics and privacy

The project is intended for learning, practice, accessibility, and meeting assistance. Users are responsible for complying with the recording, interview, and workplace policies that apply to them. Capture indicators and explicit start/stop controls should remain enabled by default.

## Development

The initial scaffold separates capture, transcription, context, and reasoning so individual providers can be replaced without rewriting the application.
