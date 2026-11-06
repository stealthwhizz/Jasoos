# ETHJasoos — ChatGPT Web Chat Handoff

Use this file to brief a separate ChatGPT web chat that will act as Suraj's project manager. It summarizes the current repo state; the PRD and code remain authoritative when this summary is stale.

## Manager role and working agreement

You are helping Suraj (team lane B) deliver ETHJasoos. Treat [docs/PRD.md](PRD.md) as the source of truth for product scope and acceptance criteria, [docs/TEAM_STATUS.md](TEAM_STATUS.md) as the current shared status/handoff, and the source code as the evidence of what is implemented.

- Start each work session by checking `docs/TEAM_STATUS.md`, `git status`, and relevant PRD sections. Keep reading project Markdown when it changes.
- Keep the shared status and handoff current. Record owner, PRD requirement IDs, implementation paths, evidence, blockers, and next action. Do not mark a feature complete from a TODO removal alone; require its acceptance behavior to be demonstrated.
- Suraj owns the client lane in `components/`, `app/page.tsx`, `app/gallery/`, and `app/world/`. Keep work on Suraj's branch and prepare small reviewable changes. Before a PR, inspect the diff, validate the requirement, and report exactly what was/wasn't checked. Do not publish or merge without Suraj asking.
- Coordinate cross-lane contracts by proposing the exact change in `docs/TEAM_STATUS.md` and checking with the owners shown below. Do not silently change shared `lib/types` or API contracts.
- Coordinate with teammates through repo Markdown when that is the requested channel. Do not claim that a human teammate was notified unless an actual message was sent.
- Keep secrets, World ID proof data, and personal data out of commits and documentation.
- Use fixture mode for local work where possible. Never represent fixtures as proof of a live sponsor integration.

## Project summary

ETHJasoos (PRD working title: Worldsmith) turns a sentence into an illustrated, walkable detective mystery. A maker verifies as human with World ID, enters a premise, and watches a ticker show 0G model calls and request IDs. The player explores a generated street, enters three interiors, speaks with NPCs to collect clues, decodes a hidden note, accuses a culprit, and sees the finale. Worlds are intended to appear in a public Arkiv gallery and cool off/expire if neglected.

The target is an ETHGlobal Mumbai 2026 demo. Core P0 requirements are R1–R12: moderation, structured world plan, image generation, street analysis, movement, interiors, NPC dialogue, finale, generation ticker, World ID creation gate, Arkiv gallery, and daily quota. P1 includes 0G sign-in/credits, 0G Storage, daily mystery/leaderboard, share links, speech, hidden-note/Decoder, accusation checks, and cold cases. P2 includes presence, voiced dialogue, hidden image code, and keyed notes. The PRD cut line prioritizes preserving the generation/ticker, walking, one mystery, Arkiv gallery, and World ID gate.

## Team lanes and dependencies

| Owner | Lane | Responsibilities | Depends on |
| --- | --- | --- | --- |
| A — Amogh Sunil | Engine, 0G, detective logic | R1–R4; server side of R7/R8; R9 event stream; R21/R22 logic and R23 evidence data. Owns `lib/engine/`, `lib/zg/`, fixtures and engine routes. | Fixture and API shapes must be agreed with B; publishing/storage helpers from C. |
| B — Suraj | Game client and polish | R5/R6; UI for R7/R8/R9; R17/R18; R22 UI; canvas, collision, doors, interior states, dialogue, ticker, Decoder, gallery and demo flow. | Fixture world from A; gallery/verify components and stable data contracts from C. |
| C — Kishore | Chain, identity, submission | R10–R12, R14–R16, R24/R25; World ID, Arkiv entities/queries, quota, accusation checks, Storage, `/arkiv/` judge docs, README, debrief and submission. | Manifest shape from A; component placement/data needs from B. |

The current GitHub `CODEOWNERS` file has placeholder usernames (`@AMOGH_GITHUB`, `@SURAJ_GITHUB`, `@KISHORE_GITHUB`). Replace them only when the real handles are known.

## Current repository and working state

- Repository: `stealthwhizz/ETHJasoos`; local project path in the originating session: `/home/god/Documents/github/ETHJasoos`.
- Base branch: `main`, tracking `origin/main`. Current Suraj work branch: `suraj/ethjasoos-client`.
- Latest observed main commit: `dc56e31` (`docs: route engine API handlers to lane A in CODEOWNERS`). Earlier scaffold commits include fixture UI, API routes and smoke scripts.
- Runtime is Next.js 16 / React 19 / TypeScript. Fixture setup in README: `npm install`, copy `.env.example` to `.env.local`, set `USE_FIXTURES=true`, run `npm run dev`.
- `npm run typecheck` was attempted in the originating session but could not start because dependencies are absent (`tsc: command not found`). `git diff --check` passed. Unit tests and live sponsor smoke tests were not run.
- Connected GitHub issue search returned 422 saying this repository was unavailable or inaccessible to the connected account. Assignment tracking here uses PRD, source TODOs and local commit history; do not claim the remote issue/PR list was inspected.

## Suraj's active work from the current session

Modified files currently carried on the Suraj branch (not yet committed):

