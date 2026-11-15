# AI Audit Log — Manuel Edwardo De La Rosa Modesto

Individual AI audit log for CSCI 4397/6397 (capstone). Thanh keeps her own log in `usedPrompts-thanh.md`.

**Tools used:** Claude Code (Claude, in VS Code) on the main machine; Gemini API as a product component (not as a coding tool).
**Entry format:** what I asked, what the AI produced, **how it was verified**, what I changed or rejected. Newest entries go at the bottom. Never put keys, passwords or personal photos here (public repo).

> **Status of this file:** the entries below were first drafted by Claude from the session history and must be read and edited by Manuel so they are in his own words. Mark an entry `[reviewed]` once you have.
> **Keeping it current:** after every notable task (a prompt that changed the design, a failure, a rejected suggestion, a verification), add an entry in the same PR as the work. Claude is instructed in `CLAUDE.md` to propose the entry at the end of each task.

---

## Entries

### 1. Project setup and requirements gathering (2026-10-02)
- **Asked:** adopt the repo, read the proposal, update `CLAUDE.md`, then interview me as a requirements analyst and system designer.
- **AI produced:** a structured question list and the decision log D1 to D15 (household model, outfit definition, worn/dirty lifecycle, review-and-edit tagging, quiz content, feedback loop, auth and privacy, testing).
- **Verified / decided by me:** I answered each question and chose the options myself; I made myself tech lead and made Manuel + Claude the owners of all AI logic (D12 to D14). Thanh agreed to D13/D14.
- **Changed / rejected:** the first slice proposal was revised into "AI core versus product/plumbing" (D14).

### 2. AI core: scoring, preference learning, tag validation (2026-10 week 1 to 2)
- **Asked:** build pure, testable modules for outfit scoring, quiz mapping, feedback learning and tag validation, behind agreed contracts.
- **AI produced:** `scoring.ts`, `preferences.ts`, `tag-validation.ts`, `tag-schema.ts`, with Vitest tests.
- **Verified:** unit tests; **mutation checks** (deliberately breaking the code and confirming the tests fail); **seeded fuzzing**; a simulated user whose hidden taste is learned through feedback (the engine stops suggesting disliked outfits); 100% line and function coverage under an 80% gate.
- **Found by verification:** the first handler version crashed on an invalid date (fixed with a date check) and could double-count a retried feedback request (fixed by claiming the feedback row first, so only one request can win).

### 3. Vision tagging with Gemini (2026-10)
- **Asked:** design the tagging prompt and schema, call Gemini from an edge function, and measure accuracy.
- **AI produced:** `vision-prompt.ts`, `gemini.ts` (model fallback chain), `analyze-garment`, and `scripts/eval-tagging.ts` with `eval/tagging-labels.json`.
- **Verified:** I labelled 23 real product photos by hand; the evaluation script compares the model with my labels. Result with the flash models: strict type 95%, color 86%, season 73%, warmth 95% (logged in `brain/AI Logic Ownership.md`).
- **Failures and fixes:** (a) `gemini-2.5-flash` returned 404 "no longer available to new users": fixed with a fallback chain of newer models; (b) the free tier ran out (20 requests per day): added detection of a quota-exhausted 429 that is not retried but still falls back; I then enabled billing on the Google project and recorded the decision (D20) with a budget alert as a to-do; (c) a TypeScript parameter-property error under plain Node: replaced with explicit fields and `erasableSyntaxOnly`.
- **Rejected:** relying on the model's answers without a review step; the app must highlight `needs_review` fields and require confirmation (D4).

