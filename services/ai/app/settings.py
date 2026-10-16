from dataclasses import dataclass
from pathlib import Path
import os


def number(name: str, default: int, low: int, high: int) -> int:
    value = int(os.getenv(name, str(default)))
    if not low <= value <= high:
        raise ValueError(f"{name} must be between {low} and {high}")
    return value


@dataclass(frozen=True)
class Settings:
    environment: str
    mode: str
    service_token: str
    ollama_url: str
    ollama_model: str
    model_root: Path
    whisper_path: Path
    voice_catalog: Path
    device: str
    compute_type: str
    cpu_threads: int
    concurrency: int
    timeout: int
    max_upload: int
    max_duration: int
    tts_engine: str

    @classmethod
    def load(cls):
        env = os.getenv("APP_ENV", "development")
        mode = os.getenv("AI_MODE", "live")
        token = os.getenv("AI_SERVICE_TOKEN", "")
        if len(token) < 32 or token.startswith("CHANGE_"):
            raise ValueError("AI_SERVICE_TOKEN must be a generated secret of at least 32 characters")
        if mode not in {"live", "fixture"} or env not in {"development", "test", "production"}:
            raise ValueError("Invalid APP_ENV or AI_MODE")
        if env == "production" and mode != "live":
            raise ValueError("Production must never use fixture AI")
        tts_engine = os.getenv("TTS_ENGINE", "sapi" if os.name == "nt" else "piper")
        if tts_engine not in {"sapi", "piper"} or (env == "production" and tts_engine == "sapi"):
            raise ValueError("Use Piper for production Linux; SAPI is a Windows development adapter")
        url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        from urllib.parse import urlsplit
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
            raise ValueError("OLLAMA_URL must be a configured HTTP(S) origin")
        root = Path(os.getenv("AI_MODEL_ROOT", "./models")).resolve()
        whisper = Path(os.getenv("WHISPER_MODEL_PATH", str(root / "whisper-small"))).resolve()
        return cls(env, mode, token, url, os.getenv("OLLAMA_MODEL", "qwen3:1.7b"), root,
                   whisper, Path(os.getenv("VOICE_CATALOG_PATH", "./voices.json")).resolve(),
                   os.getenv("WHISPER_DEVICE", "cpu"), os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
                   number("AI_CPU_THREADS", 4, 1, 128), number("AI_CONCURRENCY", 1, 1, 16),
                   number("AI_TIMEOUT_SECONDS", 120, 1, 600),
                   number("MAX_UPLOAD_BYTES", 10 * 1024 * 1024, 1024, 20 * 1024 * 1024),
                   number("MAX_AUDIO_SECONDS", 60, 1, 120), tts_engine)
