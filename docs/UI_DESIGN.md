# ETHJasoos client design review

The redesign starts at client HEAD a7d0b92 (not the older a9e671c checkpoint). All previous browser evidence is preserved. PR #1 targets A and remains draft.

## Reference audit

Studied https://github.com/harshagw/kahani at main: app/globals.css, app/layout.tsx, components/Home.tsx, GameCanvas.tsx, WorldHud.tsx, DialogueBox.tsx, LoadingBlock.tsx and Minimap.tsx. Observed amber surfaces, bold display typography, 2px outlines, hard offset shadows, image-first gallery cards, compact contextual HUDs and animated interaction feedback. Its loading implementation uses stepped progress; ETHJasoos uses indeterminate skeletons because our contract does not provide measured generation progress. We did not import its code, images, logos, sprites or dependencies.

The public website URL rendered a JSON service description when captured in Chromium; it did not expose the game. See artifacts/browser/redesign/reference/public-site.png. Source informed the visual direction; no claim of screenshot parity is made.

## Original system

- Cream #FFF4D6 background; amber #F4C542 for selected actions/evidence; charcoal #171717 for text/outlines; ivory #FFFBEF panels; copper #C87832 in original cover art. Dark brown #613A15 supplies readable text accents on amber.
- 2px outlines, 4px shadows, 4–6px corners. Spacing uses 4/8/12/16/20/24/36/48px increments.
- Self-hosted Geist body and Bricolage Grotesque display fonts. Font OFL notices are included in public/fonts. No runtime font service or new package dependency.
- Original public/case-cover.svg is decorative bureau artwork, not generated-world evidence. Actual gallery thumbnails, street/interior/finale artwork and provenance still come from existing contracts. Fixture art remains visibly fixture art.
- Canvas and animation loop retain collision, normalization, transparency, feet alignment and facing. Controls sit in a safe toolbar beneath the scene rather than obscuring doors. The HUD does not invent a live minimap or generation counts.
- Evidence slots derive from the actual NPC ID set; suspect cards and native keyboard picker share the existing culprit ID state. The server submission path and one-attempt behavior are unchanged.
- Suggested questions fill the editable draft and focus its input; users explicitly send them. Dialogue is a focusable live log with bounded scrolling. Closed interviews retain their existing behavior.
- Native details exposes/collapses the actual generation records. No synthetic success or progress values. Reduced motion disables reveal and skeleton animations.

## Review instructions for Amogh

Run USE_FIXTURES=true npm run dev, visit localhost:3000, verify the demo session, create or open a case, use arrows/WASD or touch directions, enter each room, ask two questions per NPC, decode notes, inspect the three evidence slots, choose a suspect and submit. Also inspect gallery loading/empty/failure/retry and missing finale image fallback. Real World ID, live room transitions, generated finale delivery and atomic accusation persistence remain A/C dependencies; fixture success does not validate them.

Compare artifacts/browser/redesign/before with review landing/gallery screenshots, and artifacts/browser/lane-b-chromium/recovered with redesign-accepted for the gameplay journey. The first redesign runs retain the contrast/scroll-log defects discovered during QA; the redesign-accepted report is the review authority. The intermediate redesign-final run was interrupted after a build invalidated the running server’s assets; its later transport errors are not application findings.

The intermediate redesign-signoff run additionally caught fallback-image contrast and a scroll-effect timing assertion; those findings were corrected before redesign-accepted. Automated axe incompletes for symbolic direction buttons/check marks require human interpretation: controls have explicit movement labels and charcoal-on-amber evidence marks. These are not a screen-reader user study.

## Final validation

- Sequential final run: npm test — 46 passed / 3 TODO; npm run typecheck, npm run lint and npm run build all passed. git diff --check passed.
- Chromium + axe, all three requested viewports: **422 PASS / 0 FAIL / 1 UNVERIFIED** in redesign-accepted/report.json. Previous stable client baseline was 377/0/1; the larger total includes added redesign regression checks. Original pre-fix baseline (106/26/1) is also retained.
- Additional loading screenshots and reduced-motion computed-style checks: 3/3 passed in artifacts/browser/redesign/review/supplemental.json.
- Real tab blur is unverified in headless Chromium. Synthetic blur/visibility, keyboard movement, touch cancellation, collision, diagonal speed, focused form controls, dialogue scrolling and live announcements pass. Automated accessibility scans report zero violations on tested states; symbolic-icon checks retain axe incomplete entries documented above.
- Missing finale image is deliberately fault-injected after a correct fixture accusation: the solved secret remains visible and fallback text passes contrast checks. No live sponsor validation is claimed.
