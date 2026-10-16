# Phase B5 — integrated local speaking tutor

Status on 2026-10-15: implementation and automated real-service integration verified; **core Android voice flow confirmed by the owner**. The owner answered “All three worked” when asked whether Send recording showed recognized speech, a real tutor reply and audible tutor speech. This confirms the core physical-phone recording-to-audible-response flow. It does not separately confirm restart/history persistence, both correction modes, alternate voices or failure recovery. Those checklist items and iOS testing remain open; full B5 sign-off is not claimed. Android/iOS JavaScript/Hermes exports remain separate automated evidence.

## Implemented flow

Open **Local AI speaking tutor** from the existing mock tutor. This is an explicit mode choice: the original Phase A simulated microphone, samples, failures and playback remain in mock mode. Local AI mode uses the actual `expo-audio` recorder/player and the existing backend, with no paid API or direct mobile connection to Python/Ollama.

1. Connect to NestJS using the public environment-configured URL and a runtime device access token (or production access JWT).
2. Choose native/explanation language, target language, male/female preference and correction timing.
3. Tap Record, grant permission, speak, Stop, and Send recording. A timer and cancellation controls are available; clips are limited to 60 seconds.
4. The app uploads multipart M4A audio with a language snapshot to authenticated NestJS. FastAPI/faster-whisper recognizes it and returns text.
5. The shared tutor controller sends recognized text, native/target languages, correction mode and the last six exchanges to Qwen through NestJS. This UI currently requests A1 difficulty; it does not infer proficiency.
6. Validated corrected sentence, native explanation, categorized original/corrected mistakes and conversational reply are saved atomically in mobile SQLite.
7. The speech controller discovers actual installed voices matching target language and persona, requests the tutor's response as WAV and plays a temporary local file. Available voices can be selected before replay. It never silently substitutes another language/gender or a fixture tone.

Text input uses the same real Qwen/persistence/speech path. End mode hides the corrected sentence, explanation and mistake list until End & review. The model is instructed to keep those corrections out of its conversational response; model adherence still needs human evaluation. Changing language/voice/timing preserves history and starts a separate conversation. Mock and live histories/resume paths are isolated, and native/target preferences are shared and persisted.

## Changed files and responsibilities

| Files | Responsibility |
| --- | --- |
| `src/features/tutor/live-tutor-screen.tsx` | Connection, language/persona settings, live conversation/history and pipeline orchestration |
| `src/features/tutor/tutor-screen.tsx` | Explicit entry to live mode; original mock interface retained |
| `src/features/tutor/live-client.ts` | Authenticated bounded HTTP, validated live feedback/catalog, real transcription and speech contracts, cancellation/timeouts |
| `src/features/tutor/tutor-controller.ts` | Live/mock session identity, bounded context, persistence and retry without repeating successful inference |
| `src/features/tutor/audio/local-audio-panel.tsx` | Existing real recorder connected to live transcription and conversation; B1 lab remains usable in mock mode |
| `src/features/tutor/audio/speech-controller.ts` | Voice availability, generation, cancellation, retry and file lifetime independent of native hooks |
| `src/features/tutor/audio/tutor-speech.tsx` | Expo native WAV cache and playback; web variant explicitly reports audio unavailable |
| `src/features/tutor/types.ts`, `src/data/tutor-repository.ts` | Provider identity and feedback fields; transactional schema 2 migration |
| `services/api/src/app.ts`, `services/api/src/upstream.ts` | Preserve/validate live-versus-fixture audio provenance through the gateway |
| `tests/live-tutor.test.cjs`, `tests/fixtures/tutor-v1.sql` | Migration preservation/rollback, authenticated client, cancellation, feedback persistence, correction timing and speech failures |
| `scripts/test-mobile-live.cjs`, `scripts/test-local-services.py` | Repeatable real-service integration using the mobile pure controllers and real SQLite |

No new mobile dependencies, native project directories, model downloads, paid APIs or deployments were introduced for B5. Existing Expo SDK/audio permissions and configuration remain in place.

