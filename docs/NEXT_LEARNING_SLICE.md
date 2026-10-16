# Three-stage learning and local profile — proposal for owner review

Priority update, 2026-10-16: natural multilingual AI speaking now comes first. [AI speaking and encrypted offline-learning plan](AI_SPEAKING_OFFLINE_PLAN.md) records the new requirements. Profile/placement/course proposals below remain pending; no migration or server-sync implementation is approved by this note.

Status: proposed only. Latest owner clarification about using the highest standard level is pending: see the CEFR alternative at the end before implementing any three-stage scoring rule. No profile screen, account system, placement engine, course module or database migration has been applied by this document. The current working tutor and schema-2 records remain in place.

## Requested experience

1. Register: enter name, phone number, native/explanation language and language to learn.
2. Local login: open the saved profile with “Continue as [name]”; this is device-local access, not verified phone authentication.
3. Assessment: take the short placement check for the chosen target language.
4. Set level automatically: recommend Foundations, Everyday conversations or Confident conversations using saved, versioned assessment evidence.
5. Course modules: open real modules appropriate to the recommended stage. Keep Speak available for practice.
6. Returning login: restore the saved stage and modules; do not force a new assessment on every app launch.
7. Profile: show the saved name in Speak/Profile; allow name, phone and language changes without changing learner identity or losing history.

Native-language changes affect explanations, not the target stage or completed learning. Switching a target restores its own saved stage/course progress; a newly selected target needs its own assessment or explicit beginner fallback. Available assessed courses must be distinguished from the larger future language catalog.

This is a local profile, not verified login. No OTP, SMS, account authentication, phone ownership verification or recovery is implied. The profile survives app restart in SQLite, but uninstall/device loss can remove it. No contact permission, network identity service or paid SMS provider is needed. The device database is not assumed encrypted. Never log name/phone or add them to AI prompts.

## Three learning stages

| Stage | Proposed label | Initial course focus |
| --- | --- | --- |
| 1 | Foundations | Introductions, everyday words, simple sentences |
| 2 | Everyday conversations | Daily routines, questions, past events |
| 3 | Confident conversations | Longer replies, opinions, connected stories |

The recommendation is not certified CEFR proficiency. A text-only assessment estimates the skills it actually tests; it cannot establish listening/speaking proficiency or pronunciation. The existing tutor request uses fixed A1 difficulty today; adapting it would require a separate reviewed backend-contract/UI decision rather than pretending it already follows placement.

Start with one reviewed English-target pack, preserving Hindi and Spanish tutor access. Other targets keep their tutor history and show that a course is not available until reviewed content exists. Do not create empty courses for the full language catalog.

## Assessment design to review before implementation

- Twelve versioned questions: four on foundations, four on everyday language and four on connected language, covering vocabulary, grammar and short reading.
- Deterministic scoring from curated answers; no AI judgment or speech-recognition accuracy used to manufacture a level.
- Provisional starting gates for content review: Stage 3 requires at least 3/4 in every group; Stage 2 requires at least 3/4 foundations and 2/4 everyday; otherwise Stage 1. These are proposed routing rules, not validated proficiency thresholds. Review questions, distractors and gates before shipping.
- Offer a beginner fallback when skipped. An interrupted run resumes; an incomplete run never produces a completed score. Allow retakes and retain each completed result and its scoring version.
- Store results per stable learner and target language. Switching targets never overwrites another target's assessment/progress.
- Route to existing published modules only. An advanced recommendation never opens missing course content. The learner can choose easier material without erasing assessment evidence.

## Proposed delivery slices and storage changes

### A — local profile first (next approval requested)

Screens: a first-run full-screen registration form (name, phone, native/explanation language and target language), a local “Continue as [name]” login step, plus a Profile action in Speak Settings to reopen/edit it. No new tab or router-layout rewrite in this slice. Use the saved name in Speak after persistence succeeds; do not replace it with an in-memory-only form.

