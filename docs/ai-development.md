# How We Use AI to Develop This App

This project is built with AI coding tools and also contains AI features. This document explains both and, more
importantly, how we make sure AI output is correct before it ships. The course grades process and verification, so
this is written around evidence rather than tool names.

## 1. Tools

| Tool | Where we use it | What for |
|---|---|---|
| **Claude Code in VS Code** (extension) | Main editor, Manuel and Thanh | Reading the repo, writing and editing code and tests, explaining diffs, drafting docs |
| **Claude Code in the terminal** | Manuel | Longer, command-heavy work: running tests, `git` and `gh`, deploying edge functions, running the end-to-end scripts against the real project |
| **Supabase MCP server, read-only** | Manuel's Claude Code sessions | Lets the AI list tables, run read-only SQL, read logs and run Supabase's security advisor on the one project. It cannot change anything; changes are applied by a person |
| **Gemini API** (vision model) | Inside the product | Tags garment photos (`analyze-garment`). A product component, not a coding tool |
| **Obsidian / Markdown notes** | Team memory | `brain/` is the shared memory that both people and AI sessions read |

Models used for development: Claude Opus 5.5 and Sonnet 5.5 through Claude Code. For tagging: Gemini flash models, with
flash-lite as a last resort (fallback chain in `supabase/functions/_shared/gemini.ts`).

The VS Code extension is best for editing with the file in view; the terminal is best for tasks that are mostly commands
and output. Both read the same `CLAUDE.md`, so they behave the same way.

## 2. Shared context: how the AI knows our project

- **[CLAUDE.md](../CLAUDE.md)** is the shared context file every session reads first: course milestones, who owns
  what, tech stack, conventions, current status, and rules such as "never commit secrets" and "don't self-merge PRs".
  Keeping it current is part of the work.
- **[brain/](../brain/)** holds the decision log (D1 to D22), the work plan with runbooks, the design notes, and the
  AI tuning log. Sessions read it at the start and update it in the same PR as the code, so a new session (or a new
  teammate) can pick up without a long explanation.
- **Contracts first.** Types, the tag vocabulary and the edge-function request/response shapes
  (`supabase/functions/_shared/`) are agreed before implementation. The AI builds against them and the tests enforce them.

## 3. Division of work between people and AI

| Area | Owner | AI's role |
|---|---|---|
| Vision tagging, outfit scoring, preference learning, evaluation | Manuel + Claude | Drafts prompts, schemas, pure modules and tests; Manuel reviews every change |
| Migrations and RLS, auth, households, UI screens, deploy | Thanh (with Claude Code) | Drafts screens and SQL; verified before use (see section 5) |
| Architecture, contracts, review standards | Manuel (tech lead) | Proposes options; the human decides and records the decision |

Requirements came from an interview: Claude asked structured questions, we answered, and the answers became the decision
log. The AI proposes, a person decides, and the decision is written down.

## 4. How AI is built into the product

- **Garment tagging (Gemini).** The model returns type, color, season and warmth with a confidence per field. A pure
  validator normalizes the answer against a fixed vocabulary and flags anything missing or doubtful (`needs_review`).
  The app **never saves AI tags without the user confirming them**, because measured confidence did not separate right
  answers from wrong ones.
- **Outfit engine.** Deliberately *not* an LLM. It is deterministic scoring (weather fit, preference match, repeat
  penalty) so results are testable and explainable.
- **Learning.** Thumbs up/down move weights on `type:` and `color:` tags; the quiz seeds the starting weights.

## 5. How we verify AI-generated work

We treat AI output as an unreviewed draft. For each change we use as many of these as fit:

1. **Type check and unit tests** (`npm run typecheck`, `npm run test:coverage`) with an 80% coverage gate in CI.
2. **Mutation checks.** We deliberately break the code (zero a weight, allow a dirty item) and confirm the tests fail.
   If they still pass, the tests are too weak.
3. **Seeded fuzzing and simulated users.** Thousands of random inputs for the validator; a simulated user with a hidden
   taste to check that feedback learning behaves sensibly. This exposed a real flaw: a disliked item kept being
   suggested because the repeat penalty outweighed the learned dislike, so the weights were retuned with before/after numbers.
