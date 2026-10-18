# AI Audit Log — Thanh Phan

Individual AI audit log for CSCI 4397/6397 (capstone). Manuel keeps his in `usedPrompts.md`.

**Tools used:** Claude Code (Claude, in VS Code) on my laptop (Opus 5.5 and Sonnet 5.5).
**Entry format:** what I asked, what the AI produced, **how it was verified**, what I changed or rejected, and what was not verified. Newest entries go at the bottom. Never put keys, passwords or personal photos here (public repo).

> **Status of this file:** the entries below were first drafted by Claude from the session history so the dates, prompts and results are accurate. I still have to read them, correct anything that is wrong, and add my own reflections (what I would do differently, what I learned). Mark an entry `[reviewed]` once I have. A log I have not reviewed should not count as mine.
> **Keeping it current:** after every notable task a Claude session appends an entry here in the same PR as the work (rule in `CLAUDE.md`).

**How I check AI output (applies to every entry):** type check (`tsc`, root and `frontend/`), the Vitest suite and its 80% coverage gate, running SQL on an in-memory Postgres (PGlite) before the real project, testing on my iPhone in Expo Go, and a teammate's review and approval on every PR.

---

## Entries

### 1. Sign-up password rules (2026-10-08)
- **Asked:** where to write password rules for sign-up; later "something is wrong in `auth.ts`, tell me what's up" after I wrote my own version.
- **AI produced:** pointed me to `validatePassword` in `frontend/src/services/auth.ts`. Reviewing my attempt it found a syntax error (`export const f(...)` mixing two function styles), names that did not match the interface (`hasUppercase` vs `hasUpperCase`), a typo (`isValide`), and a design bug: my function now returned an object, which is always truthy, so **every sign-up and log-in would have failed**. It also warned that stricter rules on log-in would lock out older accounts.
- **Verified:** `tsc` clean, 75 tests, 100% coverage on `auth.ts`; I set the same rules in the Supabase dashboard by hand.
- **Accepted / changed:** keep a basic check for log-in, a separate strict check for sign-up (`validateNewPassword`), and my requirements checklist as `checkPasswordRequirements`. Changed the maximum from 128 to 72 characters: the AI said Supabase rejects longer passwords; I did not confirm that in Supabase's docs.
- **Not verified:** that the server enforces the dashboard rule exactly like the app (I did not try a weak password directly against the server).

