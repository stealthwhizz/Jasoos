# Submission pack — issue #29

## External artifacts still required

| Item | Status |
| --- | --- |
| Hosting account/project and persistent volume | Team must provide/select |
| Public live-demo URL | Not provided; no deployment performed in this PR |
| Uploaded demo video under 3 minutes | Not provided |
| Team Telegram and X contacts | Not provided; do not substitute GitHub handles |
| Public source repository access | Confirm with the repository owner; no visibility setting changed |

The source URL is https://github.com/stealthwhizz/ETHJasoos. This is not a live-demo link.
Add actual live/video/contact links to the README when supplied. #29 must stay open until
all required artifacts exist and the live demo passes the acceptance journey below.

## Production handoff

Use one long-running Node instance. The included container uses Node 24, standalone Next
output and a non-root user, with `ASSET_DIR=/data/assets`. Mount a persistent volume at `/data`
and make it writable by the container user. An ephemeral/serverless filesystem is insufficient.

Set `ZG_COMPUTE_API_KEY`, stable existing `SESSION_SECRET`, the World ID application/RP/signing
keys with `WORLD_ENVIRONMENT=production`, a funded `ARKIV_SIGNER_KEY`, and positive
`FREE_GAME_LIMIT` (or explicitly configured demo players). Set `ARKIV_ACCESS_KEY` to reduce
public RPC throttling. Keep the same `ARKIV_PROJECT_ID` and `SESSION_SECRET` when moving saved
worlds; a different sealing secret makes their mysteries and accusations unreadable.
Never put server keys in `NEXT_PUBLIC_*` values or the recording.

Run `npm run check:deploy` against the intended environment. It validates configuration without
printing values or calling external services. A pass does not prove wallet funding, host access,
volume retention, public repository visibility or a successful proof. `/api/health` is liveness
only. Build/publish the image using the team's chosen host after those details are supplied.

## Cross-validation acceptance journey

1. Open the public live link on desktop and at 375×812. Sign in with a real production
   World ID proof. Confirm rejected verification has a clear reason and no new session.
2. Create a world with the configured quota. Walk, enter/leave all rooms, collect items, ask
   suggestion/free-text questions and show an item. Confirm heat and clue updates.
3. Search rooms, open evidence with its case-specific proof, decode the note with its key,
   and make the correct accusation. Record the World ID action/outcome and 0G request IDs;
   do not record raw proofs or session cookies.
4. Reopen the same evidence without a second proof. Retry the same accusation after a failed
   ending if needed; a different accusation must be refused. Public Arkiv data must not expose
   the new accusation's suspect index. Historical plaintext records remain historical data.
5. Test cloud speech, microphone denial, transcription failure, mute during pending/playing
   audio, and closing dialogue during recording. Confirm no late line is sent after leaving.
6. Restart the host. Replay the saved world and image URLs without regeneration. Confirm
   the volume still contains assets and the deployment retained the same sealing secret.
7. Play an older unsealed world: exploration works; evidence/accusation return clear 422
   errors if that world lacks the corresponding mystery fields.

## Recording plan — 2 minutes 45 seconds

| Time | Driver/speaker | Shot |
| --- | --- | --- |
| 0:00–0:20 | B drives, A introduces | Public URL, one-sentence idea, World ID sign-in |
| 0:20–0:50 | B drives, A explains | Generation/request IDs, walking and room entry/exit |
| 0:50–1:25 | B drives | Suspect reply, item presentation, collected clue/heat |
| 1:25–2:00 | B drives, C explains | Search, World ID evidence unlock, Decoder result |
| 2:00–2:25 | B drives, C explains | Correct accusation/finale and persisted Arkiv records |
| 2:25–2:45 | A closes | Replay, sponsor contributions, public repository and contacts |

Prepare a saved case to avoid spending the recording waiting on generation. Label any cuts
honestly. This plan is not an uploaded video; the team must record, upload and provide its URL.
