"""Compare existing Whisper decoding settings on the approved synthetic fixture only.

This is an isolated experiment, not a service/configuration change or a quality benchmark.
No model downloads, personal recordings or learner databases are used.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services' / 'ai'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repeats', type=int, default=2, choices=range(1, 6))
    args = parser.parse_args()
    from dotenv import load_dotenv
    load_dotenv(ROOT / 'services' / 'ai' / '.env', override=False)
    os.environ['HF_HUB_OFFLINE'] = '1'
    from app.settings import Settings
    settings = Settings.load()
    model_root = (ROOT / 'services' / 'ai' / 'models').resolve()
    if not settings.whisper_path.is_relative_to(model_root):
        raise SystemExit('Expected the approved Whisper model under services/ai/models')
    if not (settings.whisper_path / 'model.bin').is_file():
        raise SystemExit('Existing Whisper model is missing; nothing was downloaded')
    sample = model_root / 'test-hello.wav'
    if not sample.is_file():
        raise SystemExit('Approved synthetic test-hello.wav fixture is missing')
    from faster_whisper import WhisperModel
    started = time.perf_counter()
    model = WhisperModel(str(settings.whisper_path), device=settings.device,
        compute_type=settings.compute_type, cpu_threads=settings.cpu_threads, local_files_only=True)
    load_seconds = time.perf_counter() - started

    def transcribe(beam):
        started = time.perf_counter()
        segments, info = model.transcribe(str(sample), language=None, task='transcribe',
            vad_filter=True, beam_size=beam, condition_on_previous_text=False,
            initial_prompt='Possible languages: hi, en.')
        text = ' '.join(s.text.strip() for s in segments if s.no_speech_prob < 0.8).strip()
        normalized = ' '.join(text.lower().split())
        return {'beam': beam, 'seconds': round(time.perf_counter() - started, 3),
            'language': info.language, 'contains_hello': 'hello' in normalized,
            'normalized_sha256': hashlib.sha256(normalized.encode()).hexdigest()}

    cold = transcribe(3)
    print(json.dumps({'model_load_seconds': round(load_seconds, 3), 'first_inference': cold}), flush=True)
    results = []
    for index in range(args.repeats):
        for beam in ([3, 1] if index % 2 == 0 else [1, 3]):
            result = transcribe(beam)
            results.append(result)
            print(json.dumps({'warm_run': len(results), **result}), flush=True)
    summary = []
    for beam in [3, 1]:
        samples = [r for r in results if r['beam'] == beam]
        summary.append({'beam': beam, 'samples': len(samples),
            'median_seconds': round(statistics.median(r['seconds'] for r in samples), 3),
            'all_contain_hello': all(r['contains_hello'] for r in samples),
            'all_match_first_normalized_transcript': all(r['normalized_sha256'] == cold['normalized_sha256'] for r in samples)})
    print(json.dumps({'summary': summary, 'limitations': 'Synthetic English fixture only. No accent/noise/Hindi/Spanish quality or phone playback claim. Production settings unchanged.'}), flush=True)
    if not cold['contains_hello'] or not all(r['contains_hello'] for r in results):
        raise SystemExit('Synthetic recognition regression; do not adopt a faster setting')


if __name__ == '__main__':
    main()
