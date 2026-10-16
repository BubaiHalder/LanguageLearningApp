# Phase B: free local voice tutor

Updated 2026-10-15. B1 code is implemented; native device acceptance is still pending. B2-B6 are plans and require separate approval. No AI runtimes or models have been installed or downloaded. No backend is running or publicly exposed. Phase A mock behavior remains available.

## Inspected environment

| Item | Observed |
| --- | --- |
| OS | Windows 11 Pro, 64-bit, version 10.0.26200 |
| CPU | Intel Core 7 150U, 10 cores / 12 logical processors |
| Memory | About 31.7 GiB usable; about 6.9 GiB free at inspection |
| GPU | Intel integrated graphics; WMI reports about 2 GiB adapter memory, not a dedicated VRAM guarantee |
| Storage | About 25.3 GiB free on C: and 16.9 GiB on D: |
| Node | 24.22.0 |
| Python / pip | Python 3.13.7 / pip 25.3 |
| Android tooling | ADB exists at `C:\platform-tools\adb.exe`; no USB/debugging device listed |
| Phone | User reports connecting with Expo Go; Wi-Fi Expo Go does not require an ADB connection |
| Missing local AI tools | Ollama not on PATH or found in checked standard install paths; FastAPI, Uvicorn, faster-whisper, CTranslate2 and Piper not importable in the inspected Python |
| FFmpeg / NVIDIA tools | Not found on PATH; no NVIDIA GPU reported |
| Backend | No NestJS/FastAPI app in the repository |

Wi-Fi IPv4 at inspection: `192.168.1.49`. Other virtual/Ethernet adapters exist; use the IP on the same network as the phone. Addresses and free resources can change. Do not use the phone's localhost for the PC backend.

CPU inference is the starting plan; no CUDA or Intel GPU acceleration is assumed. Close memory-heavy apps before loading models, use one inference request at a time, and benchmark before increasing model/context size. Disk downloads, Python packages and model caches need additional headroom.

## Model and license research before installation

These are candidates verified against publisher documentation, not installed or benchmarked models. File sizes are approximate downloads, not total runtime memory.

