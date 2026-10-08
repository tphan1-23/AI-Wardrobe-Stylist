---
class: SWE-AI
course: CSCI 4397 / 6397
status: draft
tags: [project, capstone, swe-ai, ai-logic, evaluation]
---

# AI Logic Ownership (Manuel + Claude)

Decision D13/D14 in [[AI Wardrobe - Requirements & Decisions]]. This note is the working plan for everything "AI" in the app: what we build, how we measure it, how we tune it.

**Accountability:** Manuel is the accountable human owner. Claude drafts, evaluates and tests; Manuel reviews every change and Thanh reviews every PR. Course policy: unverified AI output is the student's responsibility, so each tuning change needs evidence (metric before/after), not a feeling.

## Scope

| Area | What we own | Where it lives (target) |
|---|---|---|
| Vision tagging | Prompt, structured-output schema (enumerated `type`/`color`/`season`, `warmth` scale), validation, handling of bad/multi-item photos, rate-limit/failure behavior | `supabase/functions/analyze-garment/` + shared pure module |
| Outfit scoring | Slot selection (top+bottom+shoes), weather fit, preference match, repeat penalty, empty-slot behavior, re-roll exclusion | `supabase/functions/_shared/` pure TS (imported by `generate-outfit`) |
| Preference learning | Quiz answers → initial `preference_vector`; feedback update rule (magnitude, decay, normalization) | `supabase/functions/_shared/` + `update-preferences` |
| Evaluation & tests | Labeled photo set, accuracy metrics, golden fixtures, property tests, regression checks in CI | `tests/`, `brain/eval/` (results) |

Thanh's code calls these modules through the agreed contracts (types + function request/response shapes); she does not need to know scoring internals.

## How we measure (so tuning is evidence-based)

- **Tagging accuracy:** a small labeled set of real garment photos (target 50–100, mixed lighting/backgrounds). Report per-field accuracy (type, color, season, warmth ±1) and a confusion table. Track results per prompt/model version.
- **Scoring:** deterministic unit tests on fixtures (cold day excludes shorts, dirty items never suggested, recently worn penalized, no clean shoes → defined fallback). Property tests: output always valid slots, never contains dirty items.
- **Preference learning:** simulated users (fixed seed) swipe on suggestions; check that weights move in the right direction and converge, and don't collapse to one item.
- **Gates:** AI-core tests run in CI with mocked Gemini/weather; live-model evaluation is manual (free-tier limits) and logged below.

## Tuning log
_Add one row per experiment. Never change a prompt or weight without logging it._

| Date | Change | Metric before → after | Decision |
|---|---|---|---|
| 2026-10-03 | Initial scoring engine (`_shared/scoring.ts`): item score = 0.5·weather fit (80% warmth, 20% season, sandals −0.5 in rain) + 0.3·preference (mean of type/color/season tag weights, clamped ±1) − 0.4·repeat (linear over 7 days, 1.0 if worn today); outfit = mean of 3 items; top 15 candidates per slot. | No real data yet. 29 tests, 100% coverage; 8 deliberate mutations (weights zeroed, dirty/other items allowed, rain/comfort/worn-today ignored) were all caught. | Weights are first guesses, untuned. Tune only against logged user feedback or simulated users. |
| 2026-10-03 | Added preference learning (`_shared/preferences.ts`): quiz → type/color weights (style +0.4, occasion +0.2, favorite color +0.6, avoided color −0.6 wins over favorite); feedback step 0.1 with soft bounds on `type:`/`color:` tags only. Simulated user (30 days, 4 attempts/day, re-roll on thumbs down) exposed a defect: the learned dislike (red weight −0.9995) was **ignored** because preference (0.3, diluted by an unlearnable `season:` tag) lost to the repeat penalty (0.4), so never-worn red items looked "fresh". | Disliked attempts, days 1–15 → 16–30 (color scenario): **44 → 51** (worse). Season tag excluded from preference mean: 43 → 42. Grid over weights (2 scenarios: dislikes red / dislikes shorts, all deterministic): pref 0.3/repeat 0.4: 40→43 and 21→3; 0.5/0.4: 36→18 and 8→0; 0.5/0.3: 19→0 and 6→0 but item reuse 50; **0.5/0.25: 14→0 and 5→0, reuse 8 and 35**; 0.4/0.25: 22→0 and 7→0. | Adopted preference 0.5, repeat 0.25, season excluded from preference mean. Regression tests added. **Caveat:** two synthetic scenarios, ~9–10 item closets, fixed taste — evidence of direction, not of real-user accuracy. Revisit with real feedback. |
| 2026-10-03 | Tag validation (`_shared/tag-validation.ts`) and vision prompt v1 (`_shared/vision-prompt.ts`, built from the tag vocabulary). Validator never throws: normalizes case/spacing/plurals, maps synonyms (tee→t_shirt, grey→gray, autumn→fall…), collapses season lists, rounds warmth, drops anything unrecognized and flags it with `needs_review` (also for confidence < 0.6 or missing confidence). | No real model output yet. 79 tests incl. 2000 seeded fuzz inputs (output always schema-valid or absent); 7 mutations caught (threshold, plural stripping, warmth rounding, confidence clamp, season collapse, low-confidence flag; the prototype-key guard mutant is equivalent). | Synonym tables are guesses; extend them from real Gemini outputs. Prompt v1 is untested against the real model. |
| 2026-10-03 | Feedback learning retune. Handler-level simulation (one red top the user rejects every time) showed red was the first suggestion on **8 of 12 days**: a never-worn disliked item always looks "fresh" and the old symmetric step (0.1) learned too slowly. Tried: faster thumbs-down step (0.1–0.4) and "resistance" (tags already earned by thumbs-ups lose less on one thumbs-down, factor `1 − r·max(0,w)`). Evaluated on 3 synthetic scenarios (dislikes a color / one red item / dislikes a type) × 5 seeds, clean and with 20% wrong thumbs. | Summed disliked suggestions in days 1–15 (clean) / days 16–30 (20% noisy) / item reuse (clean): down 0.1: 135 / 31 / 365 · 0.15·r0.5: 90 / 25 / 780 · **0.2·r0.5: 75 / 29 / 730** · 0.3·r0.5: 50 / 44 / 725 · (single run, 0.4·r0.5 collapsed under noise: 26 disliked late in one scenario). Handler loop: red suggestions 8 → 4 in 12 days, none in the last 8. | Adopted up 0.1, down 0.2, resistance 0.5. **Trade-off accepted:** ~45% fewer early bad suggestions but roughly 2× more repeated items than the slow setting; faster rates also overreact to wrong thumbs. Synthetic users only; revisit with real feedback. |

## Known limitations of the scoring engine
- Season is derived from the date assuming the northern hemisphere.
- No color coordination or layering (stretch goals); outfit score is a plain mean, so one badly matched item can be offset by two good ones.
- Quiz style/occasion answers are expressed as `type:` affinities (garments have no style/occasion tags), so they only steer toward types, not more.
- Whole-outfit feedback has credit-assignment noise: thumbs down on a red outfit also blames the innocent items in it. Resistance reduces this but does not remove it; a faster down-rate trades speed for more repeated items and more sensitivity to wrong thumbs.
- Item reuse is high in small closets (few valid choices per slot); the repeat penalty cannot fix a closet that is too small.

## Open items
- [ ] Choose Gemini model/version and fix the tag schema (blocks the eval set)
- [ ] Build the labeled photo set (privacy: only our own / consenting photos — repo is public, do not commit identifiable photos)
- [ ] Define scoring formula weights and the feedback update rule
- [ ] One-piece garments, outerwear, empty-slot behavior
