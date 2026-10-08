**Title:** AI core and deployed edge functions: photo tagging, outfit suggestions, preference learning

**Base:** `main` (open this after PRs 1 and 2 are merged, and merge `main` into the branch first) · **Branch:** `feat/ai-core-d18` · **Author:** Manuel (with Claude Code) · **Reviewer:** Thanh

## What this adds

Everything AI in the app, as pure, tested modules plus three thin Deno functions that are already deployed:

- **Photo tagging.** A Gemini client with a fallback chain of models (one overloaded, rate-limited or retired model does not fail
  the request), a fixed tag vocabulary, and a validator that normalizes the model's answer or drops and flags anything it
  cannot map (`needs_review`). Prompt v1 is generated from the same vocabulary.
- **Outfit scoring.** Top + bottom + shoes from the user's **own** clean garments (D18): weather and warmth fit, season fit,
  preference match, a repeat penalty, re-roll exclusion, and explicit `incomplete` / `exhausted` results.
- **Preference learning.** Quiz answers to starting weights, and a thumbs up/down update rule (a thumbs down teaches faster;
  tags already earned by thumbs-ups resist a single thumbs down). Feedback is accepted once per suggestion.
- **Edge functions** `analyze-garment`, `generate-outfit`, `update-preferences` (`supabase/functions/*/index.ts`). Request
  handlers take their I/O as injected dependencies, so the logic is unit-tested without Deno or a network. The only things a
  caller can do are scoped to their own rows and their own photo folder.
- `scripts/e2e.ts` (end-to-end check against the real project, safe on a real account), `scripts/tag-image.ts` and
  `scripts/eval-tagging.ts` with hand labels in `eval/` (the photos are not in the repo).
- `docs/api_endpoints.md` and `docs/architecture.md` rewritten to match what is deployed (D1 to D20).
- Decision D20: the Gemini API runs on a billing-enabled Google Cloud project (trial credits, budget alert required)
  because the free tier allowed only 20 requests per day per model.

## How it was checked

- Typecheck clean; **242 tests pass**; coverage **100% of lines, statements and functions, 99.62% of branches** on all gated code.
- Tests were checked by deliberately breaking the code (dozens of variants, including removed ownership filters, wrong
  fallback rules and re-introduced household assumptions); every real defect made at least one test fail.
- `deno check` passes on all three entry files; the functions are deployed.
- **End-to-end on the real project with a real account: 39 of 39 checks** (sign-in, 3 security-rule rejections, 7 photos
  uploaded, tagged and saved, outfit from the account's own closet, feedback accepted once then refused with 409, re-roll,
  accept marks items worn, cleanup left 0 rows and restored preference weights exactly).
- **Tagging accuracy** on 23 real clothing photos (one labeller, clean product shots): flash models strict type 95 / color 86 /
  season 73 / warmth 95 %; lenient 100 %. Full numbers, trade-offs and caveats in `brain/AI Logic Ownership.md`.
- Combined with the branches of PRs 1 and 2 in a throwaway copy: 274 tests pass, typecheck clean.

## Not covered, and why

- The three `index.ts` entry files and `_deno/serve.ts` are not unit-tested (they need Deno and a live project); they hold no
  logic and are exercised by the end-to-end script and `deno check`.
- Not measured: whether people find the suggestions good, behaviour on messy real phone photos, and two-person household
  sharing. The model's confidence has never flagged a wrong tag, so the app must always make the user confirm tags.
- Gemini free-tier limits no longer apply, but costs should be watched (budget alert).

## For the reviewer

Please look especially at: `analyze-handler.ts` (a user can only tag photos in their own folder), `supabase-deps.ts` (every
query is scoped to the caller), `handlers.ts` (feedback is claimed atomically before weights change), and `scripts/e2e.ts`
(cleanup always runs and removes only what the run created).

Please open **Files changed**, then **Review changes**, then **Approve** (or request changes) **before** anyone merges.
The approver must be someone other than the person who opened the PR.

## AI use disclosure

Written with Claude Code. Every change was reviewed by a person; behaviour was verified with tests that were themselves
checked by deliberate breakage, a live end-to-end run, and a measured evaluation, not only by reading the code.
