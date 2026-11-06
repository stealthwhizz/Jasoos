<p align="center">
  <picture>
    <img src="public/jasoos-banner.png" alt="ETH Jasoos" width="720">
  </picture>
</p>

# ETH Jasoos — describe a scene, walk into it

**An AI game studio that runs while you play.** Type one sentence — *"a
rain-flooded night market in Mumbai, I'm a courier carrying a tiffin box
someone will kill for"* — and thirty seconds later you're **walking through
that world with arrow keys**: a top-down retro-RPG street painted on 0G Private
Computer, a player character forged in the same art style, buildings you can
enter, characters who speak to you out loud, and one hidden mystery that
converges to a finale.

## Why generation is load-bearing

This is not a prompt-box-to-image app. The game **cannot exist** without
fast, cheap, high-volume generation:

- Every visible thing is generated at play-time: the street, the player
  sprite, every interior, the finale frame. Nothing is pre-made.
- **Spatial prefetch:** the moment the street appears, all 3 interiors
  generate **in parallel while you walk** — so pressing E at a door is
  instant. The HUD shows it live: *"rooms pre-building 2/3"* → *"all rooms
  pre-built · doors open instantly."*
- A single 5-minute run fires **~20+ model calls** (level-design text,
  image renders, vision passes, dialogue turns, TTS lines) — visible in the
  in-game "AI generations this run" ticker. Images run on 0G at a few cents
  each, so a full playthrough costs well under a dollar.



## The pipeline per scene

<img width="765" height="645" alt="Screenshot 2026-07-11 at 6 39 56 PM" src="https://github.com/user-attachments/assets/655d9215-4dc4-4542-a39e-68899f742593" />


**Dialogue:** each NPC guards one clue of the world's single mystery.
Conversations are bounded — the clue must surface by the second exchange and
the chat closes by the third. NPC lines are voiced with **Sarvam Bulbul v3**.
Collect all 3 clues → **"Unravel the truth"** → a generated finale frame +
the secret, spoken aloud.

## Stack

| Piece | Role |
| --- | --- |
| 0G `bytedance/seedream-5.0-flash` (`ZG_IMAGE_MODEL`) | streets, interiors, sprite, finale — all live |
| 0G `0gm-1.0-35b-a3b` (`ZG_CHAT_MODEL`) | universe + story arc, level design, NPC dialogue |
| 0G `qwen3-vl-plus` (`ZG_VISION_MODEL`) | walkability vision: reads each frame into hotspots |
| World ID | sign-in: one verified human, one player id (a hash of the nullifier) |
| Arkiv (rabdi testnet) | saved worlds and scenes, one entity each |
| Sarvam Bulbul v3 | every NPC line + the finale, spoken |
| OpenAI (optional) | backup for the older `lib/zg` engine only; labelled `openai/<model>` in the ticker |
| PostHog (optional) | product analytics, proxied through `/ingest` |

0G image models are text-to-image only, so the previous frame is not passed as
a reference: the style bible in every prompt keeps the look consistent, and
neighbouring screens may not line up exactly at their edges.

## Run it

```bash
npm install
cp .env.example .env.local   # then set ZG_COMPUTE_API_KEY and FREE_GAME_LIMIT (see below)
npm run dev                  # http://localhost:3000
```

Next reads `.env.local` only at startup, so restart `npm run dev` after
changing it.

### Environment variables

Only two are needed to create and play a world locally:

