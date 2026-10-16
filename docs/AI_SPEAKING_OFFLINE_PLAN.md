# Natural multilingual tutor and encrypted offline learning

Date: 2026-10-16. Status: researched design for owner review; implementation is not authorized by this document. No model was downloaded, access conditions accepted, account created, database migrated, service replaced or infrastructure deployed. Existing schema-2 tutor history, credentials and B5 voice flow are preserved.

## Updated product priority

The AI speaking tutor is the main differentiator. Prioritize responsiveness, natural turn-taking, intelligible speech and trustworthy multilingual corrections before expanding gamification or course screens. Registration, native/target preferences, provisional placement up to the proposed CEFR scale and courses remain in NEXT_LEARNING_SLICE.md; they are not implemented by this update.

Separate three capabilities: offline downloaded learning, server-connected conversation, and fully on-device AI conversation. A language appearing in a catalog is not evidence that all three work for it.

## Connection and offline modes

| Mode | Proposed user experience | Current reality |
| --- | --- | --- |
| Downloaded lessons | Read lessons, play downloaded lesson audio and complete available quizzes without a network; retain progress locally | Course player/download/sync/encryption not implemented |
| Public-network AI | Phone connects over HTTPS to an authenticated self-hosted gateway; speech/AI run on the server | Existing gateway is local development; public hosting, HTTPS and account issuance not deployed |
| Private-LAN AI | Phone and PC communicate on trusted Wi-Fi; models run on PC with no public internet needed after setup | Existing architecture supports this; requires reachable running PC/services |
| Fully on-device AI | Recognition, conversation and speech all run on the phone after explicit model downloads | Not implemented; feasibility depends on phone, language, model size, battery/heat and measured latency |
| Limited offline practice | Downloaded dialogues, lesson recordings and possibly installed offline device voices | Must be labeled as guided practice, not represented as a live generative AI tutor |

No network means the online tutor shows a clear unavailable state and keeps downloaded learning accessible. Do not silently substitute a different language, voice, scripted answer or remote provider. User chooses any permitted online/offline fallback. Do not queue personal audio for later upload without explicit initiation/consent.

## Current source and measured starting point

Source inspected: services/ai/app/engines.py uses faster-whisper with local model files, CPU/int8 defaults, auto language detection, VAD filtering and beam size 3. Ollama conversation uses qwen3:1.7b and a complete structured response with stream=false. SAPI produces a complete WAV. The mobile client waits for transcription, then the tutor result/save, then speech generation. Streaming and full-duplex conversation are not implemented.

The previous dated synthetic LAN test measured recognition 16.055s, tutor reply 4.982s and speech generation 1.176s. This was one sample, not a current phone benchmark or SLA. The green UI now exposes actual processing stages/elapsed time; it did not speed up inference. Re-measure on agreed audio, hardware and network before optimization claims.

## Natural speaking acceptance criteria

- Begin a user-initiated speaking session; request the microphone only for that feature. A visible listening state, manual Stop and manual recording fallback remain available. No always-on background microphone.
- Understand a complete thought and reasonable pauses, rather than forcing unnatural word-by-word input. Tune end-of-turn detection against real accents and noise before enabling automatic sending.
- Respond briefly in the selected target language, ask relevant follow-up questions and retain bounded conversation context. Explain corrections in the selected native language, independently of interface locale.
- Respect immediate versus end-of-conversation correction timing. Separate friendly spoken dialogue from optional detailed explanations; do not make every spoken turn a long grammar lecture.
- Support explicit input-language hints and evaluated code-switching. A detected language must not silently replace the learner's target or explanation language. Handle script variants and RTL as separate tested requirements.
- Stop playback on user interruption, invalidate old request/audio results and prevent the microphone from repeatedly transcribing the tutor's own output. Preserve current cancellation, permission-denial, backgrounding and retry protections.
- Keep text/corrections usable if speech fails. Retrying TTS must not regenerate the conversation or duplicate a saved turn. No pronunciation score inferred from recognition confidence.
- Measure time from end of learner speech to first audible tutor audio, total completion time, recognition errors, correction quality and native-speaker ratings per language. Include cold/warm runs, quiet/noisy speech and weak connections. Never quote a vendor's hardware-dependent latency as our measured result.

## Proposed AI work, in small reviewed slices

