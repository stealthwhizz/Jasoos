# Jasoos: Product Requirements, HLD and LLD\

Nov 6, 2026 · @Amogh Sunil

> This is the target spec. For what the current build actually runs (routes, env vars, known gaps), see the [README](../README.md). The earlier turn-based choice mode has its own document: [CHOICE_MODE_PRD.md](CHOICE_MODE_PRD.md).

## Overview

Jasoos turns one sentence into a world you can walk through. The player types a scene, such as "a rain-flooded night market where I carry a tiffin box someone will kill for", and soon after walks its streets with the arrow keys, enters buildings, talks to characters, and solves one hidden mystery.

### The problem

Building even a small playable world takes art, level design, and code. Image generators give people a picture, not a place they can enter. Feeds fill with AI output that no one can trace to a model or a person.

### The product

Every visible part of a world is generated while you play: the street, the character, each interior, the NPC dialogue, and the finale. All of it runs on models served by 0G Private Computer, and each call shows its request ID on screen. Creators are verified humans. Worlds are stored in Arkiv, so they are public, owned by their creator, and readable by any app, and they fade unless people keep playing them.

### Terms used in this document

- **World bible:** the structured plan for one world: title, premise, art style, three locations, three NPCs, and one mystery.
- **Scene:** one generated image the player can stand in, either the street or an interior.
- **Hotspot:** a door or character the player can interact with.
- **Clue:** a fact an NPC reveals. Three clues unlock the finale.

### Goals for ETHGlobal Mumbai

- A working path a judge can try: type any sentence, walk the result, and solve the mystery.
- Qualify for 0G Private Computer, Build on Arkiv, and World IDKit, one job per sponsor.
- Give people a reason to return tomorrow: a mystery of the day and a living gallery.

### Non-goals

Multiplayer, payments or staking, a native mobile app, user-uploaded art, and any real-money feature. Voiced dialogue is a stretch item.

## Users and journeys

| Role     | Who                                | Wants                                       | Does in the app                                                                  |
| -------- | ---------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Maker    | A person who creates a world       | A playable result fast, and ownership of it | Verifies with World ID, types a sentence, plays, shares                          |
| Explorer | Anyone who plays a published world | Something new to walk through each day      | Browses the gallery, plays, collects clues, solves the mystery                   |
| Judge    | A reviewer at the event            | Proof that AI is doing the work             | Types their own sentence, reads the generation ticker, checks the Arkiv entities |

Explorers do not need to verify. Only creating a world requires proof of human.

### The core loop

1. **Verify.** A maker proves they are human with World ID. This happens once.
2. **Describe.** The maker types one sentence.
3. **Watch it build.** A ticker lists each model call with its request ID. The street appears first.
4. **Walk.** The player moves with the arrow keys while the interiors build in the background.
5. **Enter and talk.** Each building holds one NPC. Each NPC reveals one clue.
6. **Solve.** Three clues unlock the finale: a generated frame and the secret, written out.
7. **Publish.** The world joins the gallery. Others can play it, and it fades if nobody does.
8. **Return.** A mystery of the day and the gallery give a reason to come back.

### Paths that do not go well

- **No proof of human:** the maker can browse and play but cannot create. The screen says why.
- **Daily limit reached:** the maker sees when the next slot opens.
- **A generation call fails:** the app retries once, then shows a labelled placeholder with the request ID and keeps the game running.

## Requirements

P0 items must work in the live demo. P1 items add depth if time allows. P2 items come after the hackathon.