Proposed migration 2 → 3: add a local_learner table with id TEXT PRIMARY KEY NOT NULL, singleton INTEGER UNIQUE NOT NULL CHECK(singleton=1), display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80), phone TEXT NOT NULL, created_at INTEGER NOT NULL and updated_at INTEGER NOT NULL. Validate international phone formatting at the repository boundary before writes. Register the learner and save the selected languages through the existing tutor_preferences fields in one transaction; retain existing session language snapshots. Keep interface locale separate from these language choices. Name and phone are editable attributes, never primary keys or proof of identity. Retain all existing tutor tables, rows, IDs, timestamps and preferences unchanged. The repository owns parameterized async SQL; screens contain no SQL. Transactional migration failure leaves version 2 intact and shows a recoverable error. Older binaries must refuse unsupported versions without resetting data.

Phone validation checks formatting only, including a country code; it must not claim the number exists or is verified. Show a clear device-only storage notice. UI wording should be “Create your profile” / “Welcome back” rather than promising secure login.

Required evidence: fresh creation, validation, saved profile after database close/reopen, editing without ID/history loss, upgrade from a populated schema-2 fixture, injected migration rollback, duplicate save, and Android/iOS keyboard/back/accessibility checks.

### B — assessment and target-specific placement

After Slice A is accepted, review exact question content, scoring rules and the next migration. Add learner/target learning profiles, versioned assessment runs and answers. Preserve immutable completed evidence and idempotent submission IDs. Interrupted drafts resume. Do not rewrite the released profile migration to add these later features.

Required evidence: all routing boundaries, incomplete/skip/retake behavior, duplicate submission, interrupted save, independent target-language histories and recovery from failed migration.

### C — real modules for the three stages

Review the curriculum before adding versioned course content and lesson-attempt storage. Initial content budget: three small reviewed modules per stage with meaningful quizzes. A module becomes available only when its content and acceptance tests are complete. Store completed attempts immutably and rebuild progress summaries from evidence.

Daily goals, streaks, achievements, listening exercises, stories and spaced review follow as separate slices based on actual recorded learning. Define day/time-zone and completion rules before streak work. Leaderboards, social competition and account synchronization remain deferred until their identity/privacy/moderation requirements are authorized. No fake XP, streaks, proficiency or achievements.

## Scope guardrails

Keep the existing Whisper/Qwen/SAPI architecture, mock mode, speech flow, credentials boundary and schema-2 conversation records. No new model downloads, paid AI/SMS, backend rewrite, cloud deployment, destructive reset, or broad package upgrade is included. Slice A needs owner approval of its proposed migration and routes before implementation. Slices B and C need their own content/schema review.


## Latest clarification — standard proficiency levels (pending selection)

The owner asked to go beyond the three levels and provide the highest standard level. Clarification requested: use standard CEFR levels A1–C2, or permit skipping assessment. No scoring/migration/course code has been implemented while that distinction is pending.

If standard CEFR alignment is chosen, the six reference levels are A1, A2, B1, B2, C1 and C2. The three broad groups may still organize navigation: Basic User (A1/A2), Independent User (B1/B2) and Proficient User (C1/C2). C2 is the top reference level of this six-level scale. Source: [Council of Europe — CEFR levels](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions).

The provisional twelve-question/three-stage gates above would need replacement and curriculum review; they cannot validly award all six levels. Assess reading, listening, writing and speaking using reviewed evidence before making a broad proficiency claim. An initial text-only check can offer a limited provisional recommendation, not C2 certification. Selecting advanced content is separate from earning a level. Ship only reviewed course modules, even when the architecture can represent A1–C2.


## Specialist-reviewed first implementation slice — 2026-10-16

The owner explicitly requested subagents. Architecture and AI specialists performed independent read-only reviews; neither edited source, installed packages, downloaded models, ran inference or recursively delegated. Root owns integration. Their findings replace the earlier assumption that SQLCipher/custom builds are mandatory for encrypted bounded JSON course files.

### Concrete owner review requested

