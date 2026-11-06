# How AI was used

## In the product

Every image, vision pass, world plan, and NPC line comes from models served on 0G Private
Computer. Each call goes through `lib/zg` and shows its request ID in the ticker.

## In building the product

- The repository scaffold (folder layout, typed stubs, fixtures, route handlers, and minimal UI)
  was generated with an AI coding assistant (Claude Code) from the team's own PRD
  (`docs/PRD.md`) and a written brief. The team reviewed and owns every line.
- On 2026-11-06, Codex reviewed the eight project Markdown files and PRD, added the shared lane status and web-chat handoff docs, and updated `components/GameCanvas.tsx` and `app/world/[id]/WorldView.tsx` for walk-mask collision and interior loading/failure states.
- Codex installed Vercel's `vercel-react-best-practices` skill from `vercel-labs/agent-skills` into `.agents/skills/`, with the installation recorded in `skills-lock.json`. The curated catalog endpoint first returned HTTP 403; the skill was then found and installed through the maintained skills catalog CLI.
- Codex integrated branch A into Suraj's client branch and wired its browser-safe walk-map and sprite helpers into GameCanvas. Automated checks passed after dependencies were installed; browser review remains pending.
- Codex implemented the R8 accusation/finale client against the existing server API and exercised Chromium fixture journeys for movement, rooms, clues, 401/403, incorrect answers and finale. Temporary injected-state/sprite harnesses supplied deterministic R5/R6 checks; screenshots were captured in artifacts/browser. No live sponsor integration is claimed.
- Codex inspected final-review integration blockers and added defensive sprite fallback plus keyboard focus handling in GameCanvas. Sequential automated checks passed; the in-app browser host was unavailable, so fresh browser evidence and visual signoff remain pending. Posted explicit A/C coordination questions on PR #1.