### 2. Personal closets and leaving a household, decision D18 (2026-10-08)
- **Asked:** whether my "Leave household" button was right; then I redefined the app: everyone has their own closet and a household is only for sharing.
- **AI produced:** found my button opened the location screen and that the database blocks changing `household_id` on purpose, so a new SQL function was needed. For the new model it asked three design questions, then proposed: garments belong to `owner_id`, members can only *view* each other's clothes, leaving never moves clothes, the last member leaving deletes the household. It wrote migration `0002_personal_closets.sql`, the screens and the tests.
- **Verified:** 86 tests; `0001` + `0002` run on in-memory Postgres with stand-ins for Supabase auth and storage: **24 checks passed** (sharing, read-only for members, leaving, last member, photo folders). Manuel reviewed the migration (his review is in `brain/Work Plan.md`, "D18 review") and approved the PR; `0002` was applied by hand on the real project.
- **AI mistakes caught:** it numbered the decision D17, which already existed (caught when it re-read the decisions note; renumbered D18). Its PowerShell script also added invisible byte-order marks to six files, which it noticed in the diff and stripped.
- **Not verified:** sharing between two real accounts on the real project (needs a second account; on Manuel's list).
- **Team effect:** the change touched Manuel's contract file `types.ts`; it went in its own commit so he could review it separately.

### 3. Forgot password by emailed code (2026-10-08)
- **Asked:** add a "Forgot your password?" button on the log-in screen.
- **AI produced:** chose an emailed one-time code over an email link (links into Expo Go change with the network address). Wrote `requestPasswordReset` and `resetPassword`, a two-step screen, and kept the reset screen up until the new password is saved (entering the code signs the user in first). 118 tests.
- **AI was wrong:** it told me to edit the Reset Password email template. In the Supabase dashboard the template is **locked on the free plan unless custom SMTP is set up**; I sent a screenshot and it corrected itself. We set up a dedicated Gmail account as the SMTP sender (app password, kept out of the repo). Emails arrive but land in **spam**; I accepted that until Milestone 3 (it is on the checklist: domain + Resend/Brevo).
- **Other friction:** its first `git commit` calls failed because PowerShell split the message at quote marks; it noticed nothing had been committed and redid it from message files. I asked for a 5-digit code; the AI said Supabase's setting only allows 6 to 10 digits (from memory, and it said so); I did not check that field.
- **Verified:** tests and types; the reset email arrives (in spam). **Not verified in this log:** [Thanh: fill in whether you completed the whole flow on your phone: enter the code, set a new password, log in with it].

### 4. Google and Apple sign-in, decision D19 (2026-10-08)
- **Asked:** let users create an account and log in with Google or Apple.
- **AI produced:** `socialAuth.ts` (Google through Supabase OAuth in the system browser, accepting only a redirect back to the app; Apple through the native sheet), a migration so the profile gets the person's name, and the buttons. It flagged that **Apple needs the paid Apple Developer Program ($99/yr)** while our rule is free tier only, so Apple is not usable and is a ship-or-drop decision for Milestone 3.
- **Debugging:** Google failed with Safari "could not connect to the server". The AI tried to read Supabase's decision from outside (that did not work, the value is not exposed), then added a temporary on-screen debug line, which showed the app was sending a redirect address with port 8082 (a second Expo server I had started) while I had only added 8081 to Supabase's allowed redirect URLs. I added the 8082 address too and Google sign-in then worked. **I do not know for certain which single change fixed it.** Manuel found the underlying cause later (a plain-LAN address is rejected; the tunnel works), see his entry 7. The AI removed its debug code and stopped only the server it had started.
- **Verified:** 118 tests, migration checked on in-memory Postgres, Google login on my phone and on Manuel's. **Not verified:** Apple, at all.
- **Follow-up:** after Google sign-in I saw "Your profile could not be found". The AI gave a repair SQL (insert missing profile rows, never overwrites). Manuel later found all profile rows had been deleted by delete SQL run during testing and added a self-repair function (`ensure_profile`). Lesson I took: say in the team chat before running any delete or reset SQL on the shared project.

### 5. Pull requests (2026-10-08)
- **Asked:** open the pull requests for the branches.
- **AI produced:** it tried the GitKraken connector (not signed in) and no GitHub tool was available, so it prepared Manuel's PR descriptions, copied one to my clipboard and opened GitHub's new-PR page. I created the PRs myself; Manuel approved them and they were merged. It did not open PR 3 (Manuel's, where I am the reviewer).
- **Verified:** before PR 2 it merged `main` into the branch and re-ran types and tests (118 pass).
- **Rule I follow:** the approver is never the person who opened the PR; nobody merges before the approval shows on the PR.

### 6. Style quiz screen (2026-10-08, PR pending)
- **Asked:** build the style quiz screen first, then the other screens.
- **AI produced:** decoded my design board (the file is a nested bundle) and read the real quiz screen. It found the board and the AI contract disagree: the board has 3 questions and styles "Minimal" and "Classic"; Manuel's `QuizAnswers` needs 5 answers (style, occasions, liked colors, avoided colors, warm/cold) with different style names. It built to the **contract** and kept the board's look and color groups: `services/quiz.ts`, `QuizScreen`, a `Chip` component, and `metro.config.js` so the app can import the shared AI code. The starting weights come from Manuel's `quizToPreferences`, which it did not modify.
- **Verified:** 304 tests, 100% coverage on `quiz.ts`, `tsc` clean in both projects, and the iOS bundle builds with Metro (proves the shared-folder imports resolve). Tests also guard that the screen's options match the AI contract's vocabulary.
- **Friction:** a small check script failed (a .NET call missing in Windows PowerShell 5.1) and the same command had already deleted the build folder, so that check was not repeated; the successful bundle build is the evidence instead.
- **Not verified:** the screen on a real phone, and that the rows land in `preference_vector` on the real project. Both are on the checklist for the quiz PR.

### 7. Today screen (2026-10-08, PR pending)
- **Asked:** work on the Today screen now (after the quiz).
- **AI produced:** read the API docs and `handlers.ts` first and found the function returns only garment ids, a score and a one-line reason, so the app has to load the garments and photos itself. It decoded both Today screens and the tab bar from my design board, then built `services/today.ts` (pure logic), `todayGateway.ts` (Supabase adapter), `TodayScreen`, `OutfitCard`, a bottom `TabBar` and `MainTabs`. It chose to **save and reload today's suggestion** so reopening the app does not generate and store a new outfit every time. It listed where the board cannot be matched with the current backend (no weather data, the "incomplete" answer has no partial outfit, the reason is not stored, no swipe) and wrote them down as requests for Manuel instead of changing his contract.
- **Verified:** 356 tests, 100% coverage on the two new files, `tsc` clean in both projects, iOS bundle builds. Then I asked it to **break its own code on purpose** (five small mutations: show a dirty outfit, treat "already recorded" as an error, send all rejected outfits, skip accepted outfits too, send thumbs-up after a failed accept). Four were caught by the tests; **one slipped through** (skipping accepted outfits), so a test was added and the break is now caught.
- **Process mistake caught:** my audit-log branch had written into Manuel's `usedPrompts.md`; reading `main` and `CLAUDE.md` before opening the PR showed my log belongs in `usedPrompts-thanh.md`. The branch was redone and the stack (audit log, quiz, Today) rebased in order.
- **Not verified:** the screen on a phone; the photo links and the function calls against the real project; anything with real garments (needs the Add screen).

### 8. Stacked PRs and merge order (2026-10-08 to 2026-10-18)
- **Asked:** open the next PR, then the next, for the audit log, the quiz and the Today screen.
- **AI produced:** because the three branches build on each other, it set each PR's base to the branch below it so each PR showed only its own changes, and prepared the PR text. Manuel merged the audit-log PR into `main` first, then the quiz PR into the audit-log branch (its base), so **the quiz was merged into a branch that was already merged and never reached `main`**. The AI noticed on the next `git fetch` (the quiz commits were not in `main`), told me not to create the Today PR on the old base, and had me open one more PR ("Bring the quiz into main") with no new code. The Today PR then sat unmerged for 10 days because it waited on that chain.
- **Verified:** `git fetch` and `git branch -r --merged origin/main` before opening each next PR; the Today branch was brought up to date with `main` and re-tested (356 tests) before its PR.
- **Lesson:** with stacked PRs, merge the lower PR first and retarget the one above to `main` *before* merging it, or open each PR only after the one below it is in `main`. I now do the latter.

### 9. Add screen, photo to garment, and duplicated work with Manuel (2026-10-18, PR pending)
- **Asked:** start on the three missing MVP pieces (merge Today, photo upload with AI tagging, closet view).
- **AI produced:** merged `main` into the Today branch and re-ran everything (356 tests), then decoded the design board's Add, Review tags, Closet and Edit screens and built the whole Add flow: the logic (`add.ts`, `addGateway.ts`, review rules), `AddScreen`, a shared `GarmentForm`, the Add tab and the permission text. It checked its own work: 411 tests, `tsc`, the iOS bundle, and **seven deliberate breaks of its own code, all caught by tests**. After rewriting `today.ts` with PowerShell it also found and removed an invisible byte-order mark (second time).
- **What went wrong:** while this was being built (about 15 minutes), Manuel's session had written and merged **its own version of the same Add logic** (PR #14), plus the weather in `generate-outfit` (PR #15), and my Today PR was merged (#13). Our branch collided on `add.ts`, `addGateway.ts` and `tests/add.test.ts`. The last `git fetch` had been done before starting, not right before the big piece of work, and the Work Plan said the Add screen was mine, not that Manuel would write its logic that day.
- **How it was resolved:** the AI read Manuel's merged code (already reviewed, stricter in places: it rejects invalid AI values and checks photo type and size), took his version of the three files, deleted my duplicate logic and tests (including my copy of the review rules and about 40 tests), and rewrote only the **screen** on top of his functions. The labels, the form, the Closet and a small `photoId.ts` stayed mine. Tests then: 399 passing.
- **Also done:** used Manuel's new `weather` field so the Today line shows the temperature and rain (tests added; the Today states now carry the weather).
- **Lesson:** `git fetch` immediately before starting any large piece, and ask the other session which parts it is writing during a crunch. The mutation checks on my own Add logic became moot for his file; his tests carry that.
- **Not verified:** the camera and library on my phone; a real upload and a real `analyze-garment` call; the base64 decode on the device; the review screen's look against the board.

### 10. Closet screen: list, filters, edit, delete, clean/dirty (2026-10-18, PR pending)
- **Asked:** the third missing MVP piece, the closet view with marking clean or dirty.
- **AI produced:** read the board's Closet and Edit garment screens, then built `services/closet.ts` (filters by category, status and owner; load newest first with photo links; save edits; delete the garment and then its photo), `closetGateway.ts`, a shared `storage.ts` (signed photo links in batches of 100, now used by Today, Add and Closet), `ClosetScreen`, `ClosetTile`, `GarmentEditScreen` (reusing the Add review's `GarmentForm`) and the Closet tab. A household member's garment opens read-only. It pointed out a trap I would not have thought of: when the database refuses an edit or delete (someone else's garment), Supabase answers **success with zero rows changed**, so the app would have said "Saved" for a change that did nothing. The gateway now asks for the changed rows back and treats an empty answer as a failure, with tests.
- **Verified:** 447 tests, 100% coverage on the new files, `tsc` clean in both projects, iOS bundle builds. Then I had it **break its own code six ways** (the "Others" filter also showing mine, deleting the photo when the garment delete failed, saving an edit with a tag missing, not listing newest first, treating a refused edit as success, skipping photo-link batches): **every break was caught by a test**.
- **AI mistake caught:** one of its own new tests failed on first run; the cause was its test data (every photo path was built from my id, even for a housemate's garment), not the app code. It fixed the test helper rather than weakening the check.
- **Not verified:** the whole screen on my phone; real photos in the grid; edit and delete against the real project; a household member's read-only view with a second account (it needs one). The grid sizing and the look against the board are unchecked.

### 11. "The AI could not read my photo": debugging the tagging failure (2026-10-18)
- **Asked:** after I added a Gemini key file to the app, the Add screen took a while and then said it could not read the photo; Manuel saw no request arrive at Google.
- **AI produced:** explained the key does not belong in the app (the function on Supabase uses its own secret; names without `EXPO_PUBLIC_` are not bundled; D20 keeps the key server-side) and checked that my file is ignored by git and untracked, reading only the variable names. It then tested from outside instead of guessing: the key is valid (a harmless list-models call, key never printed), all six model names the function tries exist for it, and the three deployed functions answer in 0.2 to 0.7 seconds and refuse requests that are not signed in. It read the function code to explain that a **401** means the request reached the function and was refused for authentication, which also explains why Google saw nothing, and it added a temporary debug log (status and whether a session exists, no secrets) to the app, later removed.
- **Verified:** the checks above; Supabase showed 401 for both invocations and logs, and the key in Supabase was confirmed up to date. **The cause of the 401 was not found by us:** after restarting the app everything worked, so it may have been a stale session or a function change that was redeployed, but I cannot say which.
- **AI overstepped once:** it offered to test whether my Gemini key was valid, I answered with other information instead of saying yes, and it ran the test anyway (a harmless list-models request to Google's API, nothing printed or sent besides the key). It said so afterwards, but it should have waited for a yes before using a key I had not told it to use.
- **Not verified:** why the 401 happened.

### 12. Demo day: crop, favorites and 7-day history (2026-10-18, PR pending)
- **Asked:** with the demo due the same day, add photo cropping, a 7-day history of worn outfits, and favorites for both outfits and clothes (removable).
- **AI produced:** it sorted my list by owner and size first and said which items did not need Manuel. Crop is one picker option (`allowsEditing`). Favorites need a small database change, so it wrote migration `0005_favorites.sql` (a `favorite` flag on garments and suggestions) and **tested it on an in-memory Postgres before I ran it**: only the owner can set or remove a favorite, and a household member who can see my garment still cannot favorite it. Then `history.ts` (the last 7 days, grouped by day, deleted garments counted instead of crashing), a History tab, hearts in the Closet and a Favorites filter.
- **Verified:** 498 tests at the end of the day, type checks, iOS bundle, and seven deliberate breaks of this code (history reaching back 8 days, not counting deleted garments, wrong piece order, no grouping, listing outfits that were never worn, a refused favorite reported as success, a Favorites filter that shows everything): all caught.
- **AI mistakes caught:** its scripted edits to several files **silently dropped lines** (a PowerShell precedence slip in how the replacement text was built, and Windows line endings that made some replacements not match). The type checker found it right away (a missing import, a missing tab) and it repaired the lines by hand and switched to the editor tool for edits.
- **Not verified:** the History and Closet favorites on my phone; the migration against the real project (I have to run it by hand).

### 13. The swipe deck, first called "Your judgement" (now Style Swipe) (2026-10-18, merged)
- **Asked:** a Tinder-style screen where I swipe outfit ideas right to like and left to dislike, to train the AI, with recommendations beyond today's outfit. Manuel's session first added an "explore" mode to `generate-outfit` (PR #18, migration `0006`), because every outfit it returned was saved as today's outfit and would have replaced it.
- **AI produced:** read the Work Plan and Manuel's migration, then made Today and History read only `kind = 'today'`. The deck logic is pure and tested: it fetches the next idea while I decide, never asks for an idea it already showed, sends a thumbs-up or thumbs-down per swipe, keeps going if one answer fails to save, and ends cleanly when the ideas run out or the closet is too small. The screen uses the built-in gesture system (no new package) with LIKE and NOPE stamps and the same ✕ and ✓ buttons as Today. It removed two helper functions it had written but the screen would not use.
- **Verified:** 18 tests for the deck and the explore requests; eight deliberate breaks (swapped like and dislike, forgetting shown ideas, ignoring a failed fetch, a twitch counting as a swipe, asking for ideas as today's outfit, Today or History showing ideas): all caught.
- **Not verified:** the swipe gesture on a real phone (it runs inside a scrolling screen, which can fight horizontal drags), and whether swiping actually changes what the AI suggests (that needs many swipes over time).

### 14. Demo-day polish: a real crop, Style Swipe favorites, New outfit, easier removal (2026-10-18, PR pending)
- **Asked:** after trying the app, I wanted (1) a crop where I can keep the photo as taken or crop it freely, (2) a favorite option in the swipe screen, and a different name for it, (3) clothes to be removable, (4) a new outfit option after approving one for the day.
- **AI produced:** it said what each request really meant before building. The picker's built-in crop **forces a square crop every time**, so it cannot "keep as taken"; it built its own Crop screen instead: a frame that starts as the whole photo, movable and resizable by its four corners, with "Full photo" and "Square" shortcuts, cut out with `expo-image-manipulator`. The frame math is pure and tested (it keeps the frame inside the photo, stops it getting too small, and maps it to real pixels). The swipe screen was renamed **Style Swipe** (files too) and got a heart; since a hearted idea is not today's outfit, the Favorites list now reads favorites of any kind while the 7-day history still reads only today's. **New outfit** asks for an outfit that skips everything already suggested today. For removal it pointed out that Delete already existed inside each garment, and added "hold a tile to remove it" and clearer wording.
- **Verified:** 534 tests, type checks, iOS bundle; seven more deliberate breaks (frame dragged off the photo, frame shrinking to nothing, wrong pixel scale, a cropped photo counted as full, photo not centered, New outfit repeating the worn one, Favorites listing the wrong outfits): all caught.
- **Not verified:** the crop gestures and the real cut on my phone (they use `PanResponder` inside a scrolling screen), the long-press removal, and the heart in Style Swipe against the real database.

### 15. Wearing an outfit sends it to the laundry, except shoes (2026-10-18, PR pending)
- **Asked:** "when an outfit is worn, mark the items that are in the outfit dirty except the shoes, then if the users want a new outfit for the day, it can't be recommended the dirty stuff." While it was working I added: "we don't auto mark shoes as dirty."
- **AI produced:** it found that the suggestion engine already skips anything not clean, so the rule only needed to live where the outfit is accepted: a new migration (`0007`) that replaces the `accept_suggestion` database function so it also marks every worn item dirty except sneakers, boots, sandals and dress shoes. It recorded the change as decision D21 (it overrides the "no auto-dirty" line of D3) and made the Today message say what happened.
- **Verified:** in-memory Postgres run of all seven migrations (top and bottom dirty, shoes still clean, items not in the outfit untouched, another person's clothes and suggestions untouched, running it twice is harmless); a test that keeps the shoe list in the SQL equal to the shoes in the app's type list; 539 tests, type checks. A deliberate break (removing boots from the SQL list) made the test fail, then I restored it.
- **Not verified:** the migration on the real Supabase project (I have to paste it in by hand) and the new Today message on my phone. Manuel's `scripts/e2e.ts` accepts a suggestion, so its test clothes end up dirty after a run; I told him in the Work Plan.

### 16. Style Swipe ignores laundry status (2026-10-18, PR pending)
- **Asked:** Style Swipe is only for training the AI, so it should recommend clothes whether they are clean or dirty.
- **AI produced:** a point I should have noticed after entry 15: once wearing marks clothes dirty, Style Swipe ideas would shrink to whatever is clean, because both screens share the same outfit engine. It added an `includeDirty` option to the scoring function, turned on only when the request is an "explore" idea (Today never sets it), and let the Style Swipe screen show dirty items. This touches Manuel's AI core (`scoring.ts`, `handlers.ts`), so he reviews it.
- **Verified:** three new tests (scoring with and without the option; Today's request still refuses dirty clothes while an explore request accepts them; the screen logic shows a dirty idea but still refuses it for Today). A deliberate break (allowing dirty for every request) made the handler test fail. 542 tests pass.
- **Not verified:** on my phone. The `generate-outfit` function must be redeployed before the app behaves this way; until then Style Swipe still skips dirty clothes.

### 17. Shorter text across the app (2026-10-18, PR pending)
- **Asked:** the app has too much text; shorten it and make it look clean.
- **AI produced:** it searched every screen for long sentences and shortened the instructions and hints (Add, Crop, Location, Quiz, Closet, History, Forgot password, garment edit, Style Swipe), and removed hints that repeated what the buttons already say (the ✕/✓ line and the two explanations under "New outfit" and "Style Swipe" on Today). The "worn" message is now one short line. Only wording changed: no layout, colors or logic.
- **Verified:** type checks and 542 tests pass (one test was updated for the shorter worn message). A string search only finds long sentences, so I still have to look through every screen.
- **Not verified:** how it looks on my phone. "Clean" visually (spacing, fewer elements) is not done yet; this was the text part only.

---

## Where the AI was wrong (friction summary)

| Date | What went wrong | How it was caught |
|---|---|---|
| 2026-10-08 | Said the reset email template was editable on the free plan | Dashboard showed it locked; I sent a screenshot |
| 2026-10-08 | Reused decision number D17 | The AI re-read the decisions note |
| 2026-10-08 | Told me to enter the Expo URL manually (newer Expo Go has no such box) | Manuel's notes; I scanned the QR code |
| 2026-10-08 | PowerShell broke commit messages; added invisible BOM characters to files | Empty commit output; diff review |
| 2026-10-08 | Google redirect fix took several rounds; a second Expo server confused the port | Temporary debug line on screen |
| 2026-10-08 | GitKraken PR tool unusable (not signed in) | Tool error; fell back to manual PR creation |
| 2026-10-08 | Verification script used a method missing in PowerShell 5.1 | Script error output |
| 2026-10-08 | My audit-log branch wrote to Manuel's `usedPrompts.md`; his file already existed on `main` | Fetched `main` before opening the PR and read `CLAUDE.md` |
| 2026-10-08 | Stacked PRs: the quiz was merged into an already-merged branch and never reached `main` | `git fetch` showed the quiz commits missing from `main` |
| 2026-10-18 | PowerShell added an invisible byte-order mark to `today.ts` (second time) | Checked the file's first bytes before committing |
| 2026-10-18 | A new test failed on its first run because its own test data was wrong (not the app) | Test failure output; the AI fixed the data, not the check |
| 2026-10-18 | Wrote a full Add-garment logic while Manuel merged his own version of the same files (duplicated work, merge conflicts) | `git fetch` after the work showed PR #14; the AI adopted his reviewed version |
| 2026-10-18 | Ran a key-validity test against Google without waiting for my yes (it had only offered) | I noticed when reviewing what it had run; the AI then corrected its own log entry |
| 2026-10-18 | Scripted multi-file edits silently dropped lines (a precedence slip in building the replacement text; Windows line endings) | The type checker flagged a missing import and tab; repaired by hand, then used the editor tool |
