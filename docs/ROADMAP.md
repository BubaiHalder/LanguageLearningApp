# Implementation roadmap

Priority update, 2026-10-16: the owner prioritizes natural multilingual AI speaking, with encrypted server-synced course downloads for offline learning and optional phone-only AI subject to feasibility. [Research, current capability matrix and reviewed-slice proposal](AI_SPEAKING_OFFLINE_PLAN.md) distinguish these requirements from the current implementation. No encryption, sync, streaming, native build, model download or deployment has been implemented by this planning update.

B5 update, 2026-10-15: [B5 integration](PHASE_B5.md) passed automated real-service checks, and the owner confirmed the core recording-to-audible-response flow on Android. Restart/history, correction-mode and recovery checks are not separately confirmed; iOS remains untested. Full checklist sign-off and approval for streaming/Phase C remain outstanding. Earlier lesson-first and Phase A notes below are historical proposals.

Priority update, 2026-10-15: [Voice Tutor Phase A](VOICE_TUTOR.md) is the approved first feature, ahead of the lesson-first roadmap below. Phase A covers UI, SQLite and simulated voice states. Phase B adds real recording and secure NestJS provider adapters; Phase C adds streaming. Neither later phase is implemented or deployed.

Status: proposed for review, 2026-10-15. Dependencies and exit criteria, rather than calendar promises, govern the sequence. See [architecture](ARCHITECTURE.md) and [database design](DATABASE_DESIGN.md).

## First MVP

Deliver one complete offline learning loop: choose native and target languages, take or skip a short placement check, follow a curated beginner path, complete lessons and quizzes, and return to saved progress after restart. Switching targets and switching back must restore the correct history. Native-language changes must preserve that history.

Proposed content budget: one reviewed language pair for the first vertical slice, then a second target pack before MVP acceptance to prove target isolation. Each target pack contains a small A1 path of roughly 5-10 lessons with vocabulary, grammar, short readings, and quizzes. The exact languages, explanation translations, and content author/reviewer must be selected before producing content. Additional target choices remain unavailable until their pack is reviewed.

A labeled scripted bilingual tutor demonstrates a practice flow. Optional device speech is a later enhancement to this MVP if it passes voice-availability testing; it is not a requirement for the core learning loop. No paid AI calls, cloud account, or server database is needed.

### Included

- One local learner, configurable interface/native language and active target.
- Provisional assessment result, beginner fallback, versioned scoring, retake history.
- Deterministic path selection with curated lessons and explanations.
- Quiz feedback, resumable lesson drafts, immutable completed attempts, per-target progress.
- Basic scripted text practice, explicit offline/mock labeling.
- Local reset with confirmation and clear device-only storage disclosure.
- Loading/error/retry states, accessible layouts, and Android/iOS validation.

### Deferred

- General AI conversation, automatic free-text correction, streaming or real-time voice.
- Male/female AI voice guarantees, speech recognition, pronunciation scores.
- Full A1-C2 curriculum, stories library, videos, live news, assigned homework workflows.
- Login, cloud backup/sync, SQL Server/PostgreSQL, subscriptions, analytics vendors.
- Individual/group learner chat, calls, matching, moderation infrastructure.

## Delivery sequence

| Stage | Work | Exit criteria |
| --- | --- | --- |
| 0: review and baseline | Review these documents; choose first languages and content ownership; establish emulator/device baseline; configure ESLint as a separate scoped change | Existing starter launches on Android/iOS; lint and typecheck executable; architecture decisions recorded |
| 1: storage foundation | Install SDK-compatible `expo-sqlite`; connection bootstrap, migration runner, repositories, validated content seed; startup failure UI | Fresh install and upgrade tested; failed migration preserves data; seeding is repeatable; web behavior is explicit |
| 2: onboarding and language profiles | Selection, settings, active profile; retain existing theme/navigation patterns | Language choices persist after restart; unsupported pairs blocked; A-to-B-to-A switch preserves A; native-language switch does not reset progress |
| 3: assessment and path | Curated question set, skip/retake, versioned scoring and A1 path rules | Deterministic scores; incomplete assessments resume; higher placement does not expose missing content; retakes retain history |
| 4: learning loop | Lesson player, quiz, feedback, draft resume, progress view; second target pack | Atomic completion survives interruption; duplicate submit counts once; progress isolated by target; content updates retain attempt history |
| 5: practice and hardening | Scripted tutor; optional device speech evaluation; local data reset; accessible/device regression | Tutor is clearly scripted; offline core works; denied/unavailable speech falls back to text; reset is deliberate; Android/iOS acceptance complete |

