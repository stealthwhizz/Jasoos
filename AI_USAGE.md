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

- Codex recovered interrupted Lane B edits, completed request recovery, keyboard/touch/focus/accessibility fixes and regression harness repairs. Local fixture Chromium plus axe produced 377 PASS / 0 FAIL / 1 UNVERIFIED; 46 unit tests passed (3 TODO), typecheck/lint/build passed. No live sponsor calls or separate Astra visual review were performed. Evidence is preserved under artifacts/browser/lane-b-chromium/.

- On 2026-11-06, Codex studied Kahani's public UI source as a visual reference and authored an original ETHJasoos amber detective presentation. It created an original SVG street-cover illustration, local font loading (Geist/Bricolage Grotesque with OFL notices), tokens, responsive panels/gallery/HUD, actual evidence slots, interview drafts, suspect selection cards and finale styling. No Kahani code, illustrations, logo or sprites were reused; no new framework or engine was introduced. Codex ran fixture-only Playwright/axe reviews across desktop/tablet/mobile and fixed observed contrast, ARIA and dialogue-scroll issues. Shared API contracts and live integrations were unchanged. Reference site screenshot exposed service JSON rather than the game; source-based inspiration is documented in docs/UI_DESIGN.md.
- Final redesign evidence: 422 browser checks passed, none failed, one real-tab-blur check unverified; three supplemental reduced-motion/loading checks passed. Final sequential unit suite: 46 passed / 3 TODO; typecheck, lint and production build passed. QA also corrected inherited fallback-image text contrast and ensured new dialogue replies scroll into view. Earlier failing/interrupted reports are preserved; redesign-accepted is authoritative.
