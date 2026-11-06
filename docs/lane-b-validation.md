# Lane B completion — #13, #15, #17, #18

## Implemented behavior

- **#13:** searched evidence opens through `/api/games/[id]/evidence` using the returned
  IDKit config. Returning unlocks restore without a new proof; local-dev fixture access
  uses the server's explicit dev mode. A failed write shows its server reason and reveals
  no key. Evidence fills the Decoder key; players can edit it or restore the evidence key.
  Case notes retain the three discovered soft clues, opened evidence/fallback note, searched
  notes and decoded code. Searched rooms can be reopened.
- **#15:** at most three suggestion chips, shortcuts 1–3 outside editable fields, an inventory
  picker that sends `shownItem` with the dialogue request, and the danger-labelled heat bar.
  Item presentations bypass cached generic replies. The progress primitive now forwards
  its numeric value to Radix so assistive technology receives the same value as the fill.
- **#17:** NPC and finale narration use browser speech synthesis, with stable per-character
  voice/pitch selection. Effects are generated WebAudio blips, including steps, doors,
  clues, evidence unlock and failure. No audio files were added; the effects no longer
  import the existing embedded sound clips. One shared mute cancels narration and active
  effects, gates future effects and mutes music. Sound defaults off for narrow/coarse-pointer
  devices. No game voice requests are sent to `/api/voice`.
- **#18:** narrow/coarse-pointer controls provide a 44px D-pad and 56px E button. Movement
  clears on release, pointer cancellation, lost capture, blur, visibility change and modal
  pause. Portrait is playable without a rotate-screen blocker. Canvas uses contain scaling,
  preserving the full world image and image-relative movement rather than cropping its edges.

## Validation

- All **65 tests pass**, including nine new component/audio/canvas/world integration tests.
- Typecheck and production build pass.
- Repository lint passes with five existing image warnings.
- The fixture test opens evidence, fills the key and decodes `MEE`; no key and invalid `XXX`
  return “Nothing hidden.” The mocked IDKit path also checks proof submission and failed writes.
- The world integration test picks up an item, presents it to an NPC, checks the actual outgoing
  request, observes heat rise to 35 from a grave offense, confirms the accessible progress value,
  checks shared music mute and reopens the collected clue in case notes.
- The canvas test runs the render loop with a mocked drawing context at **375×812**, verifies
  that the entire image stays within the viewport, moves the player, then checks blur stops it.
- Audio tests mock browser APIs to check cancellation of active/queued effects and voice, and
  stable voice selection even when the browser returns voices in another order.

These are offline automated checks, not screenshots or real audio playback. A saved browser
policy blocks localhost access, so a physical-device/visual walkthrough was not performed.
Real World ID action acceptance remains the separate lane C spike #19; mocked IDKit results
here are not claimed as real cryptographic proofs.