## Storage migration and recovery

Schema 1→2 runs in one SQLite transaction. It adds `mode` to sessions (old records default to `mock`), copies existing turns with original IDs, timestamps, JSON and text into a replacement child table allowing `mock-v1` and `local-v1`, and adds nullable corrected-sentence/explanation fields. Only after copying successfully does it replace the old child table and advance the version. Foreign keys remain enabled. Any failure restores the original schema/data; the app reports the failure and never resets the database.

Historical fixture migration, Unicode preservation, rollback after an injected upgrade failure and foreign-key integrity were tested. This does not substitute for a device upgrade test. Do not uninstall Expo Go, clear app data, run a reset script or manually delete the learner database to troubleshoot a migration. Newer-than-supported databases are refused without modification. Older app binaries cannot read schema 2; a downgrade must not reset it.

Live transcripts, full corrections/explanations and responses are stored, not raw audio. Temporary recording and TTS cache files are cleaned on replacement/cancel/background/unmount. If inference fails before a successful save, the current transcript can be retried while the screen is open; pending failed submissions are not a durable draft/outbox. Successful replies are reused when retrying a failed save, and stable turn IDs prevent duplicate commits. If TTS/playback fails after saving, use Replay tutor / retry speech; it does not resend Qwen or create a duplicate turn.

## Windows and physical Android steps

The development gateway was started on **192.168.1.49:3000**, worker on **127.0.0.1:8000** and Ollama on **127.0.0.1:11434** for this session. Expo was already listening on 8081. These are local development processes, not a deployment. If they have stopped, use the terminals below. Verify your current Wi-Fi address with `ipconfig`; DHCP can change it.

1. Keep phone and PC on the same trusted private Wi-Fi; disable client isolation or use a network that allows phone-to-PC traffic. A USB/ADB connection is not required for Expo Go LAN testing.
2. Confirm approved models already exist. Do not run a pull/download command for this test.
3. If needed, start Ollama from repository root:

```powershell
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_MODELS=Join-Path (Get-Location) 'services/runtime/ollama-models'
$env:OLLAMA_NO_CLOUD='1'
$env:OLLAMA_MAX_LOADED_MODELS='1'
$env:OLLAMA_NUM_PARALLEL='1'
& services/runtime/ollama/ollama.exe serve
```

Do not start a second copy if the port is already in use. Keep this terminal open.

4. Worker terminal, starting from repository root:

```powershell
Set-Location services/ai
& .venv/Scripts/python.exe -m app.run
```

5. Gateway terminal, starting from root:

```powershell
npm.cmd run build --prefix services/api
Set-Location services/api
$env:API_HOST='192.168.1.49'
npm.cmd start
```

Only the gateway binds the Wi-Fi address. If Windows Firewall blocks it, allow Node's gateway port 3000 on the **private network only**. Do not open ports 8000/11434, public-profile access or router forwarding. Firewall changes were not made automatically.

