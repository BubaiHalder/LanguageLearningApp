This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Project scope and architecture

- Read `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and `docs/DATABASE_DESIGN.md` before feature or persistence work. They are proposed plans until reviewed; do not treat future milestones as authorization to implement them.
- Deliver one small vertical slice at a time. Preserve the working Expo configuration, package versions, assets, and existing unrelated edits. Avoid template resets and broad rewrites.
- Android and iOS are primary. Keep existing web code compatible or explicitly document platform limitations; never silently replace persistence with volatile state.
- Use strict TypeScript; avoid `any`, unchecked assertions, and suppressed errors. Validate external data, route parameters, and versioned content at boundaries.
- Keep route files thin. Features own use cases; shared domain rules are pure; repository adapters own SQL; service adapters own platform/provider access. No SQL or provider calls in screens.
- Prefer existing theme/components and local React state. Add dependencies only when a scoped feature needs them; this project currently uses npm and `package-lock.json`.

## Learning, language, and persistence rules

- Separate interface locale, native/explanation language, and target language. Key progress to a stable learner/target profile. Language switches must never delete or overwrite another target's history.
- Version curriculum, scoring rules, and assessment evidence. Describe placement as provisional; do not claim certified CEFR proficiency or general AI correction from scripted content.
- SQLite is the local source of truth for the Phase A tutor. Use async access, parameterized queries, explicit foreign keys, transactional writes, ordered migrations, and idempotent seeding/submission.
- Keep finalized attempts immutable and summaries rebuildable. Never silently reset the database on errors. Preserve historical content references during upgrades.
- Test language isolation, migration failure/recovery, assessment scoring, interrupted saves, and duplicate submission when adding those behaviors.

## Services, privacy, and mobile quality

- Do not install/provision paid services or enable paid AI usage without explicit authorization. No direct mobile connection to SQL Server/PostgreSQL; future server access goes through an authenticated backend.
- Never embed provider keys in source, client bundles, or `EXPO_PUBLIC_*`. Do not commit credentials, learner databases, recordings, or sensitive logs. Local SQLite is not assumed encrypted or backed up.
- Label scripted/mock tutor responses clearly. Speech output, speech recognition, and pronunciation evaluation are separate capabilities; handle missing voices and denied permissions explicitly.
- Request microphone permissions only for an initiated recording feature. Future social features require authorization, reporting/blocking, and moderation before release.
- Support safe areas, keyboard/back behavior, accessible labels, large text, RTL, contrast, adequate touch targets, and dark mode. Avoid network dependencies in core offline flows and unbounded list/history reads.

## Validation and reporting

- Run lint and typecheck before declaring a task done. On Windows use `npx.cmd` if PowerShell blocks unsigned `npx.ps1`; do not change execution policy.
- Report missing tooling and baseline failures honestly. If lint requests dependency/config setup during a documentation-only task, run noninteractively and record the blocker; do not silently expand scope.
- Add meaningful behavior tests for data/domain changes and validate affected flows on Android/iOS. A typecheck does not prove device behavior.
- Summarize changed files, check results, limitations, and next steps. Review major implementation or configuration changes with the owner before applying them.
- Configured specialist roles and invocation examples are documented in `docs/CODEX_WORKFLOW.md`; configuration does not launch agents or authorize implementation.

## Codex multi-agent workflow

- The primary agent coordinates seven project roles in `.codex/agents/`: `product_manager`, `software_architect`, `mobile_developer`, `ai_engineer`, `database_developer`, `qa_tester`, and `security_reviewer`.
- Current authorization: UI/UX Phase 1 (design foundations) and Phase 2 (tutor-first redesign) only. Preserve the owner-confirmed Android B5 voice flow, existing backend contracts, mock mode and schema-2 SQLite records. Do not modify the backend or database schema, add models, deploy, or implement navigation expansion/onboarding/lessons/gamification from Phase 3 onward. See `docs/UI_REDESIGN_PHASES_1_2.md`. Native layout/accessibility and audible playback must be rechecked on the phone after UI changes; earlier B5 confirmation is not evidence for the redesigned UI. Stop after Phase 1–2 implementation and validation. Parallel implementation remains unapproved.
- After approval, delegate only the authorized scope. Use at most two concurrent specialist threads (or the runtime's lower limit). Define each task's objective, allowed files, exclusions, dependencies, and required evidence before spawning. Specialists must not recursively delegate.
- Sequence product scope and architecture contracts before implementation; then assign bounded mobile, AI, and database tasks. Run QA and security review after the relevant changes exist. These stages are guidance, not an automatic launch schedule.
- Use parallelism primarily for independent reviews. Parallel writers require explicit approval and disjoint file ownership. One owner controls shared contracts, migration ordering, dependencies, and root layout/configuration; coordinate changes through the primary agent.
- All agents inherit this file and the parent permissions. Role boundaries are instructions, not per-agent filesystem ACLs or read-only sandboxes. No role may weaken approval/sandbox policies or grant itself additional tools.
- Tools are inherited when available. Role files disable apps and plugins for a focused local workflow; no MCP servers, external accounts, model overrides, or credentials are added. Read-only roles must avoid editing even if an inherited tool technically permits it.
- Every handoff returns scope, findings/changes, file references, checks actually run, limitations, and follow-up needs. The primary agent integrates results and reports unresolved conflicts; it must not conceal failures or overwrite unrelated work.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
