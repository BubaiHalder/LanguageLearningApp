"""Static deployment checks. Not a substitute for docker compose config/build on Linux."""
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
base = yaml.safe_load((ROOT / 'infra/compose.yaml').read_text())
dev = yaml.safe_load((ROOT / 'infra/compose.dev.yaml').read_text())
prod = yaml.safe_load((ROOT / 'infra/compose.prod.yaml').read_text())
yaml.safe_load((ROOT / 'infra/compose.gpu.yaml').read_text())
for service in ('ai', 'ollama'):
    assert 'ports' not in base['services'][service]
    assert 'ports' not in dev['services'].get(service, {})
    assert 'ports' not in prod['services'].get(service, {})
    assert 'healthcheck' in base['services'][service]
    assert base['services'][service]['volumes']
    assert 'mem_limit' in base['services'][service]
assert base['networks']['inference']['internal'] is True
assert prod['services']['api']['environment']['AUTH_MODE'] == 'jwt'
assert prod['services']['ai']['environment']['AI_MODE'] == 'live'
assert 'ports' not in prod['services']['api']
assert prod['services']['proxy']['ports'] == ['80:80', '443:443']
assert '127.0.0.1' in dev['services']['api']['ports'][0]
for path in ['services/api/Dockerfile', 'services/ai/Dockerfile', 'services/ai/Dockerfile.cuda', 'infra/ollama/Dockerfile']:
    assert (ROOT / path).is_file()
print('PASS: YAML parsing, private AI networks, no published model/worker ports, persistent models, production auth/live gates, resource/health declarations')
print('LIMIT: Docker engine/Compose builds and Ubuntu/GPU behavior are not tested by this script')
