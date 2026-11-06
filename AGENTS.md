<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Conventions for AI agents in this repo

## Types

Keep types in **one place per layer**. Do not define duplicate shapes inline in components or route files.

| Module | Use for |
| --- | --- |
| [`lib/types/client.ts`](lib/types/client.ts) | React components, client pages, fetch response/request shapes consumed by the browser |
| [`lib/types/server.ts`](lib/types/server.ts) | API route handlers, `lib/games.ts`, DB row shapes, server-only request bodies |
| [`lib/types/shared.ts`](lib/types/shared.ts) | Cross-layer domain types with no Node/browser APIs (e.g. `Premise`) |
| [`lib/universe.ts`](lib/universe.ts) | Explorable-world generation types (`GameBible`, `SceneData`, dialogue) |

- Import client types in components with `@/lib/types/client`.
- Import server types in routes and server libs with `@/lib/types/server`.
- [`lib/types.ts`](lib/types.ts) re-exports client types for backward compatibility — prefer the explicit paths in new code.

## Helpers

- [`lib/constants.ts`](lib/constants.ts) is for **shared constants only** — no functions.
- Do not add new `lib/*.ts` files for one-off utilities.
- Inline logic at the call site when it runs in one place; colocate in an existing domain module (e.g. [`lib/games.ts`](lib/games.ts)) only when reused across multiple routes.

## Model calls (0G)

Every model call goes to 0G Private Computer through the OpenAI SDK.

- The explorable world uses [`lib/zg-client.ts`](lib/zg-client.ts), the 0G client. For text and vision use `generateContentWithRetry`; for images use `generateImage`. Do not call `ai().chat.completions.create` directly in new code.
- The older engine under `lib/engine/` uses `zgCall` in [`lib/zg/index.ts`](lib/zg/index.ts), which falls back to OpenAI when `OPENAI_API_KEY` is set. `lib/zg-client.ts` has no OpenAI fallback yet.
- Backup calls must stay visible (the ticker labels them `openai/<model>`), so a demo never hides that 0G was not used.

## Server-side retries

Wrap transient-prone outbound calls with the shared retry helper in [`lib/retry.ts`](lib/retry.ts):

- Use `withRetry(fn, DEFAULT_RETRY_OPTS)` for Arkiv writes, external `fetch` calls, and other server I/O that can fail on rate limits, 5xx, or network blips.
- Keep retry logic in domain libs (`lib/zg-client.ts`, `lib/world-engine.ts`, `lib/games.ts`), not in API route handlers.
- Defaults live in [`lib/constants.ts`](lib/constants.ts): `RETRY_MAX` (3) and `RETRY_BASE_MS` (500).

## Documentation

- Add **JSDoc** (`/** … */`) on exported functions, types, components, and API route handlers.
- Add brief **inline comments** for non-obvious logic (quota gates, persistence, generation vs replay paths).
- Prefer comments that explain *why* (e.g. "non-owners cannot generate — edge becomes a wall") over restating the code.

## API routes (persistence)

New game persistence routes follow REST conventions:

- `GET/POST /api/games`, `GET/DELETE /api/games/[id]`
- `PUT /api/games/[id]/scenes/[sceneId]`, `PUT …/sprite`, `PUT …/finales/[outcome]`
- `GET /api/profile` — generation quota lives on the user resource, not the games collection

Use correct status codes: `200`, `201`, `204`, `401`, `403`, `404`, `422`.

## Persistence

Games and scenes are Arkiv entities ([`lib/arkiv.ts`](lib/arkiv.ts)); routes go through `gameStore()`. Without `ARKIV_SIGNER_KEY` an in-memory store stands in. Generated images are files under `ASSET_DIR`, served by `/api/assets/[...path]`.

`FREE_GAME_LIMIT` defaults to `0`, which turns world creation off. Set it above zero to create worlds, and list player ids in `UNLIMITED_PLAYERS` to bypass it.

## Dev sign-in

Sign-in is World ID ([`lib/worldid.ts`](lib/worldid.ts)). When World ID keys are not set and `NODE_ENV === "development"`, the login page's **Verify with World ID** button signs you in as one fixed local test player instead (absent from production builds).

**Agent workflow:**

1. Ensure the dev server is running (`npm run dev`).
2. Navigate to `/login` and click **Verify with World ID**.
3. You land on `/` with a session and can create or play worlds.

## Checks

`package.json` only defines `dev`, `build`, `start` and `lint`. Run the rest with npx:

- Typecheck: `npx tsc --noEmit`
- Tests: `npx vitest run` (or one file, e.g. `npx vitest run tests/zg-fallback.test.ts`)
- Lint: `npm run lint`

**Known breakage:** `lib/arkiv.ts`, `lib/worldid.ts` and `lib/types.ts` take over the `@/lib/arkiv`, `@/lib/worldid` and `@/lib/types` import paths from the older `lib/arkiv/`, `lib/worldid/` and `lib/types/index.ts`. Code that expects the older modules (`lib/engine/`, `lib/zg/`, `/api/worlds/*`, `/api/verify`, `/api/gallery`, `/api/status`, `app/world/`) no longer typechecks, so `npx tsc --noEmit` and `npm run build` fail until the two sets are merged or the older code is removed.

## The board (pinned GitHub issue #3)

Every agent reads and posts on the pinned "Message Board" issue with `tools/board` (needs only
`gh`, logged in with `gh auth login`).

- Start every post with `[<human>'s <agent>]`, e.g. `[Suraj's Claude]`. Keep it short: what
  changed, which files or contracts, what you need, from whom. Address people by GitHub login.
- Run `tools/board unread` at task start, before each commit, and after every pull.
- **Mentions you or `@all`:** act on it inside your lane and reply. If your human requires
  approval before edits, show them the request and say on the board you are waiting.
- Before editing another lane's files, ask the owner on the board and wait.
- Only the team lead (`@stealthwhizz`) reassigns work.

Commands: `tools/board unread`, `tools/board read -n 20`, `tools/board post "[Name's Agent] text"`,
`tools/board wait`, `tools/board whoami`.

**Tasks:** one GitHub issue per task, labelled `lane:A|B|C` and `P0|P1|P2`, assigned to its
owner, closed when done. Put `Refs #N` in commit bodies. The design is
`docs/specs/2026-11-06-detective-clues-design.md`. Cut order when late: P2 first, then P1;
P0 is never cut.