1. **Baseline with existing approved assets:** benchmark recognition, reply and speech separately using reusable synthetic/consented samples. Compare decoding/thread/clip-length settings in a disposable experiment; preserve the shipped default until reviewed quality/latency evidence supports a change. No new model needed for this step.
2. **First multilingual pair:** validate English and Hindi unless the owner selects another pair. Hindi text smoke tests exist, but no Hindi voice is installed and representative Hindi recognition/grammar evaluation is missing. Add a language only after its individual capability tests pass.
3. **Voice candidate evaluation:** review exact model revision, code/dependency/voice licenses, source access conditions, RAM/VRAM, inference time and naturalness before approval/download. Keep experiments isolated from the working Python environment and production contracts.
4. **Conversational delivery:** after owner review, design an opt-in versioned streaming transport and event/cancellation contract while retaining current /v1 fallback. Generate/play complete, validated speech segments progressively only if the selected engine supports it. The existing full-JSON feedback parser cannot be made streaming simply by toggling one flag; corrections/persistence must remain consistent.
5. **Phone-only spike:** after the target phone is known, test one language with a native runtime in a development build. Prove microphone-to-local-transcript, local conversation and local speech separately, then combine them. Publish supported-device/language limits; retain online mode for unsupported devices.

Conversational latency and pronunciation must be evaluated by native speakers. Natural-sounding TTS alone does not establish correct teaching, broad multilingual dialogue or pronunciation evaluation.

## Candidate research — primary sources checked 2026-10-16

These are candidates, not installed or approved models. No single candidate supplies all six language capabilities.

