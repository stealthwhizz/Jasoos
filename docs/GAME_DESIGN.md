# ETH Jasoos World — an AI-generated universe you walk through

**Pivot:** not a branching storybook. A **playable world**. The game studio *is*
the AI: every street, interior, character, and line of dialogue is manufactured
in real time as the player explores.

## The loop

1. Pick a universe (Mumbai monsoon, Himalayan village, Old Delhi, Kerala
   backwaters).
2. The 0G image model paints the **street** — a top-down retro-RPG overworld
   screen — while the 0G chat model invents its **buildings** (each a hotspot
   with a name and an interior prompt) and a **quest hook**. The world is a
   3×3 grid of screens; walking off an edge loads the next one.
3. Your **player sprite** (generated in the same art style, chroma-keyed)
   walks the street with **WASD/arrows**.
4. Walk up to a doorway → **E** → the interior is generated (or served from
   prefetch) and you step inside.
5. Inside lives an **NPC** (invented by the chat model: name, role, persona). Approach
   them → dialogue opens → they speak **out loud** (TTS voice) — reply by
   picking a line (1–3) or typing anything.
6. NPCs advance a light **quest thread** that follows you across buildings.
   Esc / the door returns you to the street. Free roam, no rails.

## Tech mapping (the hackathon story)

| Layer | Model | Use |
| --- | --- | --- |
| World & interiors | **0G `bytedance/seedream-5.0-flash`** (`ZG_IMAGE_MODEL`) | street + interior frames, generated live; interiors **prefetched in parallel** while you walk |
| Player asset | **0G `bytedance/seedream-5.0-flash`** | full-body sprite on a plain background, chroma-keyed client-side |
| World brain | **0G `0gm-1.0-35b-a3b`** (`ZG_CHAT_MODEL`) | world bible, scene layouts (hotspot boxes), NPC personas, dialogue turns, quest thread |
| Frame reading | **0G `qwen3-vl-plus`** (`ZG_VISION_MODEL`) | reads each generated frame into walkable areas and hotspots |
| NPC voice | **Sarvam Bulbul v3** (`SARVAM_API_KEY`) | every NPC line spoken aloud |

All model calls go to 0G Private Computer. Its image models are text-to-image
only, so the art direction rides in every prompt to keep screens consistent.

High-volume generation is load-bearing: a 5-minute session generates a street,
a sprite, 3–4 interiors (prefetched), and a voice clip per dialogue line.

## Architecture

- `lib/universe.ts` — GameBible/Scene/Hotspot/NPC types
- `lib/zg-client.ts` — the 0G model client (`generateContentWithRetry`, `generateImage`)
- `lib/world-engine.ts` — `generateBible`, `generateScreen`, `generateInteriorScene`, `generateSprite`, `generateDialogue`, `generateFinale`, `synthesizeVoice`
- `lib/sarvam.ts` — Sarvam Bulbul v3 TTS (`synthesizeSarvamSpeech`)
- `app/api/universe` · `app/api/screen` · `app/api/scene` · `app/api/sprite` · `app/api/dialogue` · `app/api/finale` · `app/api/voice`
- `components/World.tsx` — orchestrator: scene cache, prefetch, dialogue, voice
- `components/GameCanvas.tsx` — canvas render loop, keyboard, hotspot detection
- `components/DialogueBox.tsx` — talk UI (choices + free text)

Controls: **WASD/←→↑↓** move · **E** enter/talk · **1–3** replies · **Esc** leave.

**Mobile (landscape):** bottom-right **joystick** move · bottom-left **Action** enter/talk/pick up · tap dialogue chips.