| ID  | Priority | Requirement                                                                         | Acceptance                                                                              |
| --- | -------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R1  | P0       | Check each prompt before any image is generated                                     | A refused prompt triggers no image call and shows a reason                              |
| R2  | P0       | Turn the prompt into a world bible with a chat model                                | The output matches the bible schema. Invalid output is retried once.                    |
| R3  | P0       | Generate the street, the character sprite, and three interiors with 0G image models | Interior requests start as soon as the bible exists, not after the street               |
| R4  | P0       | Analyze the street image with a vision model to find walkable areas and doors       | The result is a walk mask and a list of door rectangles linked to locations             |
| R5  | P0       | Walk the street with the keyboard                                                   | Arrow keys or WASD move the character. The mask blocks it. E interacts.                 |
| R6  | P0       | Enter buildings                                                                     | An interior opens at once when ready, and shows a clear "still building" state when not |
| R7  | P0       | Talk to one NPC per interior                                                        | Each NPC reveals its clue by the second reply, and the chat closes by the third         |
| R8  | P0       | Unlock a finale after three clues                                                   | A generated image and the secret appear                                                 |
| R9  | P0       | Show a live generation ticker                                                       | Every call lists its kind, model, latency, and request ID                               |
| R10 | P0       | Require proof of human to create a world                                            | The backend verifies the World ID proof. An unverified user can play but cannot create. |
| R11 | P0       | Publish worlds to Arkiv and read the gallery from Arkiv                             | A world is an Arkiv entity owned by its creator. The gallery page runs an Arkiv query.  |
| R12 | P0       | Limit creation per human per day                                                    | A creation record in Arkiv expires after 24 hours, and the live count is the quota      |
| R13 | P1       | Sign in with a 0G account and show credits being spent                              | The balance drops as the user plays. Shown on localhost, where the 0G sign-in works.    |
| R14 | P1       | Store image bytes on 0G Storage                                                     | The Arkiv entity holds only references                                                  |
| R15 | P1       | Offer a mystery of the day                                                          | One fixed prompt per day, with its own leaderboard                                      |
| R16 | P1       | Record solvers on a leaderboard                                                     | Solve records are Arkiv entities that expire after a day                                |
| R17 | P1       | Give each world a share link                                                        | The link opens the world directly                                                       |
| R18 | P1       | Read NPC lines aloud with browser speech                                            | Optional toggle                                                                         |
| R19 | P2       | Show other players in the same world                                                | Presence entities that expire in seconds                                                |
| R20 | P2       | Voiced dialogue from a model                                                        | Not planned for Mumbai                                                                  |

## Detective mode: hidden clues

Detective mode turns the mystery into a case file. Some clues sit in plain sight, inside text and images that look ordinary, and the player needs a tool to see them. It is P1: build it after the core loop works.

### How it plays

- **Hidden notes.** Interiors hold written items: a letter, a shopping list, a courier slip. All read as everyday text. One of them hides a short secret in its word choices.
- **The Decoder.** A tool the player carries. It highlights the hidden word choices in a note and reads out the secret. On ordinary text it says nothing is hidden.
- **Chain of custody.** Every evidence item shows the model and the 0G request ID that produced it.
- **One accusation per detective.** To close the case the player names the culprit. World ID allows one accusation per person per case, so nobody can brute-force the answer. The server checks the answer, and the culprit is never sent to the browser before a correct accusation.
- **Cold cases.** The case file is the world entity. It expires unless people work it, so a neglected case goes cold and leaves the gallery.
- **A second trust moment.** World ID now gates two actions: creating a world and making an accusation.

### Detective requirements

| ID  | Priority | Requirement                                   | Acceptance                                                                                   |
| --- | -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R21 | P1       | One interior holds a note that hides a secret | The note reads naturally, and the Decoder recovers the exact secret                          |
| R22 | P1       | A Decoder tool                                | It highlights the hidden choices, shows the secret, and says "nothing hidden" on normal text |
| R23 | P1       | Chain of custody on evidence                  | Each evidence item shows its model and request ID                                            |
| R24 | P1       | One accusation per human per case             | The server checks the answer. A second attempt by the same person is refused.                |
| R25 | P1       | Cold cases                                    | The gallery shows live cases only. An expired case disappears.                               |
| R26 | P2       | A hidden code in an image                     | A "UV lamp" filter reveals it                                                                |
| R27 | P2       | A keyed note                                  | The Decoder needs a passphrase that an NPC reveals                                           |

### Hidden-note codec

The goal is a puzzle, not strong secrecy.

- **The secret** is a short code, such as a few letters from a small alphabet, plus a check value so the Decoder can tell a real message from chance.
- **The codebook** is a fixed table of interchangeable word pairs, for example (quick, fast) or (large, big). Use words that do not change form, or list each form in the table. The cover text carries no marker.
- **Encoding.** The engine asks the chat model for a short everyday note that uses at least as many codebook words as the secret needs. For each codebook word in order, it picks the first or second word of the pair to match the next bit. If the note has too few slots, regenerate once.
- **Decoding.** The Decoder reads the codebook words in order, one bit each, groups the bits, reads the secret, and checks the check value. A pass means a hidden message. A fail means ordinary text.
- **Capacity** is about one bit per slot, so keep secrets short.
- **Test.** Run a round trip over many generated notes and record the failure rate. If the model rewrites a word's form, the round trip fails, so check for it.