| Component | Candidate and published scope | Review needed |
| --- | --- | --- |
| Recognition baseline | Existing Whisper Small | Preserve; benchmark Indian speech and mixed speech locally |
| Indian recognition | [AI4Bharat IndicConformer 600M](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual): lists all 22 scheduled languages and MIT metadata | Per-language corpus, decoding, runtime compatibility and resources; source code is loaded remotely in its example and needs inspection/pinning |
| Newer recognition | [Bodhan Indic-Transcribe-core](https://huggingface.co/bodhan-ai/indic-transcribe-core): publisher reports 25 languages, code-mixing, 1.2B parameters and 4.6GB checkpoint | Custom Indic Open Model License and upstream terms need full review for this hosted-app use; no blanket commercial-hosting approval inferred. Model card flags uneven automatic language identification. Larger server candidate, not assumed mobile-ready |
| Conversation/corrections | Existing Qwen3 1.7B | Test selected language, native explanations and conversation quality; no evidence yet for all 22 languages |
| Windows speech baseline | Installed English SAPI voices | Development-only and not portable phone/Linux voice assets |
| Indian speech | [AI4Bharat IndicF5](https://huggingface.co/ai4bharat/IndicF5): MIT metadata; eleven listed Indian languages | Reference recording/transcript and speaker permission required; review complete artifact/code/voice terms and benchmark compute. A 0.4B-parameter model is not a proven mobile solution |
| Newer speech | [Bodhan Indic-Speak](https://huggingface.co/bodhan-ai/indic-speak): English plus 22 Indian languages, split into 13 publisher-production languages and 10 preview languages | Custom license and upstream components, voice availability, actual language quality and compute. Technical section lists 3.78B speech-LM parameters plus decoder; do not assume desktop CPU or phone latency. No cloning; fixed artist voice library |
| Translation | [IndicTrans2 project](https://github.com/AI4Bharat/IndicTrans2): English/Indic and Indic/Indic model families with MIT checkpoints | Separate language/script pre/postprocessing and pair-specific evaluation; not a conversational or speech model |
| On-device runtimes | [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/index.html) for speech and [llama.cpp](https://github.com/ggml-org/llama.cpp) for conversation research | Native integration, compatible model format/license and measured phone resources. Runtime platform support does not prove a selected model or language works in Expo |

The current IndicConformer card points to Indic-Transcribe, and IndicF5 points to Indic-Speak. Those referrals prompted inspection; they do not establish that the newer models are a better fit for this app. Their custom licensing, preview coverage and size may outweigh published benefits. Do not accept gated-access terms or transmit owner contact details automatically.

IndicF5's eleven listed languages are Assamese, Bengali, Gujarati, Hindi, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil and Telugu. Indic-Speak's publisher lists English and those eleven plus Urdu in its production tier; the other ten scheduled languages are preview. These are publisher labels, not our verified release status. No sub-second response promise is adopted from its model card.

Free/self-hosted weights still require electricity, storage, RAM, possible GPU purchase/rental, maintenance and server bandwidth. Hosting budget and concurrency follow measurements; no paid service or server deployment is authorized. The current PC is documented as CPU/int8 with integrated Intel graphics, so NVIDIA-only performance claims do not apply to it.

## Current per-language capability matrix

**V** = verified infrastructure/sample behavior, not linguistic certification. **E** = implemented experimental adapter/text probe; representative quality unverified. **U** = unavailable in the current app. This table describes the existing app, not candidate publishers. Translation, phonetic/pronunciation scoring and on-device generative conversation are unavailable for every row. en recognition V is synthetic English evidence; English TTS V is WAV generation plus historical owner-reported Android flow, not a new phone test. hi/es conversation and grammar E include earlier structured text probes.

| Language | Code | Translation | Recognition | Speech | Conversation | Grammar | Pronunciation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| English | en | U | V | V | E | E | U |
| Hindi | hi | U | E | U | E | E | U |
| Spanish | es | U | E | U | E | E | U |
| Assamese | as | U | U | U | U | U | U |
| Bengali | bn | U | U | U | U | U | U |
| Bodo | brx | U | U | U | U | U | U |
| Dogri | doi | U | U | U | U | U | U |
| Gujarati | gu | U | U | U | U | U | U |
| Kannada | kn | U | U | U | U | U | U |
| Kashmiri | ks | U | U | U | U | U | U |
| Konkani | kok | U | U | U | U | U | U |
| Maithili | mai | U | U | U | U | U | U |
| Malayalam | ml | U | U | U | U | U | U |
| Manipuri/Meitei | mni | U | U | U | U | U | U |
| Marathi | mr | U | U | U | U | U | U |
| Nepali | ne | U | U | U | U | U | U |
| Odia | or | U | U | U | U | U | U |
| Punjabi | pa | U | U | U | U | U | U |
| Sanskrit | sa | U | U | U | U | U | U |
| Santali | sat | U | U | U | U | U | U |
| Sindhi | sd | U | U | U | U | U | U |
| Tamil | ta | U | U | U | U | U | U |
| Telugu | te | U | U | U | U | U | U |
| Urdu | ur | U | U | U | U | U | U |

Keep a future extensible catalog of language, autonym, script/direction, model-specific codes and separate capability/provider/version/evidence records. Do not enable new language selections against today's en/hi/es SQL/backend constraints without a reviewed migration and contract update. Script variants such as Kashmiri/Sindhi and Meitei require explicit content/font tests rather than guessing one script from a base code.

## Encrypted course downloads — proposed architecture

Server course publishing and learner progress sync are separate responsibilities. Course distribution can begin with reviewed read-only packs; account-linked progress upload is a later authenticated feature.

Proposed download flow: user selects course/language/version → authenticated HTTPS manifest → size/disk-space confirmation → resumable download into encrypted staging → validate manifest signature, schema and asset hashes → install a verified version atomically → mark ready in local metadata → open offline. Preserve the prior working version until the replacement is complete. Resuming must revalidate version/ETag rather than splice different content revisions together.

- Use a dedicated encrypted course store for structured lesson content, with authenticated encrypted files for downloaded media. Prefer vetted native cryptography rather than JavaScript password obfuscation. A proposed SQLCipher course database does not encrypt audio/video files by itself.
- Store per-install encryption keys in platform-protected key storage; never derive a key from name/phone, hardcode one in the app or put it in SQLite/public env variables. Use separate keys/rotation identifiers for content and future sensitive learner data as appropriate. Expose only minimal non-sensitive download metadata if any index remains unencrypted.
- Decrypt content only for display/playback. Avoid durable plaintext staging; when a media API needs a temporary plaintext file, document the access/retention boundary and delete it on completion/interruption. Encryption cannot prevent an authorized user from capturing rendered content.
- Use a recoverable installation journal around filesystem/SQLite commits; these are not one shared atomic transaction. Restart reconciles pending installs, verified assets and readiness flags without deleting working packs/history. Corrupt packs show repair/redownload options; missing keys show recovery options without silently generating a new key and destroying access.
- Keep the current tutor database intact. Encrypting or replacing its existing records is a separately reviewed migration/export/verification task, not an automatic consequence of encrypting new course downloads. Preserve historical content versions referenced by attempts.
- Provide download size, pause/resume/cancel, update availability and explicit remove-download controls. Removing material must not delete learning evidence. Do not promise automatic background completion across Android/iOS restrictions.
- After authenticated sync is approved, store immutable completed attempts in a bounded local outbox with stable IDs, target profile and content/scoring version. Retried upload is idempotent; server acknowledgement marks delivery. Progress can be rebuilt from attempts. Keep account merge/conflict/deletion policies explicit; a phone number/local name alone does not authenticate server data access.

[Expo SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#sqlcipher) supports SQLCipher through native configuration, but not in Expo Go. Choosing this design requires a development/production build, reviewed native configuration and safe storage migration. No native directories/configuration were changed here. A custom app has its own storage sandbox; do not assume it can read existing Expo Go history. Review a deliberate export/import path and validate it before asking the owner to switch clients; keep the original data available until preservation is verified. [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/) uses platform-protected storage for small secrets, not bulk lesson/media files. Its uninstall/backup differences require recovery tests; do not treat device-only keys as a cloud backup.

## Required review and tests before implementation

First approved AI slice should be latency/quality evaluation with existing assets, followed by one reviewed additional-language voice. Keep backend contracts/models unchanged until that review. Streaming and native offline runtimes are separate major changes. Course encryption needs approval of the storage/key/recovery design and custom build before implementation; it does not require starting a cloud deployment today.

Acceptance for encrypted learning: no network after completed download; wrong-key/corruption detection; no permanent plaintext material; interrupted download/install; failed update preserves previous version; low disk; missing/restored key behavior; reinstall/backup behavior on both platforms; target-language isolation; no historical reference loss; sync duplicate/conflict recovery when that feature exists.

Acceptance for speaking: permission grant/denial, microphone/background cleanup, accent/noise corpus, language switching/code-mixing, native-script rendering, first-audio/total latency percentiles, interruption/echo handling, correction accuracy in native language, no stale replies/duplicate saves, TTS retry without repeated LLM turn, offline/online fallback disclosure, and Android/iOS audible playback. No score/proficiency or model-quality claim substitutes for these tests.

Open owner inputs: first languages, actual Android model/RAM, preferred server hardware/budget, account-authentication approach for future sync and acceptable offline footprint. No approval for downloads, paid services, schema changes, custom native build or deployment is inferred from those pending inputs.


## Validation of this planning update

2026-10-16: mobile TypeScript (`tsc --noEmit`) and direct source ESLint (`eslint src --no-cache`, existing Expo ESLint configuration) passed. No new packages or configuration were installed. Expo lint (`expo lint --no-cache`) and full-tree ESLint (`eslint . --no-cache`) also completed successfully. No AI model benchmark, encryption implementation, native build or physical-device test was run in this documentation task. Earlier latency/model results are explicitly historical.


## Specialist review update — 2026-10-16

At the owner's explicit request, software_architect and ai_engineer subagents completed independent read-only reviews. Neither changed code or ran model inference. The architect recommends a separate learning.db for the profile slice, preserving the tutor schema-2 database; the concrete review artifact is in NEXT_LEARNING_SLICE.md.

Correction/refinement: SQLCipher remains an optional store design. [SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/) provides native AES-GCM and is included in Expo Go. With reviewed expo-crypto/expo-secure-store dependencies, bounded course JSON can be encrypted into durable document storage without requiring SQLCipher or a new native build solely for encryption. This does not establish encrypted streaming-media support. The key must not be derived from a phone/name or regenerated over inaccessible existing downloads.

The AI engineer confirmed the current full-transcription/full-JSON/full-WAV serial pipeline and the mobile A1 constant. The root agent added scripts/benchmark-speaking.py as an isolated no-download comparison on the existing synthetic English fixture, not a production decoding change. Multilingual/noisy speech quality and phone behavior still need evidence.


Root experiment result: the existing beam-3 setting had a 5.059s warm median versus 5.478s for beam 1 on two runs each of the synthetic English fixture. No production change is supported. Exact results, tool-result tracking correction, limits and reproduction command are in LOCAL_AI_TEST_RESULTS.md. Root reran 53 mobile tests, lint, TypeScript and benchmark syntax compilation successfully.