| Variable | Needed for | Default / without it |
| --- | --- | --- |
| `ZG_COMPUTE_API_KEY` | **every** text, vision and image call (0G router key, `sk-...`, from pc.0g.ai) | creating a world fails |
| `FREE_GAME_LIMIT` | worlds each player may create | `0` = creation is off (gallery only) |
| `ZG_COMPUTE_BASE_URL` | 0G router | `https://router-api.0g.ai/v1` |
| `ZG_CHAT_MODEL` · `ZG_VISION_MODEL` · `ZG_IMAGE_MODEL` | model ids | `0gm-1.0-35b-a3b` · `qwen3-vl-plus` · `bytedance/seedream-5.0-flash` |
| `WORLD_APP_ID` · `WORLD_RP_ID` · `WORLD_RP_SIGNING_KEY` | real World ID sign-in (QR code) | dev builds sign in a local test player |
| `WORLD_ACTION_ID` · `WORLD_ENVIRONMENT` | World ID action and proof environment | `sign-in` · `staging` (simulator proofs) |
| `SESSION_SECRET` | signing the session cookie | fixed dev secret; **required in production** |
| `SARVAM_API_KEY` (+ `SARVAM_TTS_MODEL`, `SARVAM_TTS_LANGUAGE`) | NPC voices | NPCs are silent |
| `ARKIV_SIGNER_KEY` · `ARKIV_RPC_URL` · `ARKIV_ACCESS_KEY` · `ARKIV_PROJECT_ID` | saving worlds on Arkiv | in-memory store, lost on restart |
| `MYSTERY_SEAL_KEY` | sealing the mystery answer (older `lib/arkiv/` only) | falls back to `ARKIV_SIGNER_KEY` |
| `UNLIMITED_PLAYERS` | comma-separated player ids that skip `FREE_GAME_LIMIT` | none |
| `ASSET_DIR` | where generated images are saved | `.data/assets` |
| `NEXT_PUBLIC_SESSION_TIME_LIMIT_SEC` | play-session timer, in seconds | `300` |
| `OPENAI_API_KEY` (+ `OPENAI_*_MODEL`) | backup for `lib/zg` only | no backup |
| `ZG_MANAGEMENT_KEY` | showing the 0G credit balance (`mk-...`) | balance hidden |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` · `NEXT_PUBLIC_POSTHOG_HOST` | analytics | no events sent |

Keep real keys in `.env.local` only; `.env.example` holds placeholders.

Auth is required: unauthenticated visitors are sent to `/login`. Generation
APIs return `401` without a valid session.

Controls: **WASD / arrows** move · **E** enter / talk · **1–3** replies ·
type anything to any character · **Esc** leave.

## Auth (World ID)

Sign-in is **World ID proof of human**. Configure once at the
[World Developer Portal](https://developer.world.org): create an app and an
action (`WORLD_ACTION_ID`, default `sign-in`), then set `WORLD_APP_ID`,
`WORLD_RP_ID` and `WORLD_RP_SIGNING_KEY`. `WORLD_ENVIRONMENT=staging` accepts
proofs from the [simulator](https://simulator.worldcoin.org).

The server verifies each proof with the Developer Portal and stores only a
salted hash of the nullifier as the player id, in a signed cookie
(`SESSION_SECRET`, required in production).

With no World ID keys and `NODE_ENV=development`, the login page signs you in
as one local test player instead.

## Persistence (Arkiv + local assets)

Each saved world is a `game` entity on Arkiv (rabdi testnet, chain id
`7794095`) and each saved screen is a `scene` entity, both tagged
`project = ARKIV_PROJECT_ID`. Set `ARKIV_SIGNER_KEY` to a funded burner key
([faucet](https://hub.arkiv.network/faucet)) and `ARKIV_ACCESS_KEY` for the
non-rate-limited RPC. Without a signer key, an in-memory store stands in
(lost on restart).

Generated images are saved under `ASSET_DIR` (default `.data/assets`) and
served from `/api/assets/...`.

`FREE_GAME_LIMIT` defaults to `0`, which is gallery-only mode: nobody can
create a world. Set it above zero to allow creation, and list player ids in
`UNLIMITED_PLAYERS` to let them bypass the limit.

## Impact in India

Jasoos ("detective") turns any Indian setting — a Chandni Chowk gali, Kerala
backwaters, a Himalayan pilgrimage — into a playable, voiced world in
seconds, with zero art budget. That unlocks: regional storytelling and
folklore preservation in any of India's languages (swap the TTS voice),
game-based learning where a classroom describes a historical scene and walks
through it, and a path for India's indie game developers — the cost of world
art drops from lakhs to paise.

## Project map

| Path | Role |
| --- | --- |
| `lib/world-engine.ts` | universe/story/scene/sprite/dialogue/voice/finale generation |
| `lib/gemini.ts` | 0G client: chat/vision with retries, image generation (historical file name; no Gemini code) |
| `lib/games.ts` | saved-image files, row mapping, creation quota |
| `lib/sarvam.ts` | Sarvam Bulbul v3 voices |
| `lib/music.ts` · `lib/sfx.ts` | generative background music, UI sound effects |
| `lib/zg/` · `lib/engine/` | older engine with the OpenAI backup (see Known issues) |
| `lib/worldid.ts` | World ID proof check, signed session cookie, `requireUser()` |
| `lib/arkiv.ts` | game + scene records on Arkiv (in-memory without a signer key) |
| `proxy.ts` | redirect visitors without a valid session to `/login` |
| `app/login` · `app/api/session` | World ID sign-in / sign-out |
| `app/api/games/*` · `app/api/profile` | saved worlds REST API + creation quota |
| `app/play/[gameId]` | load a saved world (create starts on Home) |
| `components/Home.tsx` | gallery-forward landing + create entry |
| `components/World.tsx` | orchestrator: scene cache, parallel prefetch, clues, finale, persistence |
| `components/GameCanvas.tsx` | canvas loop: movement, collision, hotspots, sprite |
| `components/DialogueBox.tsx` | voiced NPC conversations |
| `docs/` | see below |

## Docs

| File | What it covers |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | product requirements, HLD and LLD for the detective world (target spec) |
| [`docs/specs/2026-11-06-detective-clues-design.md`](docs/specs/2026-11-06-detective-clues-design.md) | detective clues, overworld, lane split |
| [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) | the play loop and which model does what |
| [`docs/DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md) | screens, play-screen anatomy, visual language |
| [`docs/CHOICE_MODE_PRD.md`](docs/CHOICE_MODE_PRD.md) | the earlier turn-based choice mode (code kept, not routed) |
| [`docs/TEAM_STATUS.md`](docs/TEAM_STATUS.md) | lane status |
| [`AGENTS.md`](AGENTS.md) | conventions for AI agents and the team message board |

## Checks

```bash
npm run lint
npx tsc --noEmit
npx vitest run
```

`package.json` has no `test` or `typecheck` script yet, hence `npx`.

## Known issues

- **Two module sets collide.** `lib/arkiv.ts`, `lib/worldid.ts` and
  `lib/types.ts` take over the import paths of the older `lib/arkiv/`,
  `lib/worldid/` and `lib/types/index.ts`. The older engine and routes
  (`lib/engine/`, `lib/zg/`, `/api/worlds/*`, `/api/verify`, `/api/gallery`,
  `/api/status`, `app/world/`) no longer typecheck, so `npm run build` fails.
  The explorable world on `/` and `/play/[id]` does not use them.
- **No OpenAI fallback in the new game.** Only `lib/zg` falls back to OpenAI;
  `lib/gemini.ts` needs `ZG_COMPUTE_API_KEY`.
- **Dialogue trusts the client.** `/api/dialogue` takes the world bible,
  mystery included, from the request body.
