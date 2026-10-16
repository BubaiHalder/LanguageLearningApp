"""Run real NestJS -> FastAPI HTTP integration on loopback with explicit AI fixtures."""
import io
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def request(url, token=None, body=None, content_type='application/json'):
    headers = {'Content-Type': content_type}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=150) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


if __name__ == '__main__':
    live = '--live' in sys.argv
    if live:
        from dotenv import load_dotenv
        load_dotenv(ROOT / 'services/ai/.env', override=False)
    ai_port, api_port = free_port(), free_port()
    internal, client, metrics = (secrets.token_urlsafe(48) for _ in range(3))
    environment = {**os.environ, 'APP_ENV': 'test', 'AI_MODE': 'live' if live else 'fixture', 'AI_SERVICE_TOKEN': internal,
        'AUTH_MODE': 'token', 'CLIENT_ACCESS_TOKEN': client, 'METRICS_TOKEN': metrics,
        'AI_HOST': '127.0.0.1', 'API_HOST': '127.0.0.1', 'AI_PORT': str(ai_port), 'API_PORT': str(api_port),
        'AI_SERVICE_URL': f'http://127.0.0.1:{ai_port}'}
    python = ROOT / ('services/ai/.venv/Scripts/python.exe' if os.name == 'nt' else 'services/ai/.venv/bin/python')
    processes = []
    try:
        processes.append(subprocess.Popen([str(python), '-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', str(ai_port), '--no-access-log'],
            cwd=ROOT / 'services/ai', env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        processes.append(subprocess.Popen(['node', 'dist/main.js'], cwd=ROOT / 'services/api', env=environment,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        base = f'http://127.0.0.1:{api_port}'
        for path in [f'http://127.0.0.1:{ai_port}/health/live', base + '/health/live']:
            for _ in range(100):
                try:
                    if request(path)[0] == 200: break
                except OSError: pass
                if any(p.poll() is not None for p in processes): raise RuntimeError('A local service failed startup')
                time.sleep(0.1)
            else: raise RuntimeError('Service startup timed out')
        assert request(base + '/health/ready')[0] == 401
        assert request(base + '/health/ready', client)[0] == 200
        body = json.dumps({'text': 'I goed home', 'nativeLanguage': 'hi', 'targetLanguage': 'en', 'correctionMode': 'end'}).encode()
        status, data, _ = request(base + '/v1/tutor/respond', client, body)
        assert status in (200, 201), (status, data)
        feedback = json.loads(data)
        assert feedback['provider'] == ('ollama' if live else 'fixture') and feedback['feedbackDeferred'] is True
        if live: assert any('\u0900' <= c <= '\u097f' for c in feedback['explanation'])
        print('PASS: authenticated NestJS -> FastAPI conversation (' + ('real Qwen' if live else 'fixture') + ')', flush=True)
        wav = io.BytesIO()
        with wave.open(wav, 'wb') as stream:
            stream.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            stream.writeframes(b'\x00\x00' * 16000)
        boundary = 'test-' + secrets.token_hex(12)
        parts = []
        for key, value in {'nativeLanguage': 'hi', 'targetLanguage': 'en', 'durationMs': '1000'}.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        audio = (Path(environment['AI_MODEL_ROOT']) / 'test-hello.wav').read_bytes() if live else wav.getvalue()
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="test.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode(), audio, f'\r\n--{boundary}--\r\n'.encode()])
        status, data, _ = request(base + '/v1/audio/transcriptions', client, b''.join(parts), f'multipart/form-data; boundary={boundary}')
        assert status in (200, 201), (status, data)
        assert json.loads(data)['provider'] == ('faster-whisper' if live else 'fixture')
        if live: assert 'hello' in json.loads(data)['transcript'].lower()
        print('PASS: multipart audio reaches the worker through NestJS', flush=True)
        voices = json.loads(request(base + '/v1/voices', client)[1])['voices']
        voice_id = next(v['id'] for v in voices if v['language'] == 'en') if live else 'fixture-en'
        status, data, headers = request(base + '/v1/audio/speech', client, json.dumps({'text': 'hello', 'language': 'en', 'voiceId': voice_id}).encode())
        assert status in (200, 201) and data[:4] == b'RIFF' and 'audio/wav' in headers['Content-Type']
        print('PASS: ' + ('real Windows TTS' if live else 'fixture tone') + ' WAV reaches the HTTP client; not a phone playback test', flush=True)
        assert request(base + '/metrics', client)[0] == 401
        assert request(base + '/metrics', metrics)[0] == 200
        assert request(f'http://127.0.0.1:{ai_port}/v1/voices', client)[0] == 401
        print('PASS: client/internal/monitor credentials are separated')
        if '--mobile-client' in sys.argv:
            if not live: raise RuntimeError('--mobile-client requires --live; the mobile live client rejects fixtures')
            subprocess.run(['node', '--require', './scripts/register-typescript.cjs', 'scripts/test-mobile-live.cjs'],
                cwd=ROOT, env={**environment, 'TEST_GATEWAY_ORIGIN': base}, check=True)
    finally:
        for process in reversed(processes):
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