### 4. Edge functions, deploy and end-to-end proof (2026-10-08)
- **Asked:** wrap the pure modules as thin Deno functions, deploy to the real project, and prove it works as a real signed-in user.
- **AI produced:** `generate-outfit`, `update-preferences`, `supabase-deps.ts`, `scripts/e2e.ts`.
- **Verified:** `deno check`; unit tests with injected I/O; then the real project: **39 of 39 checks passed** (sign-in, security-rule rejections, 7 photos tagged by the real model, outfit from the user's own closet only, learning from a thumbs-down, a second feedback refused with 409, re-roll, accept, cleanup with zero leftovers).
- **Decision for safety:** the script runs against a real account, so I required it to always clean up, track only the rows it creates and restore preference weights.

### 5. Pull-request process (2026-10-04 to 2026-10-08)
- **Asked:** whether our PR habits match the assignment rules (one PR, approved by a different teammate, one core feature, tests, coverage).
- **AI produced:** an analysis against the rules and a plan: graded PR = auth + household (D17); one focused PR per feature; description with why / what / how verified / not covered.
- **Verified:** I checked GitHub for each PR's review record. PR #1 had been merged without a formal approval (Thanh added only a comment afterwards); from PR #2 on, the non-author approved on Files changed before the merge (#2 to #8).
- **Lesson:** approval before merging is part of the graded record, so I do not merge a PR that has no approval.

### 6. Incident: every profile row disappeared (2026-10-08)
- **Symptom:** "Your profile could not be found" for every account, even a new one.
- **AI work:** I pasted the trigger definition and table statistics; Claude traced the cause (10 inserts and 10 deletes on `users`, 0 rows left: the rows were deleted by SQL run during testing; the trigger was correct, but a trigger only fires at account creation).
- **Verified:** I ran the queries myself in the SQL editor, a fresh account got its profile 2 ms after the account, and the e2e script passed 38 of 38 on it.
- **Fix:** migration `0004_ensure_profile.sql` and a one-time self-heal in the app (PR #5). Lessons recorded in `brain/Work Plan.md`: announce destructive SQL to the team first; drop the five unrelated template tables.

### 7. Google sign-in sends the browser to localhost (2026-10-08)
- **Symptom:** after choosing a Google account, Safari opened `localhost:3000` and the app never logged in.
- **AI work:** instead of guessing, Claude probed the project's redirect allow list with `GET /auth/v1/verify?...&redirect_to=...` for different addresses: the tunnel address and the `dresswell://` scheme are allowed; a plain-LAN `exp://10.x.x.x:8081/...` is rejected and falls back to the Site URL.
- **Verified:** restarting with `npx expo start --tunnel -c` made Google sign-in work on my iPhone. Recorded in the Work Plan.

### 8. Sign-up confirmation by code, then reversed (2026-10-08)
- **Asked:** make sign-up confirmation work on Expo Go (email links cannot open it).
- **AI produced:** `confirmSignUp`, `resendSignUpCode` and a confirm screen (PR #6), with mutation checks.
- **My decision:** I chose **not** to change the email template, so the screen would ask for a code that is never sent. I had the screen and the unused functions removed (PR #8) and the decision written in the Work Plan.
- **Lesson:** I questioned the AI's recommendation by asking why the link was not enough; the answer showed the real cause (Site URL still `localhost:3000`) and that the choice depends on the demo type (Expo Go versus a hosted web build). Deferred to Milestone 3.

### 9. Team coordination through the repo (2026-10 ongoing)
- **Asked:** make the repo itself carry the plan so Thanh's separate Claude session knows what to do.
- **AI produced:** `brain/Work Plan.md` (branch map, roadmap, runbooks), `CLAUDE.md` status, and PR descriptions that state what is *not* covered.
- **Verified:** I read the Work Plan after each change; Thanh's session followed it for PRs #2 to #4.
- **Convention I set:** no `Co-Authored-By` trailers from the AI in commits; AI use is recorded here instead.

### 10. Household sharing test on the real project (2026-10-08)
- **Asked:** run the two-account household test (`scripts/e2e-household.ts`) once the second account existed.
- **What happened:** the first run refused to start because account A was still in a household from my earlier manual test (the intended safety check). **But the script's cleanup still ran and made A leave that household.** The cleanup assumed any household it found was its own. I told the team what had happened (it was a test household, but the rule "never touch a real household" was broken).
- **Fix:** the cleanup now leaves a household only after the script has passed its pre-check, so anything it finds before that is never touched.
- **Second run:** 32 of 33 checks passed. The failure: after B left the household, B could still download A's photo (HTTP 200). I did not accept "the policy is probably fine"; I checked: listing the folder as B returned nothing and a download with a cache-busting parameter returned 400, so the **database policy was correct** and the plain URL was served from Storage's cache. The check was rewritten to test the policy (list and cache-bypassed download) and to print the cached answer as information.
- **Result:** 34 of 34 checks pass, including B being unable to change, delete or forge A's data.
- **Lesson:** a safety check must also guard the cleanup path, and a failing security test needs its cause found before it is "fixed" either way.

### 11. README and AI-development documentation (2026-10-10)
- **Asked:** add proper documentation for the next assignment: a real README and a description of how we use AI tools (Claude Code in VS Code and in the terminal).
- **AI produced:** a new `README.md` (problem, features and status, stack, layout, setup, testing, doc index) and `docs/ai-development.md` (tools, shared context, ownership, verification methods, examples of AI mistakes caught, rules, audit log).
- **Verified:** written from `CLAUDE.md`, `docs/`, `brain/` and both audit logs; figures (95/86/73/95 %, 39 and 34 checks) were copied from the tuning log, not recalculated. **Not yet checked:** the setup steps were not re-run on a clean machine. [needs review by Manuel]

### 12. Weather in the generate-outfit response (2026-10-18)
- **Asked:** Thanh's PR #13 asked the AI core to return the weather so the Today screen can show it (one of her three requests).
- **AI produced:** `GenerateOutfitResponse` now carries `weather` on every status (ok, incomplete, exhausted); the handler adds it; `docs/api_endpoints.md` updated. The change is additive, so the merged Today screen keeps working.
- **Verified:** 356 tests pass, typecheck clean in root and app, `deno check` on the function; handler tests assert the weather on all three statuses; two deliberate breaks (weather dropped from incomplete results, dropped from ok results) were both caught.
- **Not done yet:** the other two requests (return the found items on `incomplete`, store the reasoning with the suggestion) and the redeploy of the function, which waits for the PR approval and merge.
### 11. Add-garment logic written during the demo crunch (2026-10-18)
- **Asked:** Thanh's Today screen was merged and the Add screen (photo to garment) did not exist, so a new account had no clothes and the demo loop could not run. I asked Claude to write the Add screen's logic and tests so Thanh only has to wire the screen.
- **AI produced:** `frontend/src/services/add.ts` (upload to the person's own folder, call `analyze-garment`, review state, save) and `addGateway.ts`, with `tests/add.test.ts` (29 tests).
- **Rule enforced (D4):** every field the AI left out or flagged in `needs_review` must be filled or confirmed before saving; invalid values from the AI are dropped and flagged even if the AI did not list them; a 429/502 or an empty AI reply lets the person type the tags; a photo the server rejects is removed from storage.
- **Verified:** 385 tests pass, 100% lines and functions on both files; five deliberate breaks, all caught (confirmation rule removed, photo saved outside the user's folder, unusable photo left in storage, invalid tag values accepted, upload allowed to overwrite).
- **Found by tests:** my first test expected an empty AI reply to fail the flow; the code (fall back to typing the tags) was the better behavior, so the test was corrected.
- **Not verified:** the screen itself, and a real upload plus tagging through the app (needs a device).

### 13. Explore mode for generate-outfit (2026-10-18)
- **Asked:** Thanh's demo feature list needs a "Your judgement" deck of outfit ideas beyond today's. Every `ok` answer of `generate-outfit` was saved as the day's suggestion and Today shows the latest one, so judged ideas would have replaced today's outfit.
- **AI produced:** migration `0006_suggestion_kind.sql` (`suggestions.kind`, default `today`), a `purpose: "today" | "explore"` request field, validation, the handler storing `kind: 'explore'` only for explore ideas (so deploying before the migration cannot break today's flow), docs, and a note for Thanh on what her side must change.
- **Verified:** typecheck, `deno check`, 440 tests, 100% lines on `handlers.ts`; mutation checks: explore stored as today, today stored as explore, purpose not validated, `null` accepted as a valid purpose (found by my own test: `purpose ?? "today"` let `null` through; I made it strict) and two breaks of the migration (wrong default, an added policy), all caught.
- **Decision for Manuel:** I recommended against multi-select colors and seasons before the demo (large change across schema, prompt, scoring and preference tags). Manuel to confirm.
- **Not done yet:** applying the migration to the real project and redeploying the function; both come after approval and merge.

### 14. Read-only Supabase access and a security finding (2026-11-06)
- **Asked:** how Claude can check the Supabase project automatically. I registered the official Supabase MCP server for this one project in read-only mode (first attempt failed: it was saved under a differently spelled project path, so I re-added it with user scope).
- **What Claude did with it:** listed edge functions, tables and migrations, ran the security advisor, and read real row counts and function definitions with read-only SQL. The table list's "0 rows" were stale statistics; the real counts were 4 users, 12 garments, 88 suggestions. Migrations 0003 to 0007 are applied (checked by the objects they create); the migration history table is still empty.
- **Finding:** the advisor warned that the signed-out role can execute all our database functions. I did not take the warning on trust: reading the bodies showed `create_household()` inserts a household row before it checks who is calling, so anyone with the public key could create unlimited orphan households, and `join_household()` told signed-out callers whether an invite code exists.
- **Fix:** migration `0008_revoke_anon_functions.sql` revokes execute from signed-out callers and keeps it for signed-in users and the service role. The tests found a mistake in my first version: `set_updated_at()` is not created by our migrations (it belongs to the leftover template tables), so naming it would have failed on any fresh database; it was removed. 549 tests pass; three deliberate breaks of the migration were caught (a function forgotten, a grant to the signed-out role, a smuggled delete).
- **Not done yet:** the migration is not applied (the MCP is read-only; applying is a manual step after review), and the migration-history repair and the five template tables are still open.

### 15. AI crop box and re-measuring tagging accuracy (2026-11-06)
- **Asked:** improve season accuracy and add a smart crop for the clothing in a photo (item 5 of the final plan).
- **What Claude did first:** measured instead of tuning. The strict labels behind the old "season 73 %" figure had never been saved, so it rebuilt them as `scripts/eval-tagging.ts --strict` (first listed answer, warmth within 0.5 of the range midpoint), then ran the same 23 photos twice with the current prompt. Two identical runs differed on 4 of 92 fields, and season scored 87 % both times, so the earlier gap did not reproduce. **Decision: no season prompt change** (it would have been tuning to my own labels). I agreed because a result inside the noise is not evidence.
- **Built:** prompt v2 asks for a bounding box of the item; `validateBox` turns it into a padded fraction-of-photo box (`box` in the `analyze-garment` response, optional); `cropRectFor` and `isCropBox` in `add.ts` turn it into a pixel rectangle; `ReviewState.box` carries it to the screen.
- **Verified:** tag accuracy with v2 is within noise of v1 over two runs each (strict type 96 to 100, color 87 to 91, season 83 to 87, warmth 87). The model returned a box for 23 of 23 photos but only 6 are kept, because the test photos already fill the frame, and that is correct. For a real test of the feature I built 8 composites (a product photo pasted small onto wood, clutter or flat backgrounds): mean IoU 0.99 and the whole item inside the padded box in 8 of 8, and I looked at six crops. 564 tests pass; ten deliberate breaks were all caught (padding removed, x/y order swapped, inverted boxes accepted, full-frame boxes kept, tiny boxes accepted, no clamp to the photo edge, box made required in the schema, client trusting any box, pixel width and height not clamped).
- **Found by tests:** my first clamp test was too weak: removing the clamp survived until I added a case where the box overshoots the edge by rounding error.
- **Not verified:** real phone photos (the composites use clean product images), and the screen that applies the crop (Thanh's side). Not deployed yet: `analyze-garment` is redeployed after the PR is approved and merged.

### 16. Final documentation update and a production check (2026-11-06)
- **Asked:** update all the documentation for Milestone 3 while I test the app on my phone.
- **What Claude did:** first checked the real state instead of writing from memory. Through the read-only Supabase connection it confirmed which migrations are applied (the objects they create), that the five template tables and their function are gone, and that the security advisor shows only the nine intentional "signed-in users can call" warnings and the leaked-password setting. It then wrote two new documents (`docs/user-guide.md`, `docs/deployment.md`) and rewrote the stale parts of the README, the architecture, the API reference, the AI-development document and `CLAUDE.md`, and recorded D22 (hosting stays on Expo Go).
- **Verified:** every claim about the database was read from the database; counts (574 tests, 38 of 38 and 34 of 34 end-to-end checks) were taken from the runs; the screens' behavior in the user guide comes from the code and Thanh's design notes, not from running them.
- **Found while checking:** the README and architecture still said the quiz, Add and Today were "in progress" or "not built", and `CLAUDE.md` still called the data model "not yet migrated" and the MVP unchecked.
- **Not verified:** the user guide's descriptions of Closet, History, Favorites and Style Swipe are from the design notes and code, not from a device. Manuel to read the guide against the phone and correct it.

### 17. Where the project stands, checked rather than assumed (2026-11-14)
- **Asked:** pull everything and say where we are.
- **What Claude did:** pulled `main`, then checked instead of summarizing from memory: the approval record of every PR merged since the last review (#28 to #30, all with a formal approval from the non-author), the CI result on `main` (both checks green, including the Supabase check the migration-history repair fixed), typecheck and 574 tests on the new Expo SDK 58, the live Supabase state through the read-only connection (migrations 0001 to 0008, security advisor unchanged), and both end-to-end scripts against the real project (38 of 38 and 34 of 34), because two edge functions had been redeployed by someone else.
- **Found:** PR #30 changed the closet badge from "M" to the owner's initial, so the user guide and design notes were wrong; fixed in this PR. No entry in either audit log is marked `[reviewed]` yet.
- **Not verified:** that the redeployed functions are byte-identical to `main` (the live behavior is what was tested), and the app on a device.

### 18. Governance: code owners and a migration lock (2026-11-14)
- **Asked:** do the Milestone 3 governance work that does not depend on the hosting decision.
- **AI produced:** `.github/CODEOWNERS` (owner first, teammate second, so the non-author can always approve) and a migration lock: `supabase/migrations/checksums.json` with pure helpers in `scripts/migration-lock.ts`, a CLI (`npm run migrations:lock`) that adds new migrations and refuses to change an applied one without `--accept-edit <file>`, and `tests/migration-lock.test.ts` (14 tests, including a check of the real repository). The reason: the database is one production project and migrations are applied by hand, so an applied migration must not change silently.
- **Verified:** 591 tests pass; typecheck clean; used the real script to edit an applied migration (the test fails, the CLI exits 1 and leaves the lock untouched, `--accept-edit` allows it deliberately); added an unlocked migration (test fails); seven deliberate breaks of the helpers, all caught. One of my own mutation checks looked like it had survived: my `sed` pattern had not matched the line, so I redid it with an exact match, and it was caught (two tests failed).
- **Design choice and its limit:** CODEOWNERS lists both people on every path, because with a single owner who is also the author GitHub would block the merge; so it asks the right person first but does not stop the other from approving. It only becomes a rule when the repository owner turns on branch protection, which I cannot do.
- **Not done:** branch protection on `main` (Thanh, as owner).

### 19. Live-app sign-up: the confirmation page (2026-11-14)
- **Asked:** (several rounds) make sign-up work "as if it was a live app". I first assumed the goal was to switch email confirmation off, argued about its risks, and misread the request three times. Manuel then said exactly what he wanted: the live flow, meaning the email arrives, the link works, a page says it is confirmed, and the person logs in. The real defect was only where the link landed (`localhost:3000`).
- **AI produced:** a static confirmation page (`docs/confirmed/`) with a tested script: `statusFromUrl` decides confirmed, expired, invalid or "no link" from the address; `show` fills the page and removes the address fragment so login tokens do not stay in the browser history. No outside resources, no logging, no sending. `docs/.nojekyll` so GitHub Pages does not run Jekyll over our Markdown (a doc contains `{{ }}`, which would break it). Docs, decision D24, deployment runbook section, user guide.
- **Verified:** 604 tests pass; the page script is at 100% of lines; seven deliberate breaks caught (tokens left in the address, a log of the address, an error no longer beating a token, a check mark for every status, expired links reported as invalid, an external script on the page, an empty page claiming confirmation). I also read the live auth settings (`mailer_autoconfirm` false, sign-ups allowed) before telling Manuel which dashboard switch mattered.
- **Not done / not verified:** the page is not live until the repository owner enables GitHub Pages and the Supabase Site URL is changed (both outside the repo). Real delivery (spam folder, the link in a real email) has not been tested yet.
- **Lesson:** when the instruction keeps getting repeated, stop proposing and restate the goal in one sentence for the person to correct.

### 20. The 404 on the Pages root (2026-11-14)
- **Symptom:** Thanh got "404 file not found" after the confirmation page was merged, and GitHub said "your site is live at .../AI-Wardrobe-Stylist/".
- **What Claude did:** checked instead of guessing: PR merged, files on `main`, then requested each address. `/confirmed/` and its script returned 200 with the right content and a JavaScript content type; only the site root returned 404, because nothing was published there. The page was fine; the address GitHub advertises was the one that failed.
- **Fix:** a small landing page at `docs/index.html` (no script, no outside resources, links only to this project's GitHub), with tests, so the address GitHub shows works too.
- **Not changed:** the Site URL for Supabase stays `.../confirmed/`.

### 21. "The confirmation email is not sent and I cannot get in" (2026-11-14)
- **Symptom (Manuel):** after switching to the live-app flow, the test showed no confirmation email, and logging in did not reach the app.
- **What Claude did:** read the evidence before guessing: the newest rows of `auth.users` (no new email account had been created in the test) and the auth service log for the half hour. The log showed a `user_repeated_signup` for an address that already had a **Google** account, an "Invalid login credentials" on that address, and an old link rejected with "One-time token not found". So the test had used addresses that already had accounts: Supabase deliberately answers a repeated sign-up with success and sends no email, and a Google-created account has no password to log in with.
- **Real defect found:** the app answered "Check your email to confirm your account" even though nothing is ever sent for a registered address, leaving the person waiting. A live app should say so.
- **Fix:** `signUp` now recognizes Supabase's marker for this case (success, no session, and an **empty `identities` list**) and returns "That email already has an account. Log in, use Continue with Google, or reset your password." A session always wins, and a missing or null `identities` list is treated as a normal sign-up.
- **Verified:** 610 tests pass, `auth.ts` 100%; five deliberate breaks caught; and I checked the assumption against the real project with the test account's own address (HTTP 200, no session, `identities: []`, account unchanged: the original password still works afterwards).
- **Not verified:** the whole flow with a brand-new address in the app (the email arriving, the link, the page, logging in). That needs a real address never used before.
- **Process note:** I diagnosed from the logs only after being told twice that something was wrong; reading the logs first would have saved two rounds.

### 22. "The account says email confirmed and will not open the app" (2026-11-14)
- **Symptom (Manuel):** `tphan4@cub.uca.edu` showed a page saying the email was confirmed and never reached the app. He suspected the account had gone stale from our tests.
- **What I got wrong first:** my previous answer blamed addresses that already had accounts. That was only half right: it explained the missing email, but not this. I had read the same logs and missed the clue in them: every Google login for that account succeeded, and every callback ended on the confirmation page (and before the Site URL change, on `localhost:3000`).
- **Real cause:** that account is a Google account, not a stale email one. Google sign-in only returns to the app when the app address is on Supabase's redirect list; a plain network address (the app started without `--tunnel`) is not, so Supabase falls back to the Site URL. I confirmed this by probing the live project: the tunnel address and `dresswell://` are allowed, a plain network address is rejected and sent to the Site URL.
- **Real bug found on my side:** the confirmation page said "Email confirmed" for any link carrying a token, including that fallen-back Google sign-in. It now says so only for `type=signup`, and shows "Sign-in finished, the app did not receive it" otherwise.
- **Verified:** 611 tests pass; five deliberate breaks caught (any token counts as a confirmation, a code counts, sign-up links not recognized, the new message claiming confirmation, the new status getting a check mark).
- **What Manuel has to do:** start the app with `npx expo start --tunnel -c` so Google sign-in can return to it. The code cannot fix that: it is how Expo Go and Supabase redirects work.
- **Lesson:** I should read the evidence I already have for the failing step, not for the neighbouring one, before offering a theory.

### 23. Google sign-in that does not depend on a network address (2026-11-14)
- **Symptom:** Thanh's Google sign-in kept ending on the web page ("sign-in finished, the app did not receive it"), even after the app was started with the tunnel. The request log showed her app sending `redirect_to=exp://10.1.10.161:8081/--/auth-callback`, a plain network address that Supabase rejects.
- **What went wrong in my diagnosis:** I told her to use the tunnel, then to add a network-address pattern to Supabase's Redirect URLs. She had already used the tunnel, and after the pattern was saved (the configuration reload is in the log) a probe showed her address was still rejected; network addresses have never matched on this project. I should have stopped guessing at patterns after the first rejected probe.
- **Fix:** the Google button now sends the app's own scheme, `dresswell://auth-callback` (`OAUTH_REDIRECT_URL`), which Supabase already accepts (probed: allowed) and which does not depend on how the phone loaded the project or on the tunnel. On iPhone the system sign-in sheet intercepts a return to the scheme it was given.
- **Verified:** 614 tests pass; two deliberate breaks caught (a network address as the return address, the button going back to `Linking.createURL`). The probe of the live project accepts `dresswell://auth-callback`.
- **Verified on a phone (Manuel, 2026-11-14): it worked.** Google sign-in returned to the app. Before that I had only my understanding of how the iOS sign-in sheet intercepts a custom scheme, which is why I flagged it as untested; the user's test is the evidence, not my reasoning.
- **Follow-up question from Manuel:** does Google sign-in send a confirmation code? No: Google verifies the address and Supabase marks the account confirmed at creation (the Google rows have no confirmation email recorded). Only email and password sign-up sends a confirmation link, and password reset sends a code.

### 24. "What happened with the auto crop I wanted?" (2026-11-14)
- **Asked (Manuel, with a photo of a pink dress on a white background):** if I take this photo, it should try to take just the dress, not the white background.
- **What Claude did:** tested his exact photo through the production tagging code instead of guessing: the AI found the dress (a box covering about 72% of the width and 84% of the height, the dress plus a small margin), so the detection worked. The problem was the flow I had chosen: a **manual** crop screen came first with the frame on the whole picture (the AI had not looked at the photo yet), and the AI's frame only appeared on a **second** crop screen after upload and analysis. My earlier "suggest, never crop automatically" design was right for safety but wrong for what he wanted, and I had not told him it would come second.
- **Fix:** the photo is analyzed as soon as it is picked; the person then sees **one** crop screen whose frame already sits around the garment (one tap on "Use cropped photo", or drag, or "Use full photo"); if the AI found nothing, the frame starts around the whole photo, so manual cropping is not lost. New `initialCropRegion` decides where the frame starts.
- **Verified:** 620 tests pass; typecheck clean in both packages; the iOS bundle builds; four deliberate breaks caught (the AI box ignored, an empty starting frame, the early manual crop screen coming back, no crop screen when there is no box).
- **Not verified:** on a phone. The screen order is covered by source-level tests, not by running it. It is still **one tap, not zero**: a fully automatic crop with an "undo" would need the original kept for reverting, which I did not build.
