# Local database design proposal

B5 update, 2026-10-15: schema version 2 adds isolated live/mock sessions and full local AI feedback while transactionally preserving schema-1 records. [PHASE_B5.md](PHASE_B5.md#storage-migration-and-recovery) describes the implemented migration and rollback verification. Earlier schema-1 and curriculum notes below are historical/proposed.

Implementation update, 2026-10-15: Voice Tutor Phase A uses `speaking-tutor.db`, schema version 1, with `tutor_preferences`, `tutor_sessions`, and `tutor_turns`. The repository in `src/data/tutor-repository.ts` is authoritative for this schema. [VOICE_TUTOR.md](VOICE_TUTOR.md) describes its invariants. The broader curriculum schema below remains a future proposal; it has not been created.

Status: proposed logical schema, 2026-10-15. No tables or migrations have been implemented. Use SQLite on Android/iOS through `expo-sqlite` when stage 1 is approved. No server database or ORM is selected. See [architecture](ARCHITECTURE.md).

## Core invariants

- One local learner initially; stable opaque text IDs for mutable learner records make later account linking possible.
- A target-language profile belongs to a learner and target language, independent of native/explanation language. Unique `(learner_id, target_language_tag)` prevents duplicate progress tracks.
- Interface locale and native language are learner preferences. Active target is a profile reference. Changing a preference or active profile never deletes history.
- CEFR estimates belong to assessments; they are not completion flags. Unknown proficiency remains null, not automatically A1. Course availability is separate from placement.
- Immutable finalized attempts are evidence; progress summaries are rebuildable projections. Quiz retries are new attempts, while a repeated submission of the same attempt is idempotent.
- Content versions are immutable. Never overwrite a question whose earlier version has stored responses.

## Proposed MVP tables

All foreign-key targets must exist. IDs are `TEXT PRIMARY KEY NOT NULL` unless a composite key is shown. Use UTC epoch milliseconds as `INTEGER` for timestamps, integer booleans constrained to 0/1, bounded scores, and explicit `NOT NULL` constraints. The table below is a design contract; executable DDL and migrations come later.

| Table | Main columns and constraints | Purpose |
| --- | --- | --- |
| `languages` | `tag` PK, `autonym`, `display_name`, `direction` constrained to ltr/rtl | Supported language catalog; validate/canonicalize tags at import |
| `learners` | `id`, `native_language_tag` FK, `interface_locale`, `created_at`, `updated_at` | Device-local learner preferences; locale need not equal study language |
| `learning_profiles` | `id`, `learner_id` FK, `target_language_tag` FK, `daily_goal_minutes > 0`, timestamps; UNIQUE learner/target | Independent learning history per target |
| `app_state` | Singleton key constrained to 1; `active_profile_id` FK nullable | Active selection; null before onboarding; application validates learner ownership |
| `content_packs` | PK `(pack_id, version)`; `target_language_tag` FK, `manifest_hash`, `installed_at` | Reviewed immutable content releases |
| `content_items` | PK `(item_id, item_version)`; pack ID/version composite FK, `kind` enum lesson/assessment/question/script, `cefr_level` nullable constrained A1-C2, `payload_json`, `payload_schema_version` | Typed, validated content; payload holds prompts/options/rubrics/script, not learner progress |
| `content_translations` | PK `(item_id, item_version, language_tag)`; content composite FK, language FK, validated `payload_json` | Native-language explanations; fallback policy is explicit in manifest/UI |
| `path_lessons` | PK `(pack_id, pack_version, lesson_key)`; composite pack FK, content item/version FK, `position >= 0`; UNIQUE pack/version/position | Stable logical lesson keys with versioned content mapping and path order |
| `assessment_runs` | `id`, `profile_id` FK, assessment item/version FK, `scoring_version`, `status` draft/completed, nullable `score`, nullable `estimated_cefr`, `started_at`, nullable `completed_at` | Skip creates no completed result; retain draft and retake evidence |
| `assessment_answers` | PK `(run_id, question_id, question_version)`; run FK, question content composite FK, `answer_json`, `earned_points`, `max_points > 0` | Versioned placement evidence; require 0 <= earned <= max |
| `lesson_attempts` | `id`, `profile_id` FK, pack ID/version and lesson key composite FK, `status` draft/completed, `started_at`, nullable `completed_at`, nullable score, `scoring_version` | A preallocated attempt ID acts as submission idempotency key |
| `lesson_answers` | PK `(attempt_id, question_id, question_version)`; attempt FK, question content composite FK, `answer_json`, earned/max points | Draft answers may update; finalized answers remain immutable |
| `lesson_progress` | PK `(profile_id, pack_id, lesson_key)`; profile FK, `best_score`, `completion_count`, `last_completed_at` | Projection across content versions for a stable lesson key; rebuild from attempts |
| `tutor_sessions` | `id`, `profile_id` FK, script content item/version FK, `explanation_language_tag` FK, `provider` constrained scripted for MVP, `started_at`, nullable `ended_at` | Session captures languages/provider; target comes from immutable profile |
| `tutor_messages` | `id`, `session_id` FK, `sequence >= 0`, `role` learner/tutor, `text`, nullable validated `feedback_json`, `created_at`; UNIQUE session/sequence | Bounded scripted transcript and curated corrections |

Only introduce the tutor tables with the practice milestone. Lessons can embed their question references in validated content payloads; validation verifies every reference resolves within an installed pack. Payloads are versioned discriminated unions validated at import/read, not untyped arbitrary blobs. SQL constraints enforce relational integrity; application rules enforce semantic consistency such as item kind and matching profile/content target.

For finalized assessment/lesson rows, completion timestamp and score are required; for drafts they are null. Scores use a documented 0-100 scale; answer points keep their original scale. A completed run may have a null CEFR estimate if evidence is insufficient. A retake does not change old estimates. Derive the current recommendation from the latest completed valid assessment and available curriculum using a versioned rule.

## Language switching and content updates

Switching targets looks up `(learner, target tag)` and creates a profile only when absent. Update the active profile in a transaction; validate the requested target has an installed supported pack. Native-language edits update only the learner preference. Existing tutor sessions retain their explanation language. Avoid switching the context of an active attempt; finish/cancel it explicitly or resume it under its original profile.

Completion follows stable `(pack_id, lesson_key)` across versions only when an editor declares the learning objective equivalent. Materially different lessons receive new keys; no automatic reset of old attempts. Keep versions referenced by history. Store pack hashes and reject conflicting payloads for an existing version. Content pruning must retain referenced evidence or preserve an explicit archive.

## Transactions, indexes, and startup

- Enable foreign keys for each connection; configure WAL for normal mobile operation. Use asynchronous queries and bound parameters for all values. Only trusted static migrations may contain raw SQL.
- Serialize bootstrap and writes. Apply ordered forward migrations transactionally, advancing the schema version only after success. Use SQLite `user_version` as the initial version marker; never infer schema from app version.
- Initialize schema before repositories become available. Present a recoverable error if opening/migration fails. Never silently drop the database to fix an error. A database newer than the app supports must fail safely.
- Seed validated packs transactionally and idempotently by immutable pack/version. Partial imports must not become visible. Migrations change structure; content import changes catalog data.
- Finalize a lesson in one transaction: save answers, change draft to completed only if still draft, and update/rebuild its profile progress. Repeated completion of an already-finalized ID returns the stored result. No double increment.
- Create indexes on profile/started-time for assessment and lesson histories, session/sequence for messages, and content pack/version. Cover child foreign-key columns used for joins/deletion. Add indexes from real query needs rather than every column.
- Query progress by explicit profile ID, page histories, and bound transcript retrieval. Do not load all attempts on startup.

Proposed migration delivery: version 1 core catalog, learner, profile, and active selection; version 2 assessment/path/lesson evidence and progress; version 3 tutor persistence when needed. Final numbering follows actual delivery, with each released migration immutable. Test empty databases, populated older versions, repeat startup, invalid seeds, failures mid-transaction, and concurrent submission.

## Retention, deletion, and future sync

Use explicit foreign-key deletion rules: learner/profile children cascade only during deliberate local deletion; referenced content is restricted from deletion. Reset is a confirmed transaction clearing learner data, active selection, evidence, projections, and practice messages, while retaining the installed catalog. Later delete recordings/files as part of the same user operation with retryable cleanup. Do not store audio/video blobs in SQLite; introduce file metadata and retention when media exists.

Plain SQLite is not encrypted. Do not store API keys or credentials here, and do not log answers/transcripts by default. OS app storage is not a guaranteed backup. Define export/encryption requirements before promising recovery or handling more sensitive media.

Defer accounts, remote mappings, outbox, tombstones, sync cursors, social messages/memberships, assignments, media downloads, and vocabulary review scheduling tables until those workflows are specified. Future sync must merge immutable attempts by ID, reconcile progress from evidence, link local profiles to accounts without loss, and propagate deletions. Social authorization is a server responsibility. Do not attempt direct SQL Server/PostgreSQL access from mobile.

## Implementation reference

Use the current [SDK 57 SQLite documentation](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) at implementation time for connection, parameter binding, and transaction semantics. This design does not assume web SQLite parity or encryption enabled by default.