4. **Measured accuracy.** Manuel hand-labelled 23 real photos. Re-measured on 2026-11-06 with first-choice ("strict")
   labels, two runs per prompt: type 96 to 100%, color 87 to 91%, season 83 to 87%, warmth 87%. Two identical runs differ
   on about 4% of fields, so we only trust differences larger than that. The older "season is the weakest at 73%" figure
   did not reproduce, so we did **not** tune the season prompt to it. We report the weak spots (season and warmth are
   subjective; clean product photos only; one labeller) instead of only the headline number.
5. **Real-project checks.** `scripts/e2e.ts` (38 of 38 checks, last run 2026-11-06) and `scripts/e2e-household.ts` (34
   of 34) run against the deployed stack with throwaway accounts and clean up after themselves. SQL is first run on an
   in-memory Postgres. After each deploy we call the live function as a test user and look at the response.
   Supabase's security advisor is read through the read-only connection after any change to functions or policies.
6. **Manual device testing** on an iPhone in Expo Go.
7. **Human review.** Every PR needs a teammate's approval; nobody self-merges.

### Examples where verification caught AI mistakes

- The first outfit handler crashed on an invalid date, and a retried feedback request could be counted twice. Both were
  found by tests and fixed (validate the date; claim the feedback row first).
- A model was chosen from a list without a test call (`gemini-2.5-flash`); it was retired for new keys (HTTP 404). We
  added a fallback chain across models and quota-aware error handling.
- The free tier's 20 requests per day per model was too small for a user adding a whole closet. We recorded the
  decision to enable billing (D20) and made the app fall back to manual entry on a 429.
- A "photo access removed" check looked like it passed, but a cached response hid the real result; the policy was
  confirmed with a cache-bypassing check.
- The household test script's cleanup ran even when its safety check had refused to start, and made an account leave a
  household it had not created. The cleanup now only undoes what the script itself did.
- Two of the AI's migration tests contained literal backspace characters instead of `\b`, so they could never fail.
  **Thanh's review found it**; the fix was verified by adding a forbidden statement (the test fails) and a comment (it passes).
- Supabase's security advisor warned that the public key could execute all our database functions. The AI did not take the
  warning on trust: it read the function bodies and found `create_household()` inserted a row before checking who was
  calling. Migration 0008 closed it, tests check the migration, and a live call confirmed signed-out callers are
  refused while signed-in calls still work. The tests also caught a mistake in the first version of the migration (it
  named a function our migrations do not create, which would have failed on a fresh database).
- The AI misread a teammate's note ("Style Swipe ignores laundry status") as "respects laundry" and said no deploy was
  needed. Reading the pull request showed the opposite was meant (the deck may use dirty clothes); it was corrected, the
  code reviewed and tested, deployed, and verified live.
- Mutation checks found a weak test: removing a clamp in the crop code survived until a case that overshoots the edge
  was added.
- A decision reversed with evidence: sign-up confirmation by emailed code was built, then removed because the email
  template still sent a link (the screen would have asked for a code that was never sent).

## 6. Rules we follow

- **No secrets in prompts, code or logs.** Keys live in git-ignored `.env` files and Supabase secrets. The repo is public.
- **No personal photos or course materials** in the repo or in `brain/`.
- **Log changes to AI behavior.** Any prompt, model or weight change is recorded with a before/after metric in
  [brain/AI Logic Ownership.md](../brain/AI%20Logic%20Ownership.md).
- **Flag paid dependencies** before adding them. Gemini billing is the one documented exception.
- **Humans stay accountable.** We must be able to explain how each piece of AI-written code was checked.

## 7. The AI audit log

Each teammate keeps a personal log: [usedPrompts.md](../usedPrompts.md) (Manuel) and
[usedPrompts-thanh.md](../usedPrompts-thanh.md) (Thanh). After every notable task a Claude session drafts an entry in
the same PR: what was asked, what the AI produced, how it was verified, what we changed or rejected, and failures. The
owner then reads and rewrites it in their own words and marks it `[reviewed]`.

## 8. What we have learned

- Writing the contract and the tests first makes AI output much easier to check.
- A shared context file saves repeated explanations and keeps two people's sessions consistent.
- Give the AI read-only access to production first. It found a real security hole by reading, and nothing could be
  changed without a person approving it.
- Measure before tuning: run the same prompt twice to learn the noise, and do not chase a gap smaller than it.
- AI is fast at producing plausible code; our contribution is deciding what to build, measuring it, and catching what
  looks right but is not.
- Model names, quotas and prices change under you. Re-test the chain before a demo.
