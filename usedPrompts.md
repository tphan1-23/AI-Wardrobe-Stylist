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
