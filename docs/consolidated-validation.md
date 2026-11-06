# Consolidated cross-validation — 7 November 2026

## Included work

This branch combines #38 (room exits, quota copy, legacy-world compatibility), #39
(sealed accusation indices, plain hidden notes, current Arkiv judging docs), and #40
(0G speech/transcription and microphone input). Their branch heads are preserved as ancestors
of this branch; no source PR needs to be merged separately.

Additional fixes found while checking the combination:

- Leaving dialogue cancels recording/transcription without uploading or sending a late line.
- A late microphone permission response immediately releases its stream after cancellation.
- Recording, permission requests and transcription block competing player submissions.
- Muting/cancelling cloud narration aborts the request and releases its temporary audio URL.
- Media playback failure falls back to browser speech once; stale/cancelled audio never starts.
- Voice lifecycle/request types live in the shared client type module.
- Decoder display normalizes legacy note formatting in every entry point, including case notes;
  reopening a note cannot reveal the model's bold markers around codebook words.

Production preparation adds standalone Next output, a non-root Node 24 container definition,
a public noncached liveness route, a secret-redacting environment preflight, and the submission
handoff/recording plan. These artifacts do not constitute a deployed service or uploaded video.

## Results

| Check | Result |
| --- | --- |
| Combined test suite on Node v24.22.2 | 84 passed, 0 failed |
| Typecheck | Passed |
| Full repository lint | 0 errors; five existing image warnings |
| Next 16.2.10 production build on Node 24 | Passed; standalone server emitted |
| Standalone health and login HTML | HTTP 200 |
| Unauthenticated profile/games/voice/transcribe/finale | HTTP 401 for all five |
| Test asset served before and after restarting the standalone process | HTTP 200, identical bytes |
| Current local environment preflight | Correctly fails: missing SESSION_SECRET/ASSET_DIR and non-production World ID environment |
| Docker image build | Not run: Docker CLI exists, but its daemon/socket is unavailable |

The standalone smoke test used a separate process, temporary asset directory and unauthenticated
HTTP requests. It made no provider/model/chain calls. The file-restart check proves local process
retention only; the chosen host's mounted volume still needs its own restart/redeploy test.
Component/audio tests mock browser services and proofs. No new real microphone, visual browser,
production World ID proof, paid generation or full live-case claim is made here.

## Still required for #29

The team has not provided a hosting project/account, live-demo URL, uploaded sub-three-minute
video, or Telegram/X contacts. Repository visibility has not been changed. The saved localhost
browser policy still prevents an interactive walkthrough by this agent. Keep #29 open until
those artifacts and a successful live full-case journey are recorded. See
[submission-pack.md](submission-pack.md) for the handoff and acceptance steps.
