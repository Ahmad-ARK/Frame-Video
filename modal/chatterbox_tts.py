"""ChatterBox TTS with Voice Cloning — Modal API-only deployment.

Features:
  - Zero-shot voice cloning via reference audio
  - Persistent named voice library (saved to Modal Volume)
  - High-quality 24 kHz WAV output
  - Word-level timestamps via faster-whisper alignment
  - CORS-enabled for local UI consumption

Deploy:   modal deploy chatterbox_tts.py
"""

import modal
import json

app = modal.App("chatterbox-tts")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "chatterbox-tts",
        "faster-whisper",
        "fastapi[standard]",
        "python-multipart",
        "soundfile",
        "numpy",
    )
    .env({"HF_HUB_CACHE": "/cache/hf"})
)

cache = modal.Volume.from_name("tts-cache", create_if_missing=True)

VOICES_DIR = "/cache/voices"
VOICES_INDEX = "/cache/voices/_index.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_voice_index() -> dict:
    import os
    if not os.path.exists(VOICES_INDEX):
        return {}
    with open(VOICES_INDEX, "r") as f:
        return json.loads(f.read())


def _save_voice_index(index: dict):
    import os
    os.makedirs(VOICES_DIR, exist_ok=True)
    with open(VOICES_INDEX, "w") as f:
        f.write(json.dumps(index, indent=2))


# ---------------------------------------------------------------------------
# Main TTS class
# ---------------------------------------------------------------------------

@app.cls(
    image=image,
    gpu="L4",
    scaledown_window=180,
    timeout=900,
    volumes={"/cache": cache},
)
class Chatterbox:
    @modal.enter()
    def load(self):
        import os
        from chatterbox.tts import ChatterboxTTS
        from faster_whisper import WhisperModel

        self.model = ChatterboxTTS.from_pretrained(device="cuda")
        self.whisper = WhisperModel(
            "small.en",
            device="cuda",
            compute_type="float16",
            download_root="/cache/whisper",
        )
        os.makedirs(VOICES_DIR, exist_ok=True)

    def _synthesize(
        self,
        text: str,
        audio_prompt_path: str | None = None,
        exaggeration: float = 0.4,
        cfg: float = 0.5,
    ) -> tuple:
        import re
        import numpy as np

        if not text or not text.strip():
            raise ValueError("text is required")

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
            kwargs = dict(exaggeration=exaggeration, cfg_weight=cfg)
            if audio_prompt_path:
                kwargs["audio_prompt_path"] = audio_prompt_path
            wav = self.model.generate(chunk, **kwargs)
            parts.append(wav.squeeze(0).cpu().numpy().astype(np.float32))
            if i < len(chunks) - 1:
                parts.append(gap)

        audio = np.concatenate(parts)

        target_sr = 16000
        n16 = int(len(audio) * target_sr / sr)
        audio16 = np.interp(
            np.linspace(0, len(audio) - 1, n16),
            np.arange(len(audio)),
            audio,
        ).astype(np.float32)
        segments, _ = self.whisper.transcribe(
            audio16, language="en", word_timestamps=True, beam_size=1, vad_filter=False,
        )
        words = []
        for seg in segments:
            for w in seg.words or []:
                token = w.word.strip()
                if token:
                    words.append({"text": token, "start": round(w.start, 3), "end": round(w.end, 3)})

        return audio, sr, words

    # ---- Synthesize ----
    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, body: dict):
        import base64, io, os, tempfile
        import soundfile as sf

        text = (body.get("text") or "").strip()
        if not text:
            return {"error": "text required"}

        exaggeration = float(body.get("exaggeration", 0.4))
        cfg = float(body.get("cfg", 0.5))
        voice_name = body.get("voice_name")
        audio_b64_ref = body.get("audio_b64_ref")
        save_voice_as = body.get("save_voice_as")

        audio_prompt_path = None

        if audio_b64_ref:
            raw = base64.b64decode(audio_b64_ref)
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp.write(raw)
            tmp.close()
            audio_prompt_path = tmp.name

            if save_voice_as:
                save_name = save_voice_as.strip().lower().replace(" ", "_")
                dest = os.path.join(VOICES_DIR, f"{save_name}.wav")
                with open(dest, "wb") as f:
                    f.write(raw)
                idx = _load_voice_index()
                idx[save_name] = f"{save_name}.wav"
                _save_voice_index(idx)
                cache.commit()

        elif voice_name:
            idx = _load_voice_index()
            safe = voice_name.strip().lower().replace(" ", "_")
            if safe not in idx:
                return {"error": f"voice '{voice_name}' not found", "available": list(idx.keys())}
            audio_prompt_path = os.path.join(VOICES_DIR, idx[safe])

        try:
            audio, sr, words = self._synthesize(text, audio_prompt_path, exaggeration, cfg)
        except Exception as e:
            return {"error": str(e)}

        buf = io.BytesIO()
        sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
        return {
            "sample_rate": sr,
            "duration": round(len(audio) / sr, 3),
            "words": words,
            "audio_b64": base64.b64encode(buf.getvalue()).decode(),
        }

    # ---- List voices ----
    @modal.fastapi_endpoint(method="GET")
    def voices(self):
        idx = _load_voice_index()
        return {"voices": list(idx.keys())}

    # ---- Delete voice ----
    @modal.fastapi_endpoint(method="POST")
    def delete_voice(self, body: dict):
        import os
        name = (body.get("name") or "").strip().lower().replace(" ", "_")
        idx = _load_voice_index()
        if name not in idx:
            return {"error": f"voice '{name}' not found"}
        filepath = os.path.join(VOICES_DIR, idx[name])
        if os.path.exists(filepath):
            os.remove(filepath)
        del idx[name]
        _save_voice_index(idx)
        cache.commit()
        return {"deleted": name, "remaining": list(idx.keys())}