- `components/GameCanvas.tsx`: uses `manifest.walkMap` to block movement on non-walkable cells, allows sliding along walls by checking each axis separately, normalizes diagonal movement speed, clears held keys on window blur, and widens the door interaction radius. This addresses the explicit TODO(B) for R5. The fixture's walkable lower third and shopfront door layout motivated the door-radius adjustment.
- `app/world/[id]/WorldView.tsx`: renders an accessible “Still building this room” status for missing/pending interiors; failed interiors show a playable-case message plus model/request ID; ready interiors keep the image and provenance caption. This addresses the TODO(B) for R6.
- `docs/TEAM_STATUS.md`: records team lanes, status snapshot, checkpoints and dated handoff. R5/R6 are “Ready for validation,” not complete.
- `AI_USAGE.md`: records Codex's use and the client/doc files changed.

These changes are not yet validated in a running app. Once dependencies are available, start in fixture mode, verify movement cannot cross blocked cells, verify sliding and all three door interactions, and inspect pending/failed/ready interior UI. Update the status only after observed acceptance behavior.

## Suraj lane: remaining work and status

| PRD scope | Observed status | Next action |
| --- | --- | --- |
| R5 movement/collision | Implementation added; awaiting validation | Run fixture world. Check mask boundaries, keyboard controls, collision, diagonal speed and door reachability. |
| R6 interiors | Loading/failure UI added; awaiting validation | Exercise pending, failed and ready assets. Pending copy currently allows dialogue while the image builds. |
| R7 dialogue UI | Component exists | Validate clue delivery by second NPC reply and close by third; API/server rule is A's dependency. |
| R8 clue unlock/accusation/finale UI | Not complete; explicit TODO in `app/world/[id]/WorldView.tsx` | Ask A/C to confirm route response and public finale-asset contract; build an accusation picker gated by three clues and reveal the finale only on correct server response. |
| R9 ticker UI | Component exists | Verify live SSE events, model/latency/request ID display, failures and accessibility under realistic event volume. |
| R17 share link | Not observed complete | Stretch item; add direct-world share behavior after core loop, if schedule allows. |
| R18 speech | Not observed complete | Cut-first stretch item; defer until core acceptance is satisfied. |
| R22 Decoder UI | Component exists | Validate hidden and ordinary-note states and highlighted word ranges against A's codec contract. |
| Gallery/demo polish | UI exists; real Arkiv data is C's dependency | Validate empty/loading/error states and direct world navigation with C's live query. |

## Other lanes: observed remaining work

- A: `lib/zg/` and engine modules still contain TODO(A) fixture stubs for real moderation/planning, image/vision calls, retry/rate-limit handling, note encoding and server dialogue history. The 0G request ticker and model evidence need live validation.
- C: `lib/worldid/` and `lib/arkiv/` still have TODO(C) fixture/stub behavior. World ID proof verification, Arkiv writes/queries/expiry/quota, gallery data, accusation uniqueness, and 0G Storage need implementation or validation. The five `/arkiv/` docs and several README sponsor sections are still stubs/TODOs.
- These are source inspections, not a full integration audit. Keep the detailed status in `docs/TEAM_STATUS.md` current as owners report progress.

## Architecture and contracts to keep in view

- Browser: Next.js pages and React components; canvas game uses normalized positions and a coarse `WalkMap` (`cells[row * cols + col]`). Doors use normalized image coordinates.
- Server routes: `POST /api/verify`, `POST /api/worlds`, `GET /api/worlds/:jobId/events` (SSE), `GET /api/worlds/:id`, `GET /api/gallery`, `POST /api/worlds/:id/visit`, `POST /api/dialogue`, `POST /api/worlds/:id/solve`, `GET /api/status`; detective accusation route exists at `/api/worlds/[id]/accuse`.
- Shared TypeScript contracts are in `lib/types/index.ts`. Public manifests strip `bible.mystery`; server should not reveal the culprit before a correct accusation.
- 0G handles moderation, world planning, image generation, vision analysis and dialogue; request IDs should be visible in the ticker/provenance UI.
- Arkiv testnet in the PRD is rabdi, chain ID 7794095. Intended entity types: `world`, `creation`, `visit`, `solve`, `accusation`. Avoid personal data in public entities.
- World ID gates creation (and, in detective mode, one accusation per person/case); exploration remains open to guests.
- Current documented risks: server-held signer weakens true maker ownership; jobs/sessions in memory are single-process and lost on restart; hidden-note codec is a puzzle rather than security; Arkiv expiry/sorting/payload limits and model speed/rate limits require real evidence.

## Skill status

Installed the maintained Vercel `vercel-react-best-practices` skill from `vercel-labs/agent-skills` into `.agents/skills/vercel-react-best-practices/`. It provides React/Next.js performance guidance and includes rule files and a compiled guide. `skills-lock.json` records the source and content hash. The first curated-list request returned HTTP 403; the skill was then found and installed through the skills catalog CLI. Review the local `SKILL.md` and relevant rule files when editing React/Next.js code; installation does not replace the PRD or project decisions.

## Immediate next steps for the manager

1. Continue on `suraj/ethjasoos-client` and keep the Suraj-owned changes and shared handoff/docs on it.
2. Install dependencies only when Suraj is ready to validate; then run typecheck and the focused fixture flow. Report actual results and update `docs/TEAM_STATUS.md`.
3. Ask A/C for the R8 accusation request/response and finale exposure contract using the agreed written handoff channel. Continue independent B work while waiting.
4. Implement and validate R8 client behavior, then address R7/R9/R22 polish and gallery dependency.
5. Before opening a PR, ensure the branch contains only intended work, update AI usage/status docs, and provide a summary plus validation evidence. Leave PR creation and merging to Suraj unless explicitly delegated.
