# Project Codex workflow

Configured 2026-10-15. Status: configuration ready for review; implementation remains gated by owner approval. No specialist agents were launched to create or validate these files.

## Installed version and syntax

Local inspection found:

| Client | Installed version |
| --- | --- |
| npm CLI (`codex.cmd`) | `codex-cli 0.162.1` |
| VS Code bundled runtime (`codex.exe` on this session's PATH) | `codex-cli 0.162.0-alpha.17.2` |
| VS Code extension directory | `openai.chatgpt-26.1007.21434-win32-x64` |

The [official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) specifies standalone project agent TOML files requiring `name`, `description`, and `developer_instructions`. This project uses those files under `.codex/agents/`, with names matching filenames. These are Codex roles, not VS Code custom chat-mode Markdown files. No legacy experimental feature flag is added.

The [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) covers `[agents]` settings. Project `.codex/config.toml` enables the capability and caps concurrent specialist threads at two, excluding the primary. Configuring availability does not automatically launch agents. Models and reasoning effort inherit from the parent; no model or provider is purchased or selected here.

Agent files disable app and plugin capabilities. Their file/command boundaries are behavioral instructions; they do not create separate filesystem permissions. Sandbox and approval policies remain inherited from the parent. No custom tool allowlist or role-specific read-only sandbox is claimed.

## Responsibilities and boundaries

All roles read root `AGENTS.md` and the three planning documents. All work remains planning/review only until the relevant implementation is approved.

| Role name | Owns | Intended tools | Boundary |
| --- | --- | --- | --- |
| `product_manager` | Scope, learner journeys, priorities, acceptance criteria | File/search, relevant read-only shell, docs | No code; product docs only when assigned |
| `software_architect` | Boundaries, contracts, tradeoffs, incremental design | File/search, read-only shell, official docs | No broad rewrites; shared contracts/docs only when assigned |
| `mobile_developer` | Approved screens, components, hooks, use cases | Search, patch/edit, shell checks, available authorized device tools | Assigned mobile files; no migrations or unassigned root configuration |
| `ai_engineer` | Scripted tutor, bilingual feedback, provider boundaries, evaluation | Search, official docs, assigned fixtures/adapters, local evaluations | No paid calls, credentials, real learner uploads, or unapproved recording |
| `database_developer` | SQLite schema, migrations, repositories, seed integrity | Search, patch/edit, disposable database checks, official docs | No live data edits, destructive resets, remote SQL, or released migration rewrites |
| `qa_tester` | Acceptance coverage, regressions, offline/device checks | Search, existing test/lint/typecheck commands, authorized device tools | Review by default; test files only when assigned; no production fixes |
| `security_reviewer` | Secrets, privacy, permissions, SQL/AI trust boundaries | File/search, read-only metadata/shell, official docs | Review only; no active scans, credential dumps, uploads, or edits |

Tools listed above describe permitted usage of tools available in the parent session, not newly installed capabilities. Nothing grants external account access. Disabled app/plugin surfaces may remove tools supplied through those surfaces; unavailable documentation/device tools must be reported honestly. Specialists cannot recursively delegate.

## Approval and handoffs

1. Primary agent collects scope and current approval. A direct request for a bounded specialist review authorizes that review, not implementation.
2. Product Manager defines success criteria; Architect resolves affected contracts. Return the proposed plan for owner review.
3. Once implementation is approved, primary assigns the smallest vertical slice to the relevant Mobile, Database, or AI role. Explicitly list allowed files and exclusions.
4. Use parallel work only when authorized and independent, with at most two specialists and disjoint write ownership. One agent owns migrations/dependencies/root layout/shared contracts at a time.
5. QA and Security review the relevant output. Primary consolidates findings, resolves conflicts, and reports checks and residual limitations. Implementation approval does not authorize deployment or paid services.

Task template:

```text
Use the <role_name> custom agent for this bounded task: <objective>.
Mode: planning/review only OR approved implementation scope: <specific approval>.
Allowed files: <paths>. Exclusions: <paths/actions>.
Dependencies/contracts: <agreed decisions>.
Do not spawn other agents. Return findings/changes with file references,
checks actually run, limitations, and follow-up decisions. Wait for the result.
```

## Invoke from VS Code

Open this repository as the workspace. Ensure it is trusted in Codex; project configuration can be ignored in untrusted projects. Start a fresh Codex chat after configuration changes, or reload the VS Code window if the extension keeps cached settings. Do not change `chatgpt.cliExecutable` just to adopt these role files.

Open the Codex sidebar from the Activity Bar or the Command Palette. In its chat, ask for the exact custom agent name. These are natural-language delegation requests, not new slash commands or guaranteed agent-picker entries. For a planning-only review, use one of these:

| Agent | Prompt to paste |
| --- | --- |
| Product Manager | `Use the product_manager custom agent to review MVP scope and acceptance criteria. Planning only, no file edits or implementation. Wait and summarize.` |
| Software Architect | `Use the software_architect custom agent to review the proposed architecture and dependencies. Planning only, no file edits. Wait and summarize.` |
| Mobile Developer | `Use the mobile_developer custom agent to propose the first onboarding screen slice. Planning only, no edits or installs. Wait and summarize.` |
| AI Engineer | `Use the ai_engineer custom agent to propose scripted bilingual tutor contracts and evaluation cases. Planning only, no API calls or edits. Wait and summarize.` |
| Database Developer | `Use the database_developer custom agent to review SQLite schema invariants and migration sequencing. Planning only, no database or file changes. Wait and summarize.` |
| QA Tester | `Use the qa_tester custom agent to review MVP acceptance coverage and identify test gaps. Review only, no edits or installs. Wait and summarize.` |
| Security Reviewer | `Use the security_reviewer custom agent to review the proposed data and AI boundaries. Review only, no edits, scans, or credential reads. Wait and summarize.` |

Run one prompt at a time until a broader plan is approved. Ask Codex to report the selected custom role and to stop/report if unavailable rather than silently substitute a generic agent. The IDE may display background-agent activity above the composer; UI availability varies. A role configuration is not an extension sidebar tab of its own.

Fallback: use the VS Code integrated PowerShell terminal, from the repository root:

```powershell
codex.cmd
```

Then paste the same role request. This uses the standalone CLI rather than the extension's bundled runtime. If discovery fails, check project trust, start a new session, re-run validation, and inspect errors before considering an update. No live role invocation was performed as part of this configuration task.

## Validation

Python 3.11+ is needed only for the optional validation script, not for running the mobile app or the agents. It uses the standard library and installs nothing:

```powershell
python scripts/validate-codex-agents.py
python scripts/validate-codex-agents.py --codex codex.exe
python scripts/validate-codex-agents.py --codex codex.cmd
```

The first command checks TOML parsing, required fields/types, unique role names, exact local role set, capability settings, and the shared instruction registry. Runtime validation starts a temporary local app-server process in strict configuration mode and reads effective project settings, using an isolated temporary Codex home. It performs no model turns, agent spawning, or app implementation and leaves user-level configuration unchanged.

This checks local project settings with the installed parser and statically checks the standalone role schema against current documentation. It does not prove runtime discovery, custom-role instruction delivery, account/model access, or live subagent behavior; those require an explicitly requested live role smoke test. Do not describe static validation as end-to-end validation.

Application checks remain required: TypeScript and lint. The starter's missing ESLint setup is an existing blocker; do not install/configure it implicitly during workflow setup.

Validation recorded on 2026-10-15:

- Seven standalone role files passed the static checks.
- Both `0.162.1` and the bundled `0.162.0-alpha.17.2` accepted project settings in strict app-server configuration mode; the project layer was loaded and enabled.
- `npx.cmd --no-install tsc --noEmit` and `git diff --check` passed.
- `npx.cmd --no-install expo lint` stopped because ESLint is not configured. The interactive setup offer was declined; dependencies and application configuration were preserved.
- No role discovery/spawn smoke test or model turn was performed.
