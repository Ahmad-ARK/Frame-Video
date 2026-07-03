"""Chatterbox TTS endpoint (MIT-licensed model by Resemble AI) with built-in
word-level timestamps via faster-whisper alignment.

Deploy:   modal deploy modal/chatterbox_tts.py
Request:  POST {endpoint} with Modal-Key/Modal-Secret headers (proxy auth)
          {"text": "...", "exaggeration": 0.4, "cfg": 0.5}
Response: {"sample_rate": 24000, "duration": 12.3,
           "words": [{"text": "Hello", "start": 0.1, "end": 0.4}, ...],
           "audio_b64": "<wav bytes>"}
"""

import modal

app = modal.App("chatterbox-tts")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "chatterbox-tts",
        "faster-whisper",
        "fastapi[standard]",
        "soundfile",
        "numpy",
    )
    .env({"HF_HUB_CACHE": "/cache/hf"})
)

cache = modal.Volume.from_name("tts-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu="L4",
    scaledown_window=180,
    timeout=600,
    volumes={"/cache": cache},
    secrets=[modal.Secret.from_name("tts-auth")],
)
class Chatterbox:
    @modal.enter()
    def load(self):
        from chatterbox.tts import ChatterboxTTS
        from faster_whisper import WhisperModel

        self.model = ChatterboxTTS.from_pretrained(device="cuda")
        self.whisper = WhisperModel(
            "small.en", device="cuda", compute_type="float16", download_root="/cache/whisper"
        )

    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, body: dict):
        import base64
        import io
        import os
        import re

        import numpy as np
        import soundfile as sf

        # shared-secret auth (Modal Secret "tts-auth"), workspace-independent
        if body.get("token") != os.environ.get("TTS_AUTH_TOKEN"):
            return {"error": "unauthorized"}

        text = (body.get("text") or "").strip()
        if not text:
            return {"error": "text required"}
        exaggeration = float(body.get("exaggeration", 0.4))
        cfg = float(body.get("cfg", 0.5))

        # generate in sentence chunks (~280 chars max keeps Chatterbox stable)
        sentences = re.findall(r"[^.!?]+[.!?]+|\S[^.!?]*$", text) or [text]
        chunks: list[str] = []
        cur = ""
        for s in sentences:
            s = s.strip()
            if cur and len(cur) + len(s) > 280:
                chunks.append(cur)
                cur = s
            else:
                cur = f"{cur} {s}".strip()
        if cur:
            chunks.append(cur)

        sr = self.model.sr
        gap = np.zeros(int(sr * 0.18), dtype=np.float32)
        parts: list[np.ndarray] = []
        for i, chunk in enumerate(chunks):
            wav = self.model.generate(chunk, exaggeration=exaggeration, cfg_weight=cfg)
            parts.append(wav.squeeze(0).cpu().numpy().astype(np.float32))
            if i < len(chunks) - 1:
                parts.append(gap)
        audio = np.concatenate(parts)

        # word timestamps: transcribe the generated audio with word timing
        segments, _ = self.whisper.transcribe(
            audio, language="en", word_timestamps=True, beam_size=1, vad_filter=False
        )
        words = []
        for seg in segments:
            for w in seg.words or []:
                token = w.word.strip()
                if token:
                    words.append({"text": token, "start": round(w.start, 3), "end": round(w.end, 3)})

        buf = io.BytesIO()
        sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
        return {
            "sample_rate": sr,
            "duration": round(len(audio) / sr, 3),
            "words": words,
            "audio_b64": base64.b64encode(buf.getvalue()).decode(),
        }
