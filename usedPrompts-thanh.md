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

### 9. Add screen, photo to garment (2026-10-18, PR pending)
- **Asked:** start on the three missing MVP pieces (merge Today, photo upload with AI tagging, closet view).
- **AI produced:** merged `main` into the Today branch and re-ran everything (356 tests), then decoded the design board's Add, Review tags, Closet and Edit screens. It built the Add flow: `services/add.ts` (upload, ask `analyze-garment`, review, save), `addGateway.ts`, `garment.ts` (labels and the review rules: every field the AI flagged or left out must be checked before saving), `AddScreen`, a shared `GarmentForm` (reused later for editing), the Add tab and the camera/photo permission text. It also moved two helpers into shared files so Today and Add use one copy (labels; the edge-function call) and checked the existing tests were unchanged (356 still passed).
- **Verified:** 411 tests, 100% line coverage on the new files, `tsc` clean in both projects, iOS bundle builds. Then I had it **break its own code seven ways** (accept any photo size, keep a photo the AI refused, delete the photo on an AI limit, save without checking flagged tags, not flagging tags the AI left out, confirming a tag with no value, overwriting an existing photo): **every break was caught by a test**.
- **AI mistakes caught:** after rewriting `today.ts` with PowerShell it had again added an invisible byte-order mark to the file; it checked the first bytes, found it and removed it before any commit.
- **Not verified:** the camera and library on my phone; a real upload and a real `analyze-garment` call against the project; that the base64 decoding works on the device. The review screen's look is unchecked against the board.

### 10. Closet screen: list, filters, edit, delete, clean/dirty (2026-10-18, PR pending)
- **Asked:** the third missing MVP piece, the closet view with marking clean or dirty.
- **AI produced:** read the board's Closet and Edit garment screens, then built `services/closet.ts` (filters by category, status and owner; load newest first with photo links; save edits; delete the garment and then its photo), `closetGateway.ts`, a shared `storage.ts` (signed photo links in batches of 100, now used by Today, Add and Closet), `ClosetScreen`, `ClosetTile`, `GarmentEditScreen` (reusing the Add review's `GarmentForm`) and the Closet tab. A household member's garment opens read-only. It pointed out a trap I would not have thought of: when the database refuses an edit or delete (someone else's garment), Supabase answers **success with zero rows changed**, so the app would have said "Saved" for a change that did nothing. The gateway now asks for the changed rows back and treats an empty answer as a failure, with tests.
- **Verified:** 447 tests, 100% coverage on the new files, `tsc` clean in both projects, iOS bundle builds. Then I had it **break its own code six ways** (the "Others" filter also showing mine, deleting the photo when the garment delete failed, saving an edit with a tag missing, not listing newest first, treating a refused edit as success, skipping photo-link batches): **every break was caught by a test**.
- **AI mistake caught:** one of its own new tests failed on first run; the cause was its test data (every photo path was built from my id, even for a housemate's garment), not the app code. It fixed the test helper rather than weakening the check.
- **Not verified:** the whole screen on my phone; real photos in the grid; edit and delete against the real project; a household member's read-only view with a second account (it needs one). The grid sizing and the look against the board are unchecked.

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