| Component | Initial recommendation | Verified basis and limitations |
| --- | --- | --- |
| Ollama | Native Windows runtime; CPU baseline | Runtime [MIT license](https://github.com/ollama/ollama/blob/main/LICENSE); [Windows requirements](https://docs.ollama.com/windows) include installer storage beyond model weights. Not installed. |
| Conversation | `qwen3:1.7b` Q4_K_M first; consider `qwen3:4b` after memory/latency checks | Publisher tags list about [1.4 GB](https://ollama.com/library/qwen3:1.7b) and [2.5 GB](https://ollama.com/library/qwen3:4b). Qwen's [release documentation](https://qwenlm.github.io/blog/qwen3/) lists Apache 2.0 and English, Hindi and Spanish among its languages. Use a small context and non-thinking mode for the first benchmark. Tutor accuracy and advanced-level teaching still need evaluation. |
| STT | `Systran/faster-whisper-small`, CPU/int8; `base` only if latency demands it | [Model card](https://huggingface.co/Systran/faster-whisper-small) lists MIT and multilingual support; [files](https://huggingface.co/Systran/faster-whisper-small/tree/main) total about 486 MB. Choose multilingual weights, not `.en`. [faster-whisper](https://github.com/SYSTRAN/faster-whisper) supports CPU int8 and uses PyAV with bundled FFmpeg libraries, so standalone FFmpeg is not initially required. Code-switching is best effort, not a guaranteed capability. |
| TTS engine | Piper candidate; evaluate an alternative local engine if voice terms or quality do not fit | Current [OHF Piper](https://github.com/OHF-Voice/piper1-gpl) identifies GPL-3.0. Engine and voice/dataset terms are separate; do not infer every voice's license from the repository banner. |

Checked voice cards:

- English `en_US-lessac-medium`: [card](https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/lessac/medium/MODEL_CARD) is available and links a separate dataset license. That linked license could not be fetched during this inspection; approval remains unresolved.
- English `en_US-ryan-medium`: [card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ryan/medium/MODEL_CARD) lists dataset CC BY-NC-SA 4.0. Do not classify it as production-cleared.
- Hindi `hi_IN-pratham-medium` and `hi_IN-priyamvada-medium`: [Pratham card](https://huggingface.co/rhasspy/piper-voices/blob/main/hi/hi_IN/pratham/medium/MODEL_CARD) and [Priyamvada card](https://huggingface.co/rhasspy/piper-voices/raw/main/hi/hi_IN/priyamvada/medium/MODEL_CARD) list CC BY-NC-SA 4.0 dataset terms. Exclude them from the default production voice plan pending an appropriate alternative/permission.
- Spanish `es_ES-sharvard-medium`: [card](https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_ES/sharvard/medium/MODEL_CARD) lists two speakers, dataset CC BY 3.0, and fine-tuning from Lessac. Review the complete voice provenance and audition each speaker before approval.

No male/female voice pairing for all three languages has been verified. Voice names and two-speaker counts are not proof of gender or quality. B4 must publish an explicit tested capability catalog with actual voice IDs, language, speaker labels, provenance and fallback reasons. Preserve text when an appropriate voice is unavailable. Do not silently substitute an English voice for Hindi/Spanish. No voice files were downloaded.

## Proposed local architecture

```text
Android/iOS app + SQLite
    | user-initiated audio + bounded context over the private LAN
NestJS gateway: PC LAN IP, port 3000 (planned)
    | loopback only
FastAPI worker: 127.0.0.1:8000 (planned)
    |-- faster-whisper CPU/int8
    |-- Ollama/Qwen at 127.0.0.1:11434
    |-- local TTS adapter and approved voice catalog
```

No server SQL database is needed initially. The mobile app retains history. The gateway owns upload validation, user pairing/authentication, limits, timeouts and request IDs; the worker owns AI adapters. Keep raw AI ports on loopback. Before phone access, bind only the intended private adapter, restrict Windows Firewall to the private profile/subnet, and use authenticated requests. Do not add router port forwarding, public tunnels, cloud fallback, or public listeners. No firewall settings have been changed in B1.

## Stage plan and approval gates

| Stage | Deliverable | Required evidence / stop point |
| --- | --- | --- |
| B1 — current | Native microphone permission, record/stop/cancel, duration, own-recording replay, optional upload client; mock mode preserved | Automated state tests and platform bundles; Android/iOS permission, cancellation and audio acceptance on devices. Ask before B2. |
| B2 | NestJS LAN gateway and loopback FastAPI STT service; faster-whisper CPU/int8, bounded multipart endpoint and no-speech errors | Approve packages and ~486 MB model download first; test English/Hindi/Spanish and mixed-language samples, silence, upload failure and cleanup. Ask before B3. |
| B3 | Ollama/Qwen adapter, proficiency preference (A1-C2), bounded conversation context, schema-validated feedback | Approve Ollama installation/model download first; compare correction accuracy, explanation language, JSON validity and latency. Ask before B4. |
| B4 | Local TTS engine and approved voice catalog; actual tutor-response audio playback | Approve engine/voice downloads after license and speaker review; test each language/persona and unavailable-voice behavior. Ask before B5. |
| B5 | End-to-end voice turns, persisted real results and derived progress, immediate/end correction flow | Additive, transactional schema migration with populated Phase A fixtures and rollback tests; successful phone conversation with all components. Ask before B6. |
| B6 | Regression, device acceptance, performance measurements and documentation | Report actual CPU/RAM, recording→transcript→reply→audio times, failures and supported combinations. No deployment. |

Real correction results need structured fields for transcription, corrected sentence(s), grammar/vocabulary/construction categories, native-language explanations and target-language response. The backend must validate these fields and distinguish unclear recognition from an actual learner mistake. Model-generated proficiency feedback is not certification. In B3/B5, use server-validated bounded context and preserve the session's languages/proficiency/voice metadata for each in-flight request.

B5 should add real-AI storage tables/metadata without deleting or rewriting Phase A evidence. B1 leaves `speaking-tutor.db` and schema version 1 unchanged. Its `provider='mock-v1'` constraint must not be bypassed to store real results. Keep progress derived from immutable practice evidence, not an invented score from recording duration.

## Installations and steps

Completed for B1 only:

```powershell
npx.cmd expo install expo-audio expo-file-system
```

Installed SDK 57-compatible `expo-audio ~57.0.5` and `expo-file-system ~57.0.7`. Audio config requests Android microphone access and supplies the iOS usage description. Background recording/playback are disabled. iOS also has a local-network usage description. Existing SDK/router/assets/configuration and stored data are retained.

Planned after B2 approval, not executed:

1. Create a project-local Python virtual environment. Check binary wheel support against existing Python 3.13 before installing; use a separate supported Python version only if needed. Do not modify the global Python environment.
2. Resolve/pin FastAPI, Uvicorn, python-multipart, faster-whisper, CTranslate2 and test dependencies, checking Windows wheels using the [CTranslate2 installation guide](https://opennmt.net/CTranslate2/installation.html). A dependency resolver check does not authorize model downloads.
3. Obtain approval for the multilingual Whisper small download; put it in an explicit local cache excluded from Git. Pin the model revision and license record. Download once with consent; subsequent inference must use local files and never fall back to a paid service.
4. Add NestJS gateway and worker tests, validate the existing B1 client contract, and run loopback tests before authorizing private-LAN phone access. No cloud or central database is required.

Planned after B3 approval, not executed: install Ollama from its official Windows distribution, verify `ollama --version`, select a cache location with sufficient space, and request approval before `ollama pull qwen3:1.7b`. A 4B upgrade is a separate download/benchmark decision. Do not pull 8B+ models as a default on this currently memory-constrained session.

## B1 implementation and testing

Files: `src/features/tutor/audio/audio-controller.ts`, `local-audio-panel.tsx`, its web fallback, `upload-contract.ts`, `tests/audio.test.cjs`, plus the tutor screen entry and app/package configuration. Existing Phase A controller, mock service, repository and migration are unchanged.

The **B1 lab** is separate from the mock conversation. It records mono M4A/AAC into the app cache with a native 60-second cap. It requests permission on Record only, handles denial/permanent denial, serializes native operations, rejects tiny clips, snapshots recording languages, exposes replay/cancel, and cancels on app background/context changes. Unmount deletion is best effort because Expo releases native objects; forced process termination can leave temporary cache files for OS cleanup. No audio file is written into conversation history in B1.

The optional **Upload to my PC** client sends multipart `audio`, `nativeLanguage`, `targetLanguage`, and `durationMs` to `<LAN origin>/v1/audio/transcriptions` and expects `{ "transcript": "..." }`. It limits recordings to 10 MB, uses a 30-second timeout/abort, validates responses, rejects public hosts and redirects, and requires an explicit tap. The endpoint does not exist until B2, so live upload success is not tested or expected now. Transcriptions displayed in the lab are not silently sent to the mock tutor or saved as real-AI turns.

Native transport policy can reject cleartext HTTP. For a development HTTPS backend, the phone must trust its certificate. B1 does not broadly disable Android transport security or iOS ATS. Solve specific development transport requirements in B2; do not weaken release settings. Never use phone `localhost` or expose an AI worker port.

Automated results at B1 implementation: 36/36 tests passed (22 Phase A regressions, 14 audio/controller/contract tests), TypeScript and lint passed, and Android/iOS/web exports compiled. Audio tests use injected devices/transports; they do not prove native hardware recording, playback or HTTP upload. Device tests remain pending. User reports entering Expo Go and saying “hello hello” into the recorder, but audible replay has not yet been explicitly confirmed.

### Test on your Android phone now

1. Start Metro from this project with `npm.cmd start` if it is not already running. Put PC and phone on the same trusted Wi-Fi. Scan its QR code in a compatible Expo Go client. ADB can remain empty for a Wi-Fi Expo Go connection.
2. Reload the project after the new dependency install. If Expo Go reports a missing native module, confirm SDK compatibility and reopen it. SDK 57 Audio is bundled in compatible Expo Go; app-specific plugin permission text and native configuration still require a rebuilt development binary to verify.
3. On **Speak**, scroll below the mock prototype controls to **Real microphone · B1 lab**. Tap Record, allow the OS microphone permission, and say “hello hello” for at least one second. Confirm the timer advances and the OS microphone indicator is visible.
4. Tap Stop recording, then Replay my voice. Confirm you hear your own words. Replay does not synthesize Maya/Alex speech. No text recognition or AI answer is expected in B1.
5. Try Cancel & discard during recording and after stopping. Repeat with permission denied/permanently denied, 60-second cap, app backgrounding, language changes, headphones, and interruption.
6. Verify mock sample sentences, correction modes and saved history still work. Force-close/reopen and check old conversations remain. Do not uninstall or clear app storage as a troubleshooting step.
7. Leave Upload alone until B2 is approved and running. Report an exact error message if recording/replay fails.

Repeat with a physical iPhone and record the OS, Expo Go/development build version, outcome, and errors. Native permissions, hardware replay, local HTTPS upload and real model behavior are separate acceptance checks. Do not mark them passed based on JavaScript bundling or mocked tests.

## Local service implementation update
See [local AI services and deployment preparation](LOCAL_AI_DEPLOYMENT.md) for the expanded authorized service work, approved model downloads, current Windows startup and remaining device/Linux checks. Earlier B1-only scope notes above describe the initial stage.

