# Detective clues: search, sealed evidence, and a keyed hidden note

Date: 2026-11-06 · Status: approved design, not built · Budget: under 12 hours, 3 people

## Goal

Make solving the case depend on exploring the world and on World ID, not only on chatting.
A judge plays one full case at the table and sees each sponsor do something in it:

- **0G** writes the world, the cover text, and the dialogue.
- **World ID** opens the decisive clue (not only sign-in).
- **Arkiv** records who opened the evidence and who accused.

## What stays

One street, 3 interiors, 3 suspects. Each suspect gives a soft clue by their second reply and
the chat closes after the third (R7). Accusation stays World ID gated and recorded on Arkiv,
one per human per case (R24).

## Player loop

1. Talk to the 3 suspects and collect their soft clues.
2. **Search each room.** Every interior has one inspectable object, written by the plan model
   (for example "a brass tiffin box with a dented lid"). A **Search the room** button in the
   room panel shows it. No new images and no hotspots on the picture.
3. **Find the hidden message.** One case note reads as ordinary small talk (a pinned shop
   message, a scribbled pager note). It carries the culprit's 3-letter code, encrypted with a
   3-letter key. Without the right key the Decoder says "nothing hidden here": the check value
   is the only detector, so nothing marks the note as special. Decoy notes decode to nothing.
4. **Open the sealed evidence with World ID.** One room's object is a sealed evidence box.
   Opening it needs a World ID proof made for this case. It reveals the key; with the key the
   Decoder reads the culprit's code.
5. Accuse.

Requirement changes (docs/PRD.md):

| ID  | Change | Acceptance |
| --- | ------ | ---------- |
| R27 | Promoted from P2 to P1. The keyed note's key comes from the sealed evidence, not an NPC | Right key decodes the code; no key or wrong key reads as "nothing hidden" (wrong key: 1 in 16 false pass) |
| R28 | New, P1. Each room has one searchable object | Search shows the object's name and description |
| R29 | New, P1. Sealed evidence opens with a per-case World ID proof | One unlock per human per case, recorded on Arkiv before the key is shown; a returning player gets the key without a new proof |

## Data (lane A)

- `Location.object: { name: string; description: string }`: the searchable object per room.
- `WorldBible.evidenceLocationId: string`: public. Names one of the 3 rooms; that room's
  `object` is the sealed evidence box.
- `mystery.key: string`: 3 letters from the codec alphabet, drawn at random on the server, not by
  the model. Server-only; stripped with the rest of `mystery` by `toPublicManifest`.
- `mystery.evidenceNote?: string`: server-only text revealed inside the box. Set only by the
  encode fallback below.
- `parseBible` validates `evidenceLocationId` and each `object`. On failure the existing single retry runs;
  if that fails too, room 1 gets a fixed "locked strongbox" as evidence.

## Codec (lane A, `lib/engine/codec.ts`)

- `encodeNote(secret, cover, key)`: each secret letter is shifted by the key letter (index add,
  mod 16 over `ALPHABET`). The 4-bit check is computed over the **plain** letters, so the slot
  count stays `SLOTS` (16) and note writing is unchanged.
- `decodeNote(text, key?)`: reads the 16 bits, unshifts with `key`, verifies the check against
  the unshifted letters. No key or a wrong key fails the check 15 times in 16. The key space is
  4096, so the check confirms a key; it is not meant to stop guessing.
- `notes.ts` encrypts the hidden note with `mystery.key`. Decoys stay scrubbed of codebook words,
  so they never decode under any key.