Implement one stage at a time after review, with small reviewable changes. Do not create all future folders, interfaces, screens, or database tables in stage 1.

## MVP acceptance scenario

1. Fresh install without network: select a supported pair, skip placement, open an A1 lesson.
2. Partially answer a quiz, background/terminate the app, reopen, and resume the draft.
3. Complete it; double tap submission/retry and verify exactly one finalized attempt and one consistent progress update.
4. Change native language; confirm completed work remains and available explanations update.
5. Switch target A to B, complete work, then return to A. Both histories and recommendations remain separate.
6. Retake placement; retain previous evidence and completions. Change a content version; old results remain interpretable.
7. Use scripted practice offline. No AI credentials, payment, or microphone permission is required.
8. Exercise startup failure, unavailable content, large text, screen reader, RTL, keyboard, back navigation, and dark mode on Android and iOS.
9. Upgrade a populated database and interrupt a migration in a test fixture. Confirm retry/recovery without silent deletion.
10. Confirm local reset deletes learner data without corrupting the bundled content catalog; cancel does nothing.

## Validation and release gates

Run lint and TypeScript checks for every change. Add meaningful tests for scoring, language isolation, migration ordering/rollback, idempotent seed/submit, and progress calculations when those implementations exist. Use native SQLite integration checks and actual Android/iOS behavior checks; mocked repositories alone cannot prove persistence. Choose test tools during stage 0 rather than installing them in this planning change.

Record baseline failures honestly. Currently TypeScript can be run, while the starter lacks ESLint configuration and declared lint dependencies; do not treat that as a passing lint result. Keep setup of lint separate from documentation work.

Before external distribution, review content licensing, privacy/data handling, application identifiers/signing, environment configuration, crash behavior, release builds, and store requirements. Use EAS for build/distribution when authorized; account setup, service tiers/costs, builds, and publication are not part of this task. Existing Expo configuration remains intact pending a specific release change.

## Later milestones

1. **Voice exploration:** device speech capability matrix; recording and transcription spike; permissions, retention, interruptions, accessibility. Gate on measured quality and an agreed offline/online policy.
2. **Real AI tutor:** compare providers, latency, correction quality, costs, data handling, and bilingual evaluations. Add a backend gateway, authentication/abuse limits, cancellation/timeouts, usage budget, and honest degraded states before enabling calls. No provider purchase by default.
3. **Richer curriculum:** reviewed CEFR expansion, listening assets, stories, video and licensed news; explicit download/cache budgets. Add assignments after a useful learner workflow exists.
4. **Accounts and sync:** choose backend and database based on requirements; export/account linking, migrations, idempotency, conflicts, deletion propagation, recovery and backup testing before multi-device claims.
5. **Learner community:** individual text messaging before groups/calls; server authorization, consent, reporting/blocking, moderation and abuse handling are launch prerequisites.

## Decisions to settle before implementation

- Initial native/target languages and translated explanation coverage.
- Who authors and reviews curriculum, assessment items, and CEFR alignment.
- Intended age audience and initial distribution/test devices.
- Whether optional device speech belongs in MVP or the next iteration.
- Data export/backup expectations for the first public release.

These decisions do not block the documentation deliverables. No real AI capability, certified proficiency, or release readiness is implied by completing this plan.
