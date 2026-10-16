"""Explicit, consent-gated local downloads; never called during service startup/build."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def download_whisper():
    from huggingface_hub import HfApi, snapshot_download
    repo = 'Systran/faster-whisper-small'
    revision = HfApi().model_info(repo, token=False).sha
    target = ROOT / 'services/ai/models/whisper-small'
    snapshot_download(repo, revision=revision, local_dir=target, token=False)
    (target.parent / 'whisper-provenance.json').write_text(json.dumps({
        'repository': repo, 'revision': revision, 'license': 'MIT', 'quantization_at_runtime': 'int8',
    }, indent=2), encoding='utf-8')
    print('Whisper small provisioned at', target, 'revision', revision, flush=True)


def download_ollama():
    version = 'v0.40.4'
    url = f'https://api.github.com/repos/ollama/ollama/releases/tags/{version}'
    with urllib.request.urlopen(url, timeout=30) as response:
        release = json.load(response)
    asset = next(a for a in release['assets'] if a['name'] == 'ollama-windows-amd64.zip')
    directory = ROOT / 'services/runtime/ollama'
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory.parent / asset['name']
    print('Downloading official Ollama runtime:', asset['size'], 'bytes', flush=True)
    with urllib.request.urlopen(asset['browser_download_url'], timeout=120) as response, archive.open('wb') as output:
        while chunk := response.read(1024 * 1024): output.write(chunk)
    digest = hashlib.sha256()
    with archive.open('rb') as source:
        while chunk := source.read(1024 * 1024): digest.update(chunk)
    expected = asset.get('digest')
    actual = 'sha256:' + digest.hexdigest()
    if expected and expected != actual:
        raise RuntimeError('Ollama archive checksum mismatch; archive not extracted')
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if not (directory / member.filename).resolve().is_relative_to(directory.resolve()):
                raise RuntimeError('Unsafe archive member')
        bundle.extractall(directory)
    (directory / 'provenance.json').write_text(json.dumps({'version': version,
        'url': asset['browser_download_url'], 'sha256': digest.hexdigest(), 'publisher_digest_verified': bool(expected)}, indent=2), encoding='utf-8')
    print('Ollama runtime extracted inside workspace; no global installation.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-download', action='store_true', required=True)
    parser.add_argument('--whisper', action='store_true')
    parser.add_argument('--ollama-runtime', action='store_true')
    args = parser.parse_args()
    if args.whisper: download_whisper()
    if args.ollama_runtime: download_ollama()