6. Root `.env` may contain `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.49:3000`; `.env.example` is the template. No tokens belong there. Restart Expo after changing environment variables. For a later production build set the same URL variable to the exact HTTPS origin of the reviewed gateway; release code accepts that configured HTTPS origin only, and never an editable arbitrary host. Standalone iOS/Android build network policies and certificate trust need their own device tests; Expo Go results do not certify them.
7. Run `npm.cmd start` from root if Expo is not already running. Open/scan its QR in a compatible Expo Go client and reload the app. Do not clear app data. Native recording is unavailable on web; test on Android/iOS.
8. Tap **Open Local AI speaking tutor**. Enter the backend origin if it is blank. Open `services/api/.env` locally and copy **CLIENT_ACCESS_TOKEN** into **Device access token**. Never use AI_SERVICE_TOKEN or METRICS_TOKEN. Treat the development credential as private; do not send it in a test report. Tap **Connect**. The installed voice list should appear. Production uses an identity-provider JWT; login/token issuance is not part of B5.
9. Choose native Hindi or English, target English, female voice, and **Correct each turn**. Tap Record, grant microphone permission, say **“Yesterday I go to the market”**, Stop, then **Send recording**. Do not use the old mock sample microphone. Allow CPU inference time; each HTTP stage has a 130-second mobile deadline, not a 130-second whole-pipeline promise.
10. Verify the displayed recognition resembles your actual speech, Qwen returns a corrected full sentence and native-language explanation, and a natural tutor response is **audible**. Check media volume and audio routing. The reply and correction are model-generated, so evaluate meaning rather than requiring a fixed response string. Record the time taken and any exact error text.
11. Tap **Replay tutor / retry speech**. Try an available alternate female voice, then switch persona to male, start another recording and confirm an audible male response. Changing persona starts a separate session and retains earlier history.
12. Choose **Correct at the end**, make another turn, and confirm correction fields are hidden. Tap **End & review corrections** and confirm they appear. Open **Local AI history**, reopen the session, reload Expo Go and verify transcripts, feedback and preferences are still there. Switch to mock mode and confirm earlier Phase A history/samples still work.
13. Test denial/cancellation: deny permission when prompted (or revoke it in phone settings), retry after granting access, start then cancel a recording, and cancel an AI request. No stale reply should be attached to a new language/conversation. Reconnecting after an expired/invalid device token should show a clear error.
14. Test network failure by briefly disconnecting phone Wi-Fi for a request. Reconnect, then retry. A failed save must not duplicate a turn. If only speech fails, retry speech and verify no extra text turn appears. Backgrounding stops recording/audio and cancels active HTTP requests; a previously committed turn remains saved.
15. Try Hindi and Spanish text/recordings, and optionally code-switching. Report what was actually recognized; do not assume accuracy from model language lists. On this PC no Hindi/Spanish TTS voices are installed, so those targets must show a clear unavailable-voice message while retaining text feedback. Do not download voices to bypass this acceptance result without approval.

Report: phone model/Android version, permission result, recognition text, whether the tutor reply was audible for each tested voice, correction timing, restart/history result and exact errors. An iPhone test is a separate pending acceptance item; Windows cannot run an iOS simulator.

## Verification and known limits

Automated checks use a synthetic English WAV and real local models through temporary authenticated NestJS/FastAPI processes. The shared mobile HTTP adapter and tutor/speech state machines are exercised; generated bytes are checked and saved/reopened with SQLite. The automated playback device port is stubbed, so it proves a valid WAV reached playback orchestration, **not that a phone speaker played it**. The test rewrites a valid development origin to temporary loopback listeners; it does not prove Wi-Fi/firewall/device transport. The separate authenticated private-LAN readiness probe passed from the PC.

Simple Qwen Hindi and Spanish structured text probes passed, including Devanagari Hindi output. This is not a CEFR/grammar accuracy benchmark. English synthetic recognition and Windows English David/Hazel/Zira voice discovery were verified; Hindi/Spanish/mixed speech recognition remains unverified. No matching Hindi or Spanish voice was discovered. English male and female tutor-response WAV synthesis passed. Piper/Linux, production HTTPS/JWT with a real identity provider and actual Android/iOS speaker behavior remain outside automated acceptance.

Reproduce from root:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test --prefix services/api
npm.cmd run typecheck --prefix services/api
& services/ai/.venv/Scripts/python.exe scripts/test-local-services.py --live --mobile-client
npx.cmd expo export --platform android --platform ios
```

Worker suite, from `services/ai`: `.venv/Scripts/python.exe -m unittest discover -s test -v`.

Tests record initial failures as well as final outcomes in [LOCAL_AI_TEST_RESULTS.md](LOCAL_AI_TEST_RESULTS.md). Production preparation remains in [LOCAL_AI_DEPLOYMENT.md](LOCAL_AI_DEPLOYMENT.md); no deploy command has been run.
