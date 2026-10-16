"""Create ignored development environment files; never replace existing secrets."""
import argparse
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parents[1]

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', action='store_true', help='Explicitly use labeled fixture responses')
    args = parser.parse_args()
    files = [ROOT / 'services/api/.env', ROOT / 'services/ai/.env', ROOT / 'infra/.env']
    if any(path.exists() for path in files):
        raise SystemExit('Environment files already exist. Edit them deliberately; existing credentials were not changed.')
    internal, client, metrics = (secrets.token_urlsafe(48) for _ in range(3))
    model_root = (ROOT / 'services/ai/models').as_posix()
    mode = 'fixture' if args.fixture else 'live'
    content = f'APP_ENV=development\nAI_SERVICE_TOKEN={internal}\n'
    files[0].write_text(content + f'AUTH_MODE=token\nCLIENT_ACCESS_TOKEN={client}\nMETRICS_TOKEN={metrics}\nAPI_HOST=127.0.0.1\nAPI_PORT=3000\nAI_SERVICE_URL=http://127.0.0.1:8000\nUPSTREAM_TIMEOUT_MS=125000\n', encoding='utf-8')
    files[1].write_text(content + f'AI_MODE={mode}\nAI_HOST=127.0.0.1\nAI_PORT=8000\nAI_MODEL_ROOT={model_root}\nWHISPER_MODEL_PATH={model_root}/whisper-small\nVOICE_CATALOG_PATH={(ROOT / "services/ai/voices.json").as_posix()}\nOLLAMA_URL=http://127.0.0.1:11434\nOLLAMA_MODEL=qwen3:1.7b\nAI_CONCURRENCY=1\nAI_CPU_THREADS=4\nAI_TIMEOUT_SECONDS=120\nHF_HUB_OFFLINE=1\n', encoding='utf-8')
    files[2].write_text(content + f'AI_MODE={mode}\nAUTH_MODE=token\nCLIENT_ACCESS_TOKEN={client}\nMETRICS_TOKEN={metrics}\nDEV_BIND_IP=127.0.0.1\nINSTALL_AI_RUNTIMES=0\n', encoding='utf-8')
    print('Created three ignored development environment files. No credentials printed.')
