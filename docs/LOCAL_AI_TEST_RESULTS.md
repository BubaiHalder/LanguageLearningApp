# Local AI validation — 2026-10-15

## B5 integration update

Status: automated real-service integration passed; **core Android voice flow confirmed by the owner on 2026-10-15**. In response to whether Send recording showed recognized speech, a real tutor reply and audible tutor speech, the owner answered: “All three worked.” This is user-reported physical-device evidence, separate from automated tests. Phone model, Android version, language/voice used, restart/history persistence, both correction modes and failure recovery were not specified. Full B5 device-checklist sign-off and iOS verification remain pending. See [phone testing and changed files](PHASE_B5.md).

| B5 verification actually run | Result |
| --- | --- |
| Mobile/domain/SQLite/audio suite including new migration, client and speech tests | 45 passed |
| Mobile lint and TypeScript | Passed |
| NestJS suite including audio provenance forwarding | 5 passed |
| NestJS build and TypeScript | Passed |
| FastAPI suite | 12 passed |
| Android and iOS Hermes/JavaScript export | Passed; no native install/device playback claim |
| Shared mobile client/controller → authenticated NestJS → FastAPI → real Whisper | Passed using synthetic English speech |
| Recognized text → real Qwen → mobile controller → SQLite | Passed; Hindi explanation, deferred correction mode and saved feedback |
| Tutor response → real local TTS → mobile speech controller | Passed for installed male/female English voices; native playback port stubbed |
| Real transcript/correction/response close/reopen persistence | Passed with SQLite file; mock/live histories isolated |
| Simple Hindi and Spanish Qwen structured text probes | Passed; not a semantic quality benchmark |
| Authenticated gateway readiness through PC private Wi-Fi address | HTTP 200, live STT/conversation/TTS ready; unauthenticated access rejected |
| Physical Android core recording → recognition → tutor reply → audible speech | Passed, owner-reported: “All three worked” on 2026-10-15 |
| Android restart/history, both correction modes, alternate voices and error recovery | Not separately confirmed |
| Physical iOS full conversation and audible playback | Pending |

Voice discovery returned English David (male), Hazel and Zira (female). Hindi/Spanish voices: zero. Actual Hindi/Spanish/mixed-language speech recognition was not tested. No additional models/voices were downloaded for B5. Native `expo-audio` permission/record/replay code is connected, but mocked controller tests and bundles cannot certify its phone behavior.

The original version-1 assertion initially failed because the authorized migration now produces version 2; it was updated and migration preservation/rollback tests added. A new gateway test initially expected HTTP 200 for a NestJS POST; the existing behavior is 201, and the expectation was corrected. Final listed suites passed. The previous service-only checks below are historical evidence from before B5.

Reproduce the integrated model test: `services/ai/.venv/Scripts/python.exe scripts/test-local-services.py --live --mobile-client`. It starts temporary loopback services, uses synthetic audio and the actual shared mobile pure TypeScript modules, checks generated WAV bytes and SQLite persistence, and stops its temporary processes. Native microphone and speaker ports are outside that automated test.

## Earlier service-only validation

Environment: Windows 11, Intel Core 7 150U, CPU inference, Node 24.22, Python 3.13.7. Model downloads explicitly approved by the owner. No cloud inference or deployment.

| Check actually run | Result |
| --- | --- |
| Mobile unit / SQLite / audio-controller suite | 37 passed |
| Mobile ESLint and TypeScript | Passed |
| NestJS gateway integration / JWT / limits suite | 4 passed |
| NestJS build and TypeScript | Passed |
| FastAPI validation / auth / concurrency / feedback regressions | 12 passed |
| Compose YAML/static security assertions | Passed; not Docker runtime validation |
| Full loopback NestJS → FastAPI fixture HTTP integration | 4 checks passed |
| Full loopback NestJS → FastAPI live HTTP integration | 4 checks passed: Qwen feedback, Whisper multipart transcription, Windows speech WAV, credential separation |
| Direct real Whisper small | Passed: recognized hello in synthetic English speech; latest run approximately 10 seconds including initialization |
| Direct Windows local male/female TTS | Passed: nonempty WAV files from installed David and Hazel voices |
| Direct Qwen3 1.7B structured feedback | Passed: corrected past-tense sentence contains went; Hindi explanation contains Devanagari; latest run approximately 8 seconds |
| Python compilation and Git whitespace check | Passed |

Earlier failed checks were retained as useful evidence: faster-whisper 1.2.1 was incompatible with PyAV 19, so the tested runtime is pinned to PyAV 15.1. Qwen initially used English explanations or repeated the incorrect full sentence despite listing a correction. Explicit language/schema instructions and a bilingual example resolved the final synthetic checks; regressions reject missing Hindi script and unchanged sentences with differing corrections. These checks cannot prove semantic accuracy or consistent teaching quality across learners.

The live HTTP test uses synthetic text/audio and temporary local HTTP processes; it does not test mobile networking or user speech. Temporary gateway/worker processes are stopped by the test script. Portable Ollama was started separately on loopback for inference; it is a local development service, not a deployment.

Not tested: Docker/Compose execution and image builds (Docker unavailable), Ubuntu, Caddy certificate issuance, real production identity-provider integration, NVIDIA/CUDA, Piper runtime/voices, Hindi/Spanish or mixed-language speech recognition, representative grammar/CEFR quality, physical Android/iOS upload and generated-speech playback, or a complete mobile AI conversation loop. No production voice assets were downloaded or cleared. The main tutor remains mock; existing schema/version/history were preserved.

See [reproduction commands and setup](LOCAL_AI_DEPLOYMENT.md#repeatable-validation), and [Windows startup](LOCAL_AI_DEPLOYMENT.md#windows-prerequisites-and-startup).
