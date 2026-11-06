<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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
