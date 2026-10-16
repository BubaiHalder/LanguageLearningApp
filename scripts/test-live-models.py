"""Explicit local inference smoke tests. Requires previously approved/provisioned models."""
import io
import os
from pathlib import Path
import sys
import time
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/ai'))
from dotenv import load_dotenv
from app.settings import Settings
from app.engines import Engines
from app.schemas import SpeechRequest, TutorRequest

if __name__ == '__main__':
    load_dotenv(ROOT / 'services/ai/.env', override=False)
    if os.getenv('AI_MODE') != 'live': raise SystemExit('Set AI_MODE=live explicitly for real model tests')
    settings = Settings.load()
    engines = Engines(settings)
    sample = settings.model_root / 'test-hello.wav'
    if not sample.exists(): raise SystemExit('Generate or supply an approved synthetic English test-hello.wav sample first')
    started = time.monotonic()
    result = engines.transcribe(sample.read_bytes(), '.wav', 'en', 'en')
    assert 'hello' in result['transcript'].lower(), result
    print(f'PASS real Whisper English synthetic-speech transcription ({time.monotonic()-started:.1f}s)', flush=True)
    voices = engines.voices()
    for gender in ['male', 'female']:
        voice = next((v for v in voices if v['language'] == 'en' and v['gender'] == gender), None)
        if not voice: raise RuntimeError(f'No verified installed English {gender} voice')
        data = engines.speech(SpeechRequest(text='Hello. Keep practising your English.', language='en', voiceId=voice['id']))
        with wave.open(io.BytesIO(data), 'rb') as stream:
            assert stream.getnframes() / stream.getframerate() > 0.2
        print(f'PASS real local {gender} TTS WAV generated: {voice["label"]} (not a phone playback test)', flush=True)
    started = time.monotonic()
    feedback = engines.tutor(TutorRequest(text='Yesterday I go to the market.', nativeLanguage='hi', targetLanguage='en', proficiency='A1'))
    assert feedback['provider'] == 'ollama' and feedback['correctedSentence'] and feedback['response']
    assert 'went' in feedback['correctedSentence'].lower(), 'Expected past-tense correction missing'
    assert any('\u0900' <= c <= '\u097f' for c in feedback['explanation']), 'Native-language explanation was not Hindi'
    print(f'PASS real Qwen JSON feedback and Hindi explanation ({time.monotonic()-started:.1f}s)', flush=True)
