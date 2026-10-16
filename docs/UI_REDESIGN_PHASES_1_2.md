# UI redesign — Phases 1 and 2

Implemented on 2026-10-15 within the owner's approved scope: design foundations and the tutor-first redesign. Phase 3 navigation expansion, onboarding, dashboards, lessons, gamification and streaming were not implemented.

## What changed

- Shared semantic light/dark palettes, spacing, radii and system-font typography live in `src/ui/tokens.ts`. Existing global theme exports and the mock palette use these same colors.
- `src/ui/studio.tsx` provides reusable text, cards, buttons, labeled inputs, status badges, activity indicators and modal panels. Controls have at least 48-unit touch areas, text can wrap/scale, and activity animation respects reduced motion. The activity bars indicate real recording/playback state; they are not amplitude measurements or a streaming waveform.
- Speak now opens Local AI mode first. Mock mode remains available in **Settings → Switch to mock mode**, with its original history, samples, simulated failures and microphone lab.
- The live tutor has a compact header, language/preferences button and virtualized conversation list. The existing History view remains inside Speak; no new route or tab was added.
- Recording and playback controls sit outside the scrolling transcript in a fixed bottom dock. Record → Stop → Send recording remains unchanged. Replay, discard, cancellation and permanently denied permission recovery remain available.
- Connection URL/token inputs moved to **Settings**. Language, persona and correction timing moved to the language-pair preferences panel. Text composition uses a separate panel so the keyboard does not crowd the microphone dock.
- Tutor replies have contextual listening controls. Corrections use a distinct corrected-sentence card, native-language explanation toggle and categorized original/corrected notes. End-mode feedback stays hidden until End & review.
- Loading, recording, transcription, synthesis, playback, unavailable-voice and error states have distinct text/actions. Retrying speech uses the existing speech path without creating another Qwen turn. History-load failures show an error rather than an indefinite loading label.

Audio hooks/controllers remain mounted outside virtualized rows. Scrolling, expanding a correction or opening/closing settings does not recreate the recorder/player. Deliberate session/reconnection changes clean up the previous audio context. Replay can be requested for an earlier reply, including a completed conversation, without automatically speaking a session merely because it was opened.

## Preserved boundaries

No backend files, API contracts, model assets, Expo/native configuration, dependency versions, repository SQL or schema migrations were changed in this redesign. Mobile schema remains version 2. No learner records were rewritten or removed. Preferences and history still use the existing repository/controller. Runtime credentials remain in memory, and unsupported languages/genders are never silently replaced with another voice.

The existing Android B5 core voice flow was previously owner-confirmed. That confirmation is historical evidence, not a test of this redesigned UI. New native layout, focus, audio and accessibility acceptance remains pending.

## Checks actually run

| Check | Result |
| --- | --- |
| Mobile/domain/SQLite/audio/client/presentation suite | 53 passed, 0 failed |
| Lint | Passed |
| TypeScript | Passed |
| Android and iOS local Hermes/JavaScript export | Passed; not a native install or physical-device test |
| Real local NestJS → FastAPI → Whisper → Qwen → TTS integration through shared mobile controllers | Passed with the existing approved models and synthetic English recording |
| Real transcript/feedback SQLite close/reopen, mock/live isolation | Passed in the integration harness |
| Hindi/Spanish structured Qwen text probes | Passed; recognition quality and speech availability are separate |
| Physical Android redesigned UI / audible playback | Pending |
| Physical iOS | Pending |

The eight added tests cover both-theme text/action/error/correction contrast, control boundary contrast, action availability during recording/upload/permission transitions, actual rendered correction visibility in immediate/end modes, and accessible disabled/busy buttons. Render tests use React Native Web's server renderer and stub safe-area layout. The model test stubs the native playback port. Neither test method proves a phone speaker played audio or that a dock fits every device.

A new busy-button render test initially failed because the web renderer did not expose the native accessibility busy state as `aria-busy`. The shared button now explicitly supplies the cross-platform busy property, and the test passes. No failed check is omitted from the final status.

## Launch on your Android phone

Keep existing services running for real AI. If Expo is already running, reload its project in Expo Go; do not start a duplicate server. Otherwise:

```powershell
Set-Location 'D:\WF\LanguageLearningApp\language-learning-app'
npm.cmd start -- --lan
```

Open the displayed QR code in your existing SDK-compatible Android Expo Go client, on the same private Wi-Fi as the PC. No new native dependency was added, so this change does not itself require a development build. Do not clear Expo Go's app data: it contains local learning history.

