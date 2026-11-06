# Chromium fixture evidence — 2026-11-06

Captured with Playwright Chromium against USE_FIXTURES=true on localhost:3000.

- street.png: initial street, transparent fixture sprite.
- sprite-trim.png: injected opaque SVG, actual canvas drawImage source [30,20,40,60], destination [-32,-96,64,96]. Console and pageerror arrays empty.
- interior-pending.png / interior-failed.png: temporary server fixture harness with interior statuses overridden. Harness removed before build. Ready interiors are visible in the journey screenshots.
- verification-required.png: three real dialogue clues collected, actual accusation endpoint returns 401.
- finale.png: fixture verify called through browser request context, correct accusation reveals secret and image.
- incorrect.png: actual incorrect accusation; picker locked and no secret rendered.
- repeat.png: prior accusation recorded through API; browser submission receives 403 and locks.

Real keyboard journey: hold ArrowUp 1600ms (feet stopped at x480,y363), E enters depot; return, hold A 1250ms, E enters cafe; return, hold D 1250ms, E enters pawn shop. Two questions per NPC unlock the picker. All journey pageerror arrays were empty. A repeated API request after success returned 403.

Limitations: timings are machine-dependent; this evidence is not an automated regression suite. No live 0G/Arkiv/World ID calls. No responsive, blur, diagonal speed or screen-reader signoff. Pending/failed screenshots validate rendering, not live asset transition delivery.