### Hidden image code (P2)

After generation, convert the image to a lossless format and write a short code into the lowest bit of the pixel values. The UV lamp reads that bit plane and shows the code. Any re-compression or scaling destroys it, so read the image at its natural size from the stored bytes, and test the whole path before relying on it.

### Accusation entity

| Entity       | Attributes                 | Payload | Expires       |
| ------------ | -------------------------- | ------- | ------------- |
| `accusation` | world key, hashed human ID | Result  | With the case |

Before accepting an accusation, the server queries for a live entity with the same world key and hashed human ID.

### Limits

This is a game mechanic, not security. A determined player can read the codebook from the app or the notes from the manifest. A stronger scheme is possible, where a language model codes bits in word choices at every position and decoding needs the same pinned model. It needs deterministic local inference, so it is out of scope for Mumbai.

## Non-functional requirements and success measures

### Non-functional requirements

| Area            | Requirement                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speed           | The street and character appear first, and the player can move before the interiors finish. Measure time to first playable scene in the first rehearsal, then set a target. |
| Reliability     | Every external call has a timeout, one retry, and a labelled fallback. The game never shows a blank screen.                                                                 |
| Cost control    | Each maker has a credit cap. A global switch pauses creation when 0G credits run low.                                                                                       |
| Safety          | Prompts and generated text pass moderation. Arkiv entities hold no personal data.                                                                                           |
| Provenance      | Every generated asset stores the 0G request ID of the call that made it.                                                                                                    |
| Accessibility   | Keyboard-only play. Each scene carries a text description from the world bible.                                                                                             |
| Browsers        | Current desktop Chrome and Firefox first. Mobile browsers later.                                                                                                            |
| Reproducibility | A saved world bible can be replayed, so a judge can rerun a demo world. Image output will still vary.                                                                       |

### Success measures

Set numeric targets after the first end-to-end rehearsal. Until then, track these:

- Time from submitting a sentence to walking in the street.
- Share of runs that reach the finale with no failed generation.
- Worlds created and distinct humans who played during the demo window.
- Generation cost per completed run, in 0G credits.

## Sponsor integration

Three partner prizes, one job each. ETHGlobal allows three partner picks, and Arkiv's own prizes count as one. Check with staff whether any other 0G track would count separately.

| Sponsor             | Prize track                                                                 | Job in the product                                                 | What breaks if removed                                                                  |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 0G Private Computer | Build with 0G Private Computer: $5,000 (1st $2,500, 2nd $1,500, 3rd $1,000) | Every image, the vision analysis, the world plan, and the dialogue | Nothing can be generated, so the world cannot exist                                     |
| Arkiv               | Build on Arkiv, from scratch: $4,000 (1st $3,000, 2nd $1,000)               | World index and ownership, gallery, daily quota, visits, solves    | The gallery would need our own database, and no other app could read it without our API |
| World ID            | Best Use of IDKit: $2,500, up to 2 teams of $1,250                          | Proof of human before creating a world                             | Bots could drain credits and fill the gallery with spam                                 |

### 0G: what judges check

- Inference on 0G Private Computer in the main flow, with request IDs. The ticker shows them.
- A working app a judge can try, with a clear reason to return tomorrow. The mystery of the day and the fading gallery answer that.
- One sentence on what breaks without 0G, as in the table.
- Bonus: a user signs in with their 0G account and their credit balance drops as they play. The 0G sign-in only works on localhost ports 3000, 3001, and 5173, so show this part on localhost. The public demo link uses World ID and guest play instead.
- Not wanted: a generic chat wrapper, or an app where the AI call could be removed unnoticed.
- Models planned: an image model (seedream, hy-image, or z-image), qwen vision for map analysis, and a chat model chosen after testing, for example 0gm-1.0.
- Submission: project name and description, public repo with README and setup, a demo video under 3 minutes, a live demo link, and team contacts on Telegram and X.

### Arkiv: what judges check

The testnet is "rabdi" (chain ID 7794095), used through `@arkiv-network/sdk` or JSON-RPC.