The main screen now opens Local AI directly. Tap **Settings**, enter the gateway address and the `CLIENT_ACCESS_TOKEN` from `services/api/.env`, then **Connect**. The token must not be the internal AI or monitoring credential. The URL is prefilled from root `.env` when configured:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.49:3000
```

Use your current Wi-Fi IPv4 address from `ipconfig`, not a virtual Ethernet adapter address. Restart Expo after editing `.env`. Only the NestJS gateway binds the private LAN address; keep FastAPI/Ollama on loopback. A public/mobile environment variable must never contain a secret.

If the existing backend processes have stopped, start them in separate PowerShell terminals:

```powershell
# Ollama — repository root; existing approved models only
Set-Location 'D:\WF\LanguageLearningApp\language-learning-app'
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_MODELS=Join-Path (Get-Location) 'services/runtime/ollama-models'
$env:OLLAMA_NO_CLOUD='1'
$env:OLLAMA_MAX_LOADED_MODELS='1'
$env:OLLAMA_NUM_PARALLEL='1'
& .\services\runtime\ollama\ollama.exe serve
```

```powershell
# FastAPI
Set-Location 'D:\WF\LanguageLearningApp\language-learning-app\services\ai'
& .\.venv\Scripts\python.exe -m app.run
```

```powershell
# NestJS — substitute your current private Wi-Fi IP
Set-Location 'D:\WF\LanguageLearningApp\language-learning-app\services\api'
npm.cmd run build
$env:API_HOST='192.168.1.49'
npm.cmd start
```

Do not run model pulls or deploy commands. If Windows Firewall requires configuration, permit gateway port 3000 only on the private network; do not expose FastAPI/Ollama or add router forwarding.

## Required Android acceptance

1. **Layout:** check light and dark system themes, a small screen and large system font sizes. Scroll a long conversation; microphone controls must remain accessible above the native tab bar. Check the Type panel with the keyboard and Android Back closing all panels.
2. **Connection:** connect/reconnect via Settings; verify token masking and clear invalid-token/network errors. Close/open settings without unintentionally restarting an idle recorder or losing the conversation.
3. **Record:** grant/deny permission, confirm timer, Stop, Replay my voice, Discard and Send recording. Cancel during permission/upload; ensure no late turn appears in a changed context.
4. **Tutor:** verify actual transcription, corrected sentence, native explanation and audible English tutor speech. Stop playback and record again. Replay both the latest and an earlier/completed reply; confirm no duplicate history turn is created.
5. **Voices:** use the available English male/female voices; open Voices and replay after selection. Hindi/Spanish have no installed voice on this PC and must show unavailable speech while preserving saved text.
6. **Corrections:** test After each turn and At the end. Open Why this works, then verify all feedback is hidden before end-mode review and visible afterwards.
7. **Persistence/mock:** reopen previous Local AI history, reload the app, and check unchanged preferences/transcripts. Switch to mock mode and verify existing Phase A history and samples.
8. **Recovery/accessibility:** interrupt Wi-Fi and retry the appropriate step; background the app while recording/speaking; test TalkBack labels, focus, touch targets and reduced motion. Native iOS safe-area/keyboard/audio behavior needs a separate device check.

No additional language voice support, model-quality claim, account system or production readiness is implied by the redesign. Stop here for owner review before any Phase 3 work.


## Playful Speak refresh and voice-latency audit — 2026-10-15

The owner requested a Duolingo-inspired appearance. The current Speak UI now uses original green light/dark palettes, rounded raised buttons/cards, an original locally drawn speech-bubble character, friendlier typography/copy and a prominent microphone with the existing Record → Stop → Send flow. No copied branding/assets, fabricated streaks, XP or achievements were added. Mock history, native audio adapters, backend contracts, dependencies, schema and models remain unchanged.

Changed implementation files: src/ui/tokens.ts, src/ui/studio.tsx, src/features/tutor/live-tutor-screen.tsx, src/features/tutor/conversation-exchange.tsx, src/features/tutor/audio/local-audio-panel.tsx. Added practice-buddy.tsx and processing-status.tsx under src/features/tutor. The existing contrast test also checks the new action foreground/background pair.

Waiting feedback now shows the real recognition/reply/speech stage with elapsed seconds per stage, never a guessed completion percentage. The recognized sentence is displayed while the tutor reply is pending. The timer only runs during processing. Native recorder/player ownership and persistence remain in their existing controllers; no pipeline/model speed improvement is claimed.

A single synthetic English recording through the running LAN gateway measured 16.055 seconds for recognition, 4.982 seconds for the reply and 1.176 seconds for speech generation (22.213 seconds total server-request time). All returned HTTP 201. This is a sample, not a phone/network benchmark or latency guarantee. No personal recording/history was used. Recognition was the largest measured cost; changing Whisper decoding/runtime/model settings remains a separately reviewed backend optimization.

Checks: 53 existing mobile tests passed; mobile TypeScript passed; Expo lint passed; Android and iOS Hermes/JavaScript exports passed to .expo/green-ui-export. Lint initially rejected a synchronous timer reset inside an effect; the timer now remounts for a stage change and final lint passed. These checks do not prove native microphone icon rendering, small-screen/large-text dock fit, TalkBack, iOS audio or audible Android playback. Reload the app in Expo Go and recheck those on devices; do not clear app data.

The owner subsequently requested registration (name/phone/native language/target language), local login, assessment, automatic three-stage placement and matching course modules. The proposed journey, schema changes and delivery boundaries are in NEXT_LEARNING_SLICE.md. They have not been implemented. The proposed migration must be reviewed before applying it, consistent with AGENTS.md. Current language validation still supports en/hi/es; course availability is not implied by a language selector.

Light/dark server-rendered component previews also completed with stubbed services/audio. Visual browser inspection was blocked because this session exposes no browser or native UI surfaces. No screenshot, physical layout check or phone playback is claimed. The temporary preview server was stopped after rendering.
