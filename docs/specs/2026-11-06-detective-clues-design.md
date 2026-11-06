# Detective clues: search, sealed evidence, and a keyed hidden note

Date: 2026-11-06 · Status: approved design, not built · Budget: under 12 hours

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

## Out of scope

Hotspots on images, multi-screen exploration, voiced NPCs, LLM (arithmetic-coding) steganography,
and NPC dialogue that carries the hidden message.