- If the hidden note cannot be encoded after its retry, it is dropped and
  `mystery.evidenceNote` carries the code as plain text instead ("Initials scratched inside:
  M-E-E"). It is server-only, so it never reaches the public manifest. The case stays solvable.

## Evidence route (lane C)

- `createRpContext(action)` takes the action instead of always using `WORLD_ACTION_ID`.
- `GET /api/worlds/[id]/evidence`: the IDKit widget config for action `evidence-<worldId>`.
- `POST /api/worlds/[id]/evidence` with `{ proof }`:
  1. Requires a session (401 without one).
  2. If this human already has an `unlock` for this world, return the key with no proof
     (World ID v4 proofs are one-time per action per human, so a second proof would fail).
  3. Verify the proof: action `evidence-<worldId>`, environment, one nullifier, then the
     Developer Portal. A proof for another action is a 400.
  4. Write an Arkiv `unlock` entity `{ project, entityType: "unlock", worldKey, humanHash }`
     (lifetime = the accusation lifetime). If the write fails: 503, nothing revealed.
  5. Return `{ key, evidenceNote?, unlocks }` (`unlocks` = live unlock count). The object's
     name and description are already public in the room.
- Fixture mode skips the widget and returns the fixture key, like `/api/verify` does now.

Idea credit: the per-item World ID action and "the check is the detector" come from
[lortnoc_tahc](https://github.com/forever8896/lortnoc_tahc) (MIT, Kilian Valdman). No code is
copied; if any is, its MIT notice goes with it.

## Client (lane B)

- Room panel: **Search the room** lists that room's object. The evidence room shows
  **Open with World ID** (reusing `WorldIdButton` with the evidence config).
- Decoder: a key field, filled in automatically once the box is open.
- Clue board: the 3 soft clues, the evidence (key or `evidenceNote`), and the decoded code. Accuse is unchanged.

## Failures

| Case | Behaviour |
| ---- | --------- |
| Plan output lacks evidence or objects | Existing retry, then the fixed strongbox fallback |
| Hidden note will not encode | Note dropped; the code moves into server-only `mystery.evidenceNote`, shown on unlock |
| World ID unreachable or proof rejected | Box stays shut with a clear message; accusing on soft clues still works |
| Arkiv unlock write fails | 503, key not revealed, player can retry |

## Testing

- Codec: right key round-trips; over 1000 random wrong keys the false-pass rate is near 1/16;
  decoys never decode.
- Evidence route: 401 without a session; 400 for a proof with another action; success writes an
  unlock and returns the key; a second request returns the key with no proof.
- Fixture world plays end to end (tests and browser) with the fixture key.
- First build step: one real proof from the World ID staging simulator against
  `evidence-<worldId>`, to confirm v4 accepts a per-case action without registering it in the
  Developer Portal. If it does not, use one fixed action `open-evidence` with the world id as the
  signal, and rely on the Arkiv `unlock` record for the once-per-case rule.

## Part 2: the wider game (added 2026-11-06)

Everything below is designed for Jasoos and written fresh in this repo.

### Overworld: a 3x3 grid of screens (lanes A + B + C)

The street becomes screen `(0,0)` of a 3x3 grid (`x, y` in -1..1). Walking off an open edge loads
the neighbouring screen.

- Type: `Screen { x, y, imageUrl, walkMap, doors, hotspots, edges: { n, e, s, w: boolean } }`.
  `Manifest.screens: Screen[]` replaces the single street fields for new worlds; the street is
  `screens[0]`. Old manifests (no `screens`) load as a one-screen grid.
- Edges: the vision pass says, per edge, whether open ground continues (true) or water, wall,
  or cliff stops it. Grid bounds are always closed.
- Rooms: the 3 rooms are placed on the first screens generated (street gets 1, the next two
  screens one each); later screens have no doors.
- `POST /api/worlds/[id]/screens { x, y }` (lane A): if the screen exists, return it. Otherwise,
  for a verified human only, generate it: image prompt = art style + world setting + "continues
  the <direction> edge of <neighbour title>", then the vision pass for walk map, doors,
  hotspots, and edges. Visitors without World ID get 401 and the edge acts as a wall.
- Persistence (lane C): each generated screen is an Arkiv `screen` entity
  `{ project, entityType: "screen", worldKey, x, y, data (gzipped Screen) }`, same lifetime as
  the world, so every later visitor replays it with no 0G cost. In-memory backend mirrors it.
- Cost cap: at most 8 generated screens per world (9 with the street).
- Fixture mode: all 9 screens reuse the fixture street image with the fallback walk map.
- Client (lane B): on crossing an open edge, fade, request the screen, place the player on the
  opposite edge. While it generates, show "the road ahead is still being built" and keep the
  player on the current screen.

### Inspectable things (lanes A + B)

- The vision pass (street and every screen) also returns up to 4 `Hotspot { id, name, hint,
  x, y, w, h }`: things a detective would look at (a cart, a shrine, a notice board). `hint` is
  one sentence written by the vision model.
- Client: walking into a hotspot rect shows "E: inspect"; E shows `name` and `hint` in the
  panel. Room objects from Part 1 use the same panel.

### Heat (lanes A + B)

- Each NPC gets `tripwire: string` in the bible (a topic that offends them). Server-only state
  per human per world: `heat` 0..100.
- Dialogue: the model returns JSON `{ reply, offended: boolean }`. `offended` adds 25 heat;
  being rude after the chat closed adds 10. Rules stay in code (`dialogueRules.ts`), like the
  clue rule.
- At 100: the run fails ("You were run out of town"), no accusation allowed for this run.
  `DialogueResponse` gains `heat`; the client shows a heat bar and the fail screen.
- Heat lives in the server session store (in memory, per process); it resets on a new run.

### Voice (lane B)

NPC replies and the finale secret are spoken with the browser's `speechSynthesis`. Each NPC
gets a stable voice and pitch from a hash of their id. A mute toggle, off by default on
mobile. No new keys or services.

### Finale image (lane A)

On the first correct accusation for a world, generate the finale image from
`mystery.finalePrompt` (not at creation: the manifest reaches the browser and the image would
show the culprit). Store it as a `finale` asset; later correct accusations reuse it. The
accuse response already has `finaleUrl`. The client shows it with the secret, spoken.

### Mobile controls, minimap, sound (lane B)

- On-screen D-pad and an E button below 768px width; the canvas scales to fit.
- Minimap: the 3x3 grid, visited screens filled, current screen marked, rooms dotted.
- Sound: short WebAudio blips generated in code (step, door, clue, unlock, fail). No audio files.

### Inventory and room actions (lanes A + B)

- Bible: each room gets up to 2 `items: { id, name, description }` and up to 2
  `actions: { id, name, outcome, heat: 0 | 15 | 30, yieldsItemId?, exits?: boolean }`
  (for example "slip out the back window": heat 15, exits to the street).
- Items and actions show as entries in the room panel (and as hotspots on screens where the
  vision pass places them). E on an item adds it to the inventory; E on an action shows its
  `outcome`, adds its heat, and gives its item if any.
- Inventory: server-side per human per world, next to heat. Items can be shown to an NPC
  ("Show item" in the dialogue panel); the NPC prompt gets "the player shows you <item>", and
  an NPC whose `wants` names that item answers more openly.
- One action per world may reveal a soft clue in its `outcome` (the plan model marks which).

### Reply buttons and richer NPCs (lanes A + B)

- Npc gains `wants`, `fears`, `opening` (first line when approached), `quirk` (a verbal habit),
  and `tripwire` (from Heat). All go into the NPC system prompt; none is the clue.
- Dialogue: the model returns `{ reply, offended, suggestions: string[3] }`. The client shows the
  3 suggestions as buttons (keys 1-3) above the free-text box. Clue and turn rules are
  unchanged.

### Defeat ending and run timer (lanes A + B)

- Bible gains `mystery.defeatPrompt` (server-only). Heat 100 or the timer running out ends the
  run with a defeat screen; the defeat image is generated once per world on the first defeat
  (same lazy rule as the finale) and reused after.
- Run timer: `RUN_SECONDS` (default 600) shown in the HUD. It is client-side and resets on a new
  run; it is a pacing device, not a security rule.

### Music and deleting a world (lane C)

- Music: a WebAudio ambient generator in code (drone + slow arpeggio), one of 4 moods
  (`calm`, `tense`, `eerie`, `festive`) chosen by the plan model as `bible.mood`. Ducks under
  voice, mute toggle shared with sound. No audio files.
- Delete: `DELETE /api/worlds/[id]` for the creator only. The server finds the world's
  `creation` entity by `publishId` and checks its `humanHash` matches the session, then deletes
  the world and its `screen` entities on Arkiv. Unlock, visit, and accusation entities are left
  to expire. The gallery shows a delete button on your own worlds.

## Team split

| Lane | Owner | Builds |
| ---- | ----- | ------ |
| A | Amogh | Types and fixtures first (hour 1): `Screen`, `Hotspot`, `Location.object`, items, actions, NPC `wants/fears/opening/quirk/tripwire`, `evidenceLocationId`, `mystery.key/defeatPrompt`, `bible.mood`, `heat` and `suggestions` on `DialogueResponse`. Then: keyed codec + notes, plan model fields, vision pass (edges + hotspots), screen generation route, dialogue JSON (offended, suggestions, shown item), inventory + heat server state, finale and defeat images |
| B | Suraj | Against fixtures from hour 1: screen transitions, inspect panel, room search + items + actions, inventory bar + "Show item", reply buttons, evidence button, Decoder key field, clue board, heat bar, run timer, defeat screen, voice, D-pad, minimap, sound effects |
| C | Kishore | `createRpContext(action)`, evidence route + Arkiv `unlock`, Arkiv `screen` entities + 8-screen cap, World ID check on screen generation, delete world (route + gallery button), WebAudio music, judge docs (`arkiv/`) for the new entities |

Order: A's types and fixtures land on `main` first, so B and C never wait on 0G. Each lane
works on its own branch, pulls `main` often, and merges small. Demo freeze 2 hours before
submission: only fixes after that.

Cut order if time runs out (first cut first): music, sound, minimap, delete, voice, run timer,
reply buttons, inventory and actions, heat and defeat, overworld beyond the street. The Part 1 loop (search, evidence, keyed note, accuse) is never cut.

## Out of scope

Endless (unbounded) overworld, server-generated voice, LLM (arithmetic-coding) steganography,
and NPC dialogue that carries the hidden message.