- Built from scratch at Mumbai, and the app writes to Arkiv testnet.
- At least one user-facing feature reads from Arkiv. The gallery does. An SDK that is installed but never read does not count.
- The README lists the wallet addresses that wrote entities and one query anyone can run.
- Files under `/arkiv/`: `schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, and `how-you-use-arkiv.md`.
- Public repo, open-source license, and a note on how AI was used.
- Scoring: four criteria at 25% each: Arkiv feedback, reach, why Arkiv, and how you use Arkiv.

**Draft answer to "why Arkiv":** the gallery is a public query that any app can run without our API. The daily limit and the fading of worlds come from entity expiry, with no scheduled job. The creator's wallet owns the world entity. **What stays off Arkiv:** image bytes, World ID checks, moderation, and model calls. Expired entities leave the live database but remain in transaction history, so no personal data goes in an entity.

### World ID: what judges check

- IDKit works in a functioning app, and the proof is verified on the server.
- The README explains the trust moment: creating a world spends shared compute. Proof of Human is the minimum credential that fits, because the app needs one unique person and nothing about age or nationality.
- The demo shows one successful verification and one alternative path, an unverified user who cannot create.
- A short debrief covers time to first success, friction, and the one change that would help most.

## High-level design

The browser talks to one app server. The server calls four sponsor services, and each service has one job.

&#91;embedded content: system architecture · 3 layers, 4 sponsor services\]

The browser holds the game. The World API checks who may create and publishes the result. The World engine does the generation work and calls 0G. The Dialogue service keeps NPC replies inside the rules.

### Components

| Component        | Responsibility                                                                   | Suggested tech                                      |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Home and gallery | Prompt box, World ID prompt, list of live worlds from an Arkiv query             | React with Next.js, IDKit client                    |
| Game canvas      | Draws the scene and sprite, collision on a grid, door and NPC hotspots           | HTML canvas                                         |
| Dialogue panel   | NPC chat, clue tracker, finale                                                   | React                                               |
| World API        | Session and proof check, daily quota, publish, gallery, visits                   | Node route handlers                                 |
| World engine     | Moderation, planning, image and vision calls, prefetch scheduling, ticker events | Node module, OpenAI-compatible client pointed at 0G |
| Dialogue service | Applies the clue and turn rules to each NPC reply                                | Node module                                         |

### Data flow: creating a world

1. The maker verifies with IDKit. The World API verifies the proof on the server and marks the session.
2. The maker submits a sentence. The API counts live creation records for that person in Arkiv to apply the daily limit.
3. The engine moderates the prompt, then plans the world bible with a chat model.
4. The engine requests the street, the sprite, and three interiors in parallel. It then runs the vision pass on the street image.
5. Each call streams an event to the browser through server-sent events. The ticker shows its kind, model, latency, and request ID.
6. Once the street, sprite, and map are ready, play starts. The interiors finish while the player walks.
7. When all assets are ready, the engine saves images and a manifest to 0G Storage. The API writes the world entity and a creation entity to Arkiv.

### Data flow: playing a world

1. The gallery runs an Arkiv query for live worlds and shows them.
2. The player opens one. The app loads the manifest and images, and writes a short-lived visit entity.
3. The player talks to NPCs through the Dialogue service and collects clues.
4. On solving, the app writes a solve entity for the leaderboard.

### Key decisions

| Decision      | Choice                                                                                | Reason                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Interiors     | Generate in parallel with the street, not after it                                    | Hides latency, so doors open instantly. A shared style prompt keeps the look consistent.                                                      |
| Image bytes   | 0G Storage, with references in Arkiv                                                  | Keeps entities small. I have not confirmed Arkiv payload limits.                                                                              |
| Arkiv writes  | One server-held signer wallet at first                                                | Fastest to build. The weakness: creators do not truly own entities. State this in Known limits, and move to per-maker wallets if time allows. |
| Gallery reads | From the browser straight to Arkiv, with a server proxy as a fallback                 | Shows that any app can read the data. The proxy covers a blocked browser call.                                                                |
| Failures      | One retry, then a labelled placeholder                                                | The game keeps running, and the request ID stays visible                                                                                      |
| Sign-in       | World ID for makers, none for explorers, 0G account on localhost for the credit bonus | Keeps the public demo simple                                                                                                                  |

## Low-level design: generation pipeline and modules

The pipeline starts three branches the moment the world bible is valid. The street and sprite unlock play. The interiors finish later.

&#91;embedded content: generation pipeline · 5 steps, 3 parallel branches\]

The vision pass waits for the street image. The other branches do not wait for it. The publish step runs once every branch has finished or failed.

### Module specs

| Module          | Input                        | Output                       | Notes                                                                         |
| --------------- | ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `moderate`      | Text                         | Allowed flag and reason      | Runs on the prompt and on every generated NPC line                            |
| `planWorld`     | Prompt                       | World bible                  | One chat call with a JSON schema. Retry once if invalid.                      |
| `generateImage` | Kind, prompt, art style      | Image, request ID, latency   | Every image prompt starts with the bible's art style                          |
| `analyzeStreet` | Street image                 | Walk map and doors           | Vision call, then a fallback map if the result is unusable                    |
| `scheduler`     | World bible                  | Asset states                 | Starts sprite, street, and interiors at once, within the rate limit 0G allows |
| `dialogueTurn`  | NPC, history, message, state | Reply, clue flag, close flag | Enforces the clue and turn rules in code, not only in the prompt              |
| `publishWorld`  | Manifest and images          | World key and creation key   | Saves to 0G Storage, then writes to Arkiv                                     |
| `ticker`        | Call results                 | Events to the browser        | Sent over server-sent events                                                  |

### World bible schema

| Field               | Type      | Meaning                                                      |
| ------------------- | --------- | ------------------------------------------------------------ |
| `title`             | text      | World name                                                   |
| `premise`           | text      | One paragraph that frames the player's role                  |
| `artStyle`          | text      | Style words reused in every image prompt                     |
| `streetDescription` | text      | What the street image should show, including three doors     |
| `protagonist`       | text      | Description for the sprite                                   |
| `locations`         | list of 3 | Each has an id, a name, an interior description, and one NPC |
| `locations[].npc`   | object    | Name, persona, and the clue this NPC holds                   |
| `mystery`           | object    | The secret, plus the prompt for the finale image             |

### Algorithms

**Walk map.** Ask the vision model for walkable ground as polygons and doors as rectangles, in coordinates from 0 to 1. Draw the polygons onto a coarse grid, for example 96 by 54 cells. A move is allowed only if the character's feet land on a walkable cell. If the JSON is invalid or empty, retry once. After that, use a fallback: the lower third of the image is walkable, and doors follow the order of the bible's locations.

**Sprite.** The prompt asks for one flat background color. Remove pixels near that color with a tolerance, trim the edges, and flip the image for left and right moves.

**Prefetch.** Each interior has a state: pending, ready, or failed. At a door, a ready interior opens at once. A pending one shows "still building". A failed one shows a labelled placeholder room.

**Dialogue rules.** Each NPC keeps a state with the turn count and a clue flag. The server builds the prompt from the persona and the clue. On the second reply, if the clue has not appeared, the server adds an instruction to reveal it now. After the third reply, it sets the close flag. Replies have a length cap, and the secret is never in an NPC prompt.

**Finale.** After three clues, generate one image from the finale prompt, then show it with the secret text from the bible.

**Ticker event.** Each event carries an id, a kind (moderation, plan, image, vision, or dialogue), the model, the start time, the latency, the 0G request ID, and a status.

**Failures.** Each call has a timeout per kind, set after measuring in the first rehearsal. A failed call gets one retry. After that, the asset is marked failed, a placeholder takes its place, and the game continues.

## Low-level design: data model, APIs, and configuration

### Arkiv entities

Every entity carries a `project` attribute set to this app's unique identifier, plus an `entityType` attribute. Filter on those two first.

| Entity     | Owner                                      | Queryable attributes                     | Payload                                                    | Expires                                                                |
| ---------- | ------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `world`    | Server signer at first, maker wallet later | title, theme tags, language, created day | Manifest reference on 0G Storage and a thumbnail reference | Set at publish. Extended on play if Arkiv allows it.                   |
| `creation` | Server signer                              | hashed human ID, world key               | None                                                       | 24 hours after creation. The live count per person is the daily quota. |
| `visit`    | Server signer                              | world key                                | None                                                       | A short window, so the live count shows how active a world is          |
| `solve`    | Server signer                              | world key, day, hashed solver ID         | Clue count and time                                        | End of the day, for the daily leaderboard                              |

The hashed human ID is derived from the World ID result for this app's action. Guests use a random session ID. No names, wallet addresses of players, or prompts' personal details go in an entity.

### Queries the app runs

- Live worlds: `entityType = world`, newest first.
- Daily quota: count of `creation` entities for one hashed human ID.
- World activity: count of `visit` entities for one world key.
- Daily leaderboard: `solve` entities for one day.

I have not confirmed that Arkiv queries can sort. If they cannot, sort in the app and record it in `friction.md`.

### Manifest stored on 0G Storage

The manifest is one JSON file: the world bible, the walk map, the doors, and a list of assets. Each asset has an id, a kind, its storage root, the model used, and the 0G request ID. The request IDs give every image its provenance.

### API endpoints

| Method and path                 | Purpose                                                | Notes                                                                       |
| ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `POST /api/verify`              | Receive the World ID proof and verify it on the server | Sets a verified flag on the session                                         |
| `POST /api/worlds`              | Start a creation job from a prompt                     | 401 if not verified, 429 if over the daily limit, 503 if creation is paused |
| `GET /api/worlds/:jobId/events` | Stream ticker events and asset states                  | Server-sent events                                                          |
| `GET /api/worlds/:id`           | Return a world's manifest                              | Public                                                                      |
| `GET /api/gallery`              | Return live worlds                                     | Server copy of the Arkiv query, used if the browser cannot read Arkiv       |
| `POST /api/worlds/:id/visit`    | Record a visit                                         | Writes a `visit` entity                                                     |
| `POST /api/dialogue`            | One NPC turn                                           | Returns the reply, a clue flag, and a close flag                            |
| `POST /api/worlds/:id/solve`    | Record a solve                                         | Writes a `solve` entity                                                     |
| `GET /api/daily`                | Return the mystery of the day                          | P1                                                                          |
| `GET /api/status`               | Report whether creation is paused and credits remain   | Used by the home page                                                       |

### Configuration

| Setting                                                             | Meaning                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| `ZG_COMPUTE_BASE_URL`, `ZG_COMPUTE_API_KEY`                         | 0G Private Computer endpoint and key, from the 0G docs |
| `ZG_IMAGE_MODEL`, `ZG_VISION_MODEL`, `ZG_CHAT_MODEL`                | Model names, chosen after the first speed test         |
| `ZG_STORAGE_*`                                                      | 0G Storage SDK settings                                |
| `ARKIV_RPC_URL`, `ARKIV_CHAIN_ID`                                   | The Arkiv testnet values from the sponsor page         |
| `ARKIV_SIGNER_KEY`, `ARKIV_PROJECT_ID`                              | Server signer and this app's unique identifier         |
| `WORLD_APP_ID`, `WORLD_ACTION_ID`                                   | From the World developer portal                        |
| `CREATION_LIMIT_PER_DAY`, `CREDIT_CAP_PER_MAKER`, `CREATION_PAUSED` | Cost controls and the global switch                    |

### Repository layout

| Path          | Contents                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `app/`        | Pages and API route handlers                                                                                |
| `components/` | Home, gallery, game canvas, dialogue panel, ticker                                                          |
| `lib/engine/` | `moderate`, `planWorld`, `generateImage`, `analyzeStreet`, `scheduler`, `dialogueTurn`                      |
| `lib/arkiv/`  | Entity read and write helpers                                                                               |
| `lib/zg/`     | The 0G client wrapper that records every request ID                                                         |
| `arkiv/`      | The files Arkiv judges read: `schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` |

### Security

All keys stay on the server. The server verifies every World ID proof. Creation is rate limited and moderated. Moderation also runs on generated NPC lines before they reach the player.

### Test plan

- **Unit:** walk-map drawing and collision, the dialogue clue and turn rules, and quota counting.
- **Integration:** one full creation run against saved model responses.
- **Rehearsal:** several creations at once, to measure time to first scene and the rate-limit behavior of 0G.
- **Failure injection:** a 0G timeout, invalid JSON from the plan call, and a blocked browser read of Arkiv.

## Build plan

Build the core loop first and cut from the bottom. Commit often, since a steady history reads as real work.

### Phase 0: prove the risky parts

- [ ] One image call, one vision call, and one chat call on 0G. Record latency and request IDs, and choose the model names.
- [ ] One write and one read on Arkiv testnet, plus a test of whether an entity's expiry can be extended and whether a query can sort
- [ ] One World ID proof verified on the server, using the simulator
- [ ] Create the public repo with a license, a README skeleton, the `/arkiv/` files, and the AI-usage note

### Phase 1: generation pipeline

- [ ] `moderate` and `planWorld` with schema validation and one retry
- [ ] `generateImage` through a wrapper that records every request ID
- [ ] The scheduler: sprite, street, and three interiors started together
- [ ] The ticker over server-sent events

### Phase 2: the game

- [ ] Canvas rendering, sprite movement, and door hotspots
- [ ] `analyzeStreet` with the fallback map
- [ ] Interior view with the pending, ready, and failed states

### Phase 3: story

- [ ] `dialogueTurn` with the clue and turn rules enforced in code
- [ ] Clue tracker and the finale image

### Phase 4: Arkiv and World ID

- [ ] Verify route and the creation gate, including the blocked path
- [ ] `world`, `creation`, and `visit` entities, the gallery query, and the daily limit
- [ ] Save assets and the manifest

### Phase 5: detective mode

- [ ] Codebook, note generation, and the Decoder, with a round-trip test
- [ ] Chain-of-custody labels on evidence
- [ ] The accusation route, the `accusation` entity, and the one-per-human check

### Phase 6: submission

- [ ] The five `/arkiv/` files. Keep `friction.md` updated as you build.
- [ ] The World ID debrief
- [ ] A README with one section per sponsor, wallet addresses, one runnable Arkiv query, and a Known limits list
- [ ] A demo video under three minutes, a live link, and team contacts on Telegram and X

### Phase 7: stretch

- [ ] 0G account sign-in with a visible credit balance, on localhost
- [ ] 0G Storage for image bytes
- [ ] Mystery of the day and the solver leaderboard
- [ ] UV lamp image code

### Cut line

Cut from the bottom of this list: the UV lamp, keyed notes, the daily mystery and leaderboard, then 0G Storage (keep bytes in app storage and say so). Never cut the generation pipeline with its ticker, walking, one NPC mystery, the Arkiv gallery, or the World ID gate. Keep one saved backup world, labelled as a backup, for use only if the venue network fails.

## Team split

Three lanes, one owner each, with separate folders so merges stay clean. A is Amogh, B is Suraj, and C is Kishore. If someone is stronger in another lane, swap B and C freely. Keep the engine with whoever is best at prompts and API work, because it is the riskiest path.

| Person     | Lane                            | Owns                                                                        | Main deliverables                                                                                                                                                                           | Needs from others                                                 | Cut first                              |
| ---------- | ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| A: Amogh   | Engine, 0G, and detective logic | R1 to R4, the server side of R7 and R8, R9 events, R21, R22 logic, R23 data | `lib/engine`, `lib/zg`, the ticker stream, the codec with a round-trip test, a short report of model speeds and request IDs                                                                 | Fixture format agreed with B. Publish and storage helpers from C. | UV lamp, keyed notes                   |
| B: Suraj   | Game client and polish          | R5, R6, the UI of R7, R8, and R9, R17, R18, R22 UI                          | Canvas and collision, doors, interior states, dialogue panel, ticker UI, Decoder UI, gallery UI, visual polish, the demo flow                                                               | A fixture world from A. Gallery and verify components from C.     | Speech, share link                     |
| C: Kishore | Chain, identity, and submission | R10 to R12, R14 to R16, R24, R25                                            | World ID verify route and blocked path, Arkiv entities and queries, daily limit, accusation check, 0G Storage, the `/arkiv/` files, the README, the debrief, the video, the submission form | The manifest shape from A. Where to place components, from B.     | Daily mystery, leaderboard, 0G Storage |

### Agree in the first hour

These contracts let all three build in parallel.

- **Shapes.** The world bible, the manifest, the ticker event, and the API request and response shapes, as written in the design sections.
- **A's fixtures.** A writes one sample world with placeholder images and sample ticker events, so B can build the game before any model call works.
- **C's stubs.** C writes `publishWorld`, `listWorlds`, `countCreations`, `recordVisit`, and `recordAccusation` as functions that return fake data at first, so A and B can call them early.
- **One repo.** A owns `lib/engine`, `lib/zg`, and the codec. B owns `components` and the pages. C owns `lib/arkiv`, the chain routes, `arkiv/`, and the README. Shared types live in `lib/types`.

### Checkpoints

1. **After Phase 0.** Each person has run their risky call. A has one 0G image, vision, and chat call. B has a canvas showing the fixture world with walking. C has an Arkiv write and read, and one World ID proof verified. If any call fails, stop and regroup.
2. **Generation in the game.** A real 0G run renders in B's canvas, with no chain yet.
3. **Publish and gate.** C's gallery, daily limit, and World ID gate work with A's real worlds.
4. **Detective mode.** The hidden note, the Decoder, and the accusation work end to end.
5. **Freeze.** Stop adding features and start the submission pack. Run the demo twice start to finish.

### Working rules

- Commit small and often, and merge into main at every checkpoint. A steady history reads as real work.
- C leads the README. A and B each write their own sections and send C the screenshots.
- All three rehearse the demo. B drives the screen, A explains the technology, and C answers the sponsor questions.
- Anyone who finishes early takes the next unowned item from the cut-line list, starting from the top.

## Demo script

Run it live in the venue with a judge's own sentence. The recorded video must stay under three minutes, so use the shorter path marked below.

1. **Type a sentence.** A judge writes any scene. Show the home page with its status line.
2. **Verify and be refused.** The judge verifies with World ID and creation unlocks. In a second browser, an unverified visitor tries to create and is stopped with a clear message. This is the alternative path World asks for.
3. **Watch the ticker.** Calls scroll past with their model, latency, and 0G request ID. The street appears first. _(Video: include.)_
4. **Walk.** The HUD shows "rooms pre-building" and then "all rooms built". Enter a door and it opens at once. _(Video: include.)_
5. **Talk and read.** An NPC reveals a clue. Open a note that reads like small talk, then use the Decoder and watch it highlight the hidden word choices and read out the secret. Point to the chain-of-custody label with its request ID. _(Video: include.)_
6. **Open the gallery.** Show worlds read from Arkiv. Run the query from the README, then show a world entity with its owner and expiry, and a creation entity that counts toward the daily limit. _(Video: include.)_
7. **Accuse.** Name the culprit. A correct accusation unlocks the finale image. A second accusation by the same person is refused.
8. **Close.** Take any image, copy its request ID, and show where it came from. End on the sentence: "Every frame here was generated on 0G, and every world is a public record."
9. **On localhost only.** Sign in with a 0G account and show the credit balance dropping while you play. This is the bonus the 0G prize offers.

### Rehearsal checks

- Test every step on the venue network.
- Pre-fund the Arkiv signer and check the 0G credit balance.
- Keep a second verified person ready in case one proof fails.
- Keep the saved backup world ready, labelled as a backup.

## Risks and open questions

| Risk                           | Why it matters                                                                                                                   | Mitigation or status                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0G image speed and rate limits | The whole experience depends on fast images                                                                                      | Measure in Phase 0. Start interiors in parallel. Show the street first.                                                 |
| Walk map quality               | A bad map traps the player or lets them walk through walls                                                                       | Retry once, then use the fallback map                                                                                   |
| Style drift                    | A sprite that does not match the scene looks broken                                                                              | One shared style prompt, and a flat background that is keyed out                                                        |
| Arkiv unknowns                 | Extending expiry, sorting, payload size, and write speed are all unconfirmed. Expired entities also stay in transaction history. | Test in Phase 0, record results in `friction.md`, and keep personal data out of entities                                |
| Ownership claim                | A server-held signer means makers do not truly own their world entities                                                          | Say so in Known limits. Move to per-maker wallets if time allows.                                                       |
| World ID reach                 | I have not checked how many people in India can verify, and the 0G sign-in only works on localhost                               | Test with the simulator. Keep guest play open. State the limit in the debrief.                                          |
| Unsafe generated content       | Image models can produce things you do not want to show                                                                          | Moderate prompts and NPC lines. If time allows, run a vision check on each image before display. Offer a report button. |
| Credit burn                    | Each run makes many model calls                                                                                                  | Per-maker cap, daily limit, and a global pause switch                                                                   |
| Hidden-note codec              | The model may change a word's form and break the round trip                                                                      | A check value, a round-trip test, and one regeneration                                                                  |
| Spoilers                       | A determined player can read the manifest or codebook                                                                            | The culprit stays on the server until a correct accusation. Say plainly that this is a game, not security.              |
| Originality claims             | Text adventures exist. I found no walkable illustrated world made from one sentence, but my search ended in April 2026.          | Do not claim to be first                                                                                                |
| Time                           | The event ends soon                                                                                                              | Build to the cut line                                                                                                   |

### Open questions

- Which chat model returns reliable JSON and short in-character replies?
- Can an Arkiv entity's expiry be extended when a world is played? If not, use a fixed expiry and rank by visit count.
- Do 0G's separate prize tracks count as one partner pick?
- What rate limit does 0G apply to one key?
- How many people in the room can verify with World ID?
