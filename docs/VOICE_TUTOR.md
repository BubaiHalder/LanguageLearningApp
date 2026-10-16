# Voice Tutor: Phase A

Update: [Phase B planning and B1 microphone lab](PHASE_B.md) are now added alongside the unchanged mock workflow. The no-recording/no-playback statements below describe Phase A controls only. B1 has native audio code; device acceptance and all later AI stages remain pending.

The first feature is a mobile tutor prototype using local SQLite and a deterministic mock service. It makes no network requests, uses no AI secrets, records no sound, and plays no audio. Persona selection and microphone/playback controls simulate the future voice workflow. Real STT, AI correction and TTS are Phase B; streaming is Phase C. This document supersedes the earlier lesson-first MVP priority.

## Run

Use Node 24 for the test suite (`node:sqlite` is built in). The app remains Expo SDK 57. The repository uses npm and `package-lock.json`.

```powershell
npm.cmd ci
npm.cmd start
```

Open the app on an Android or iOS device using an SDK-compatible Expo Go client, or use an existing compatible development build. From the dev server, `a` opens a configured Android emulator. The iOS simulator requires macOS; on Windows use a physical iPhone with a compatible client. No backend or account is needed for Phase A. The first tab is **Speak**; Explore remains the starter screen.

For a fresh checkout with locked dependencies, `npm ci` is appropriate; install new app dependencies through `npx expo install` per AGENTS.md. In PowerShell use `npx.cmd` when unsigned script execution is blocked.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npx.cmd expo export --platform all
```

Web intentionally displays a clear native-SQLite notice and disables practice; it does not pretend to persist data. Android/iOS are the prototype targets. Platform exports compile JavaScript/assets, not installable store binaries or a device test.

## Try the prototype

1. Choose a native/explanation language and a target: English, Hindi, or Spanish. Same-language practice is allowed. Choose Maya (female persona) or Alex (male persona). These labels do not select an actual synthesized voice yet.
2. Select **After each turn** or **At the end**. Preferences persist locally. Switching a setting starts a new session on the next turn and preserves earlier history; switching during a request keeps its result in the original session.
3. Tap **Use example**, or **Sample mic → Stop sample mic**. The latter inserts a fixture and never requests OS permissions. Send the sentence to receive the curated response and native-language explanation. Corrections are only supplied for the exact bundled sample; arbitrary text is stored but explicitly marked as not analyzed.
4. Use **Simulate voice playback · no sound** to exercise the playback indicator/stop state. No sound is expected. Backgrounding cancels simulated listening/playback.
5. In end mode, feedback remains hidden until **End & review**. Read it in the conversation or reopen that completed session from History. **New conversation** clears the current view; previous unended sessions remain resumable from History.
6. Enable **Fail the next mock response**, send, and tap Retry. Failure does not erase the draft, and repeated saving of the same client turn ID does not duplicate a turn. The failure toggle is consumed by sending; retry attempts success.
7. Enable **Deny mock permission** to see the permission error. Disable it and retry the sample mic, or type instead. This tests UI behavior only; it does not prove Android/iOS permission handling.
8. Reopen the app to restore preferences and the latest matching in-progress session. History lists 20 sessions per page; transcripts fetch 50 turns at a time and offer earlier turns. Use Delete with confirmation to remove a session and its turns.

Transcripts and corrections are durable; unsent drafts and transient mock listening/playback state are not saved. Data is device-only, plain SQLite, without cloud backup. Uninstalling or losing the device can lose history. No real pronunciation scoring, language detection, or mixed-language recognition is claimed.

## Completed files and architecture

| Files | Responsibility |
| --- | --- |
| `src/app/index.tsx` | Thin Expo Router entry to the tutor screen |
| `src/features/tutor/tutor-screen.tsx` | Mobile layout, selectors, transcript/history, simulated controls, errors and loading |
| `src/features/tutor/types.ts` | Preferences, provider/result contracts, input validation, correction visibility |
| `src/features/tutor/mock-provider.ts` | Offline fixtures, localized explanations, deterministic delay/failure |
| `src/features/tutor/tutor-controller.ts` | UI-independent orchestration, retry IDs, context isolation, session lifecycle |
| `src/data/tutor-repository.ts` | Schema version 1, transactional writes, parameterized queries, history pagination |
| `src/data/open-tutor-repository.ts` | Native asynchronous Expo SQLite adapter and one-time bootstrap |
| `src/data/open-tutor-repository.web.ts` | Explicit unsupported-persistence message for web |
| `tests/tutor.test.cjs`, `scripts/register-typescript.cjs` | Unit and integration tests using Node SQLite, no paid services |
| `eslint.config.js`, `package.json`, `package-lock.json` | Reproducible lint/test/typecheck tooling and SDK-compatible SQLite dependency |

The native adapter enables foreign keys/WAL, runs forward migrations transactionally, and refuses newer schema versions. It never silently resets data. `serialized-driver.ts` serializes all reads and writes on one privately owned connection so other queries cannot enter a pending transaction. The same connection retains its foreign-key pragma; the adapter deliberately avoids the exclusive helper's separate connection. A failed write rolls back and does not poison the queue. A turn stores both sides of the conversation and corrections atomically. Sessions snapshot native/target/persona/correction mode, and preference edits do not rewrite historical sessions. SQLite stores no audio blobs.

Existing assets, SDK versions, route entry, scheme, splash, theme, typed routes, React Compiler, and web output setting are retained. `app.json` adds only the SQLite plugin; no microphone/background permissions are introduced in Phase A. Tab labels now say Speak. A small web theme hydration hook adjustment allows the current Expo lint rules to pass without suppressing them.

## Test boundaries

Automated unit tests cover input/preference validation, fixture/localization behavior, unrecognized mixed text, simulated failures, and correction timing. Integration tests exercise the real repository SQL using Node's SQLite engine, plus the controller/mock service together: close/reopen persistence, idempotent submissions, rollback/recovery, migration failure, future schema protection, session isolation, deletion, retry, pending-response language switches, and pagination.

These are not rendered-component tests, native Expo SQLite tests, Android/iOS UI automation, or device audio tests. The native adapter and layout require the manual device acceptance checks below. No device was used to establish real voice functionality.

Recorded automated results: 22/22 unit/integration tests passed, TypeScript and Expo lint passed, and the SDK compatibility check reported dependencies up to date. Android/iOS/web JavaScript and asset exports succeeded. Physical-device checks remain pending. Package installation reported 29 dependency audit findings; no broad or breaking dependency upgrade was applied as part of this feature.

## Phase B: connect a real provider through NestJS

No NestJS server is installed, implemented, deployed, or running in Phase A. The proposed flow is mobile recording → authenticated NestJS endpoint → STT adapter → correction/dialogue adapter → TTS adapter → mobile playback. The server can initially operate without SQL Server/PostgreSQL; do not put SQL credentials or AI keys on the phone.

1. Choose providers by tested language coverage, mixed-language support, available voices, retention terms, latency and budget. Do not assume a provider supports code switching because it accepts a language hint. Record a capability matrix and disable unsupported combinations. Keep mocks for automated tests.
2. Create a separate NestJS application with validated server-only environment configuration and dependency-injected STT, tutor-analysis and TTS adapters. Proposed server variable names: `STT_PROVIDER`, `STT_API_KEY`, `TUTOR_PROVIDER`, `TUTOR_API_KEY`, `TTS_PROVIDER`, `TTS_API_KEY`. Choose provider/model-specific options there. Fail startup when required secrets are absent. Keep `.env` files out of source control. Mobile receives only a backend base URL and a user session token; an `EXPO_PUBLIC_*` variable may hold a URL but never a secret. See [NestJS configuration](https://docs.nestjs.com/techniques/configuration).
3. Define `POST /v1/tutor/turns` with authenticated multipart audio and validated metadata: client turn ID, conversation ID, native/target tags, persona/voice preference, correction mode, and consented context. Enforce MIME/content checks, byte/duration limits and timeouts. Use bounded temporary storage with cleanup on success/failure; do not log raw audio or transcripts. See [NestJS file upload](https://docs.nestjs.com/techniques/file-upload).
4. Add authentication/authorization and rate/usage limits before enabling paid calls. Deduplicate by authenticated learner and client turn ID to prevent retry billing. In-memory quotas/idempotency are insufficient for multi-instance production; design a shared mechanism before scaling. Return structured validation, unsupported-language, timeout and upstream errors. See [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting).
5. STT returns transcript plus actual detected languages and an explicit mixed-language capability result. Correction adapter returns validated structured data: original/corrected sentence, categories (grammar, vocabulary, sentence construction), short explanation in the requested native language, and natural response in the target language. Treat learner text/provider output as untrusted data. Use curated bilingual evaluations and schema validation; never execute model instructions or fabricate detection/pronunciation scores.
6. TTS maps the requested persona to an available provider voice for the target language, returning the actual voice ID and an honest fallback reason. Return audio bytes or an authenticated short-lived HTTPS URL. The client must allow only expected audio sources, bound downloads, support stop/replay/interruption, and preserve text if audio fails.
7. Add SDK-matched `expo-audio` using `npx expo install`. Configure its plugin with clear iOS `microphonePermission`, Android recording permission, and background recording/playback disabled unless specifically required. Request permission only after a record action, handle permanent denial with an OS-settings path, and stop/release on background/interruption. Test on Android and iOS builds. Follow [SDK 57 Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/); no real recorder exists in Phase A.
8. Replace the mock behind the provider boundary with a backend client; extend result types and create a forward migration for real provider identity/audio metadata. The current schema intentionally constrains provider identity to `mock-v1`; do not bypass that constraint or mix fake and real results. Store transcript/corrections locally and files by URI/retention policy, not audio blobs. Add cancellation, deadlines, retry classification, and per-turn context snapshots before real network use.
9. Test denied/permanently denied permissions, recording duration limits, hardware microphone, Bluetooth/headphones, app interruption/backgrounding, no network, expired auth, upstream failures, unsupported/mixed languages, wrong-language explanations, voice fallback, real audio playback, retries, data deletion, and latency on physical Android and iOS devices. Only then describe real voice as tested.

For local device-to-backend testing, the phone must reach the development server's LAN address (not the phone's `localhost`). Prefer HTTPS; do not weaken release transport settings for convenience. No deployment or account purchase is authorized by this document.

Phase C follows a measured Phase B baseline: streaming transcription/dialogue/TTS, interruption and barge-in, turn ordering, partial transcript handling, reconnect behavior, and latency measurements. It is not implemented now.

## Device acceptance checklist (pending)

- [ ] Android launch, safe areas, keyboard/back, narrow screens, accessibility labels and large text.
- [ ] iOS launch, safe areas, keyboard, VoiceOver, large text and dark mode.
- [ ] Example turn and native-language explanation for each catalog language; actual glyph/font rendering.
- [ ] Language/persona switches during a pending mock request preserve history and route the old result correctly.
- [ ] Immediate/end correction modes, finish/review, new/resume/delete, double-tap prevention.
- [ ] Force-close/reopen and verify SQLite preferences, transcript and corrections.
- [ ] Mock failure/retry, permission-denied simulation, app background during simulated listening/playback.
- [ ] Confirm no OS microphone prompt, audible sound or provider request occurs in Phase A.

Record device model, OS, client/build, outcome, and screenshots before claiming device verification.