Start with registration/local access and independent target profiles in a NEW learning.db, not a version-3 change to speaking-tutor.db. Preserve all existing tutor tables, schema-2 records and old reader behavior. The earlier profile-in-tutor-schema-3 proposal is superseded for review by this separate-store design; no migration has been applied.

Proposed initial schema, created transactionally only in the new store:

- local_learner: id TEXT PRIMARY KEY NOT NULL; singleton INTEGER NOT NULL UNIQUE CHECK(singleton=1); display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80); phone TEXT NOT NULL; interface_locale TEXT NOT NULL; explanation_language TEXT NOT NULL; created_at INTEGER NOT NULL; updated_at INTEGER NOT NULL.
- learning_profile: id TEXT PRIMARY KEY NOT NULL; learner_id TEXT NOT NULL REFERENCES local_learner(id); target_language TEXT NOT NULL; created_at INTEGER NOT NULL; UNIQUE(learner_id,target_language).
- learning_app_state: singleton INTEGER PRIMARY KEY CHECK(singleton=1); active_profile_id TEXT REFERENCES learning_profile(id); onboarding_completed INTEGER NOT NULL CHECK(onboarding_completed IN (0,1)).

Version 1 of learning.db advances only after all statements succeed. A future version is refused; failures roll back without deleting data. Existing tutor storage is never opened by a reset/replace operation. Profile validation trims name (1–80 characters), checks international phone-number formatting without claiming verification, and validates language tags at the feature boundary.

Proposed files: src/domain/learning-profile.ts (pure validation/types); src/data/learning-repository.ts plus native/web open adapters (SQL, migration and bounded reads); src/features/profile/ (application operations and full-screen register/Continue as [name]/edit UI); a bounded entry/settings integration in the existing tutor feature. No navigation rewrite. No server login/OTP claim. Name/phone stay out of logs and AI prompts.

Saving a local profile is transactional within learning.db. Updating supported tutor preferences is a separate idempotent application operation, not a fictitious transaction spanning both databases. Target A→B→A restores stable learning-profile IDs. Unsupported tutor languages must show unavailable capability instead of silently selecting another language. Existing session language snapshots/history stay intact.

Required first-slice checks: registration boundaries, duplicate save, persistence after close/reopen, edit without ID/history loss, target isolation, failed migration/retry, future-version refusal, existing tutor regression tests, and Android/iOS layout/back/keyboard/accessibility and audible playback. New learning failures must not destroy or block access to the existing tutor/history.

### Subsequent review boundaries

Assessment and course publication remain separate: a short text-only test cannot award certified C2. Retain versioned evidence and serve genuine reviewed content only. The existing mobile client hardcodes A1 even though the wire contract accepts A1–C2; adaptation is not already implemented.

For the first encrypted bounded-course-JSON download slice, add SDK-matched expo-crypto and expo-secure-store after dependency review. Use native AES-GCM, random per-install keys in protected storage, authenticated pack metadata and durable document storage rather than cache. Preserve old working versions across failures. Detect missing/corrupt keys without silent replacement. Authenticated HTTPS and pack validation are required; a checksum alone is not publisher authentication. Media streaming/chunk encryption is not included in that bounded JSON slice. SQLCipher is an optional later store design, not necessary for the first encrypted file.

AI review: maintain the current /v1 full JSON/WAV contracts and automatic language detection. Benchmark beam size 3 versus 1 in isolation with the existing synthetic fixture, separate model load/cold/warm times, and require multilingual/accent/noise evidence before any production decoder change. Streaming, automatic end-of-turn sending, additional voices and phone-only inference need their own reviewed contracts/assets/device validation. No production change follows automatically from a faster synthetic result.

This section is a concrete review artifact, not a claim that registration, assessment, downloads or offline AI have been implemented. Current AGENTS.md still explicitly limits implementation to UI Phases 1–2 and asks for owner review of major changes. The latest request to complete work expresses the destination; an explicit approval of this scoped first implementation is being requested before crossing those preserved boundaries.
