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
| | | | |

## Open items
- [ ] Choose Gemini model/version and fix the tag schema (blocks the eval set)
- [ ] Build the labeled photo set (privacy: only our own / consenting photos — repo is public, do not commit identifiable photos)
- [ ] Define scoring formula weights and the feedback update rule
- [ ] One-piece garments, outerwear, empty-slot behavior
