#!/usr/bin/env python3
"""Persistent local ASR worker for Parashakthi.

Protocol: one JSON object per stdin line: {"id": "...", "wav": "..."}
Response: {"id": "...", "text": "..."} or {"id": "...", "error": "..."}

The model is loaded once per worker process, avoiding multi-second model reloads
for every interviewer utterance.
"""
import json
import os
import sys

PROVIDER = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("ASR_PROVIDER", "whisper")).lower()

if PROVIDER == "parakeet":
    from transformers import pipeline
    pipe = pipeline("automatic-speech-recognition", model=os.getenv("PARAKEET_MODEL", "nvidia/parakeet-tdt-0.6b-v3"))
elif PROVIDER == "whisper":
    import whisper
    pipe = whisper.load_model(os.getenv("WHISPER_MODEL", "small"))
else:
    raise SystemExit(f"Unsupported ASR provider: {PROVIDER}")

for line in sys.stdin:
    try:
        request = json.loads(line)
        request_id = request["id"]
        wav = request["wav"]
        if PROVIDER == "whisper":
            result = pipe.transcribe(wav, fp16=False)
            text = str(result.get("text", "")).strip()
        else:
            result = pipe(wav)
            text = str(result.get("text", "") if isinstance(result, dict) else result).strip()
        print(json.dumps({"id": request_id, "text": text}), flush=True)
    except Exception as exc:
        print(json.dumps({"id": request.get("id", "unknown"), "error": str(exc)}), flush=True)
