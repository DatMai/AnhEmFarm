# Agent interoperability

`AGENTS.md` is the shared source of project guidance. Entry points link to it so different tools do not maintain conflicting copies.

| Tool or model | Project entry point | Notes |
| --- | --- | --- |
| Codex | `AGENTS.md` | Use the Superpowers plugin exposed in the current session. |
| Claude Code | `CLAUDE.md` imports `AGENTS.md` | Install the upstream plugin separately for this harness. |
| Gemini CLI | `GEMINI.md` imports `AGENTS.md` | Install the upstream extension separately for this harness. |
| GitHub Copilot | `.github/copilot-instructions.md` | Follow its link to the shared instructions. |
| DeepSeek or another model | Explicitly supply `AGENTS.md` through the chosen agent tool | Automatic instruction discovery depends on the tool, not the model name. |

For a tool without repository instruction discovery, begin with:

> Read AGENTS.md, docs/agents/HANDOFF.md, and docs/agents/SUPERPOWERS.md. Identify the current workflow stage and approved artifacts before editing. Resume only the authorized work and report verification evidence.

These files are repository conventions, not additional mandatory artifacts invented by Superpowers. They do not prove that a given model or tool has loaded the instructions. Verify tool setup using the official upstream installation guide and the instructions visible in that session.

When delegating, provide a bounded task and file ownership, approved spec/plan paths, necessary interfaces, and the command that verifies the result. Keep customer information and secrets out of prompts.
