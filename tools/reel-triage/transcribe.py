#!/usr/bin/env python3
"""Transcribe an audio file locally with faster-whisper.

Prints a single JSON object to stdout: {"language": "en", "text": "..."}.
Runs on CPU with int8 quantisation so it works on a plain GitHub Actions
runner with no GPU and no per-minute transcription bill.
"""
import json
import os
import sys

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audio-file>", file=sys.stderr)
        return 2

    audio_path = sys.argv[1]
    model_name = os.environ.get("WHISPER_MODEL", "small")

    # stderr keeps stdout clean for the JSON payload the Node caller parses.
    print(f"Loading whisper model '{model_name}'...", file=sys.stderr)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    segments, info = model.transcribe(audio_path, vad_filter=True)
    text = "".join(segment.text for segment in segments).strip()

    json.dump({"language": info.language, "text": text}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
