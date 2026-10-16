"""Validate project role TOML and optionally load settings in local Codex (no turns)."""

import argparse
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import tomllib


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "product_manager", "software_architect", "mobile_developer", "ai_engineer",
    "database_developer", "qa_tester", "security_reviewer",
}


def validate_files():
    config = tomllib.loads((ROOT / ".codex/config.toml").read_text(encoding="utf-8"))
    assert set(config) == {"agents"}, "Unexpected project-level configuration"
    assert config["agents"] == {
        "enabled": True, "max_concurrent_threads_per_session": 2,
    }, "Unexpected orchestration settings"
    found = set()
    for path in sorted((ROOT / ".codex/agents").glob("*.toml")):
        role = tomllib.loads(path.read_text(encoding="utf-8"))
        assert set(role) == {
            "name", "description", "developer_instructions", "features",
        }, f"Unexpected or missing role keys: {path.name}"
        for key in ("name", "description", "developer_instructions"):
            assert isinstance(role[key], str) and role[key].strip(), (path.name, key)
        assert role["name"] == path.stem, f"Name/filename mismatch: {path.name}"
        assert role["name"] not in found, f"Duplicate role: {role['name']}"
        assert role["features"] == {"apps": False, "plugins": False}, path.name
        found.add(role["name"])
    assert found == EXPECTED, f"Unexpected role set: {found ^ EXPECTED}"
    instructions = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    assert all(name in instructions for name in EXPECTED), "Missing shared role registry"
    print("PASS: seven role files, required fields, unique names, capability limits, shared registry")


def validate_runtime(executable):
    binary = shutil.which(executable)
    if not binary:
        raise RuntimeError(f"Codex executable not found: {executable}")
    version = subprocess.run(
        [binary, "--version"], capture_output=True, text=True, check=True, timeout=15,
    ).stdout.strip()
    # Only this temporary user config grants trust for validation. User settings are untouched.
    with tempfile.TemporaryDirectory(prefix="codex-config-check-", ignore_cleanup_errors=True) as temp:
        home = Path(temp)
        key = str(ROOT).lower() if os.name == "nt" else str(ROOT)
        (home / "config.toml").write_text(
            f"[projects.{json.dumps(key)}]\ntrust_level = \"trusted\"\n", encoding="utf-8",
        )
        process = subprocess.Popen(
            [binary, "app-server", "--strict-config", "--stdio"], cwd=ROOT,
            env={**os.environ, "CODEX_HOME": str(home)}, text=True, encoding="utf-8",
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        responses = queue.Queue()

        def read_output():
            for line in process.stdout:
                try:
                    responses.put(json.loads(line))
                except ValueError:
                    continue

        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()

        def request(identifier, method, params):
            process.stdin.write(json.dumps({"id": identifier, "method": method, "params": params}) + "\n")
            process.stdin.flush()
            while True:
                response = responses.get(timeout=15)
                if response.get("id") == identifier:
                    if "error" in response:
                        raise RuntimeError(response["error"])
                    return response["result"]

        try:
            request(1, "initialize", {
                "clientInfo": {"name": "project_config_validator", "version": "1.0"},
                "capabilities": {"experimentalApi": True},
            })
            process.stdin.write('{"method":"initialized"}\n')
            process.stdin.flush()
            result = request(2, "config/read", {"cwd": str(ROOT), "includeLayers": True})
            agents = result["config"]["agents"]
            assert agents["enabled"] is True
            assert agents["max_concurrent_threads_per_session"] == 2
            layers = [layer for layer in result["layers"] if
                      layer["name"].get("type") == "project" and
                      Path(layer["name"]["dotCodexFolder"]).resolve() == ROOT / ".codex"]
            assert layers and not layers[0].get("disabledReason"), "Project config was not loaded"
            print(f"PASS: {version} accepted project settings in strict config mode")
            print("LIMIT: role files checked statically; no agent spawn or model turn tested")
        finally:
            process.stdin.close()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=5)
            reader.join(timeout=2)
            process.stdout.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex", help="Also validate project settings with this installed Codex executable")
    args = parser.parse_args()
    validate_files()
    if args.codex:
        validate_runtime(args.codex)
