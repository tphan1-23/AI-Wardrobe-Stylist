---
class: SWE-AI
course: CSCI 4397 / 6397
status: active
tags: [project, capstone, swe-ai, design]
---

# Design Notes — DressWell app

Source of truth: `docs/Wardrobe App.html` (design board, 11 phone screens at 390×844, made by Thanh). It is a bundle; each screen is a small inline-styled HTML template. To read one screen at a time, decode the inner `__bundler/manifest` of the board and print the `__bundler/template` of each screen (the screens are in `page_order`).

## Design system (implemented in `frontend/src/theme.ts` and `frontend/src/components/common/`)
- **Look:** high-contrast black and white. Ink `#000`, paper `#fff`, muted `#595959`, rule `#d4d4d4`. Font **Instrument Sans** (400/500/600/700).
- **Controls:** 52 px inputs and buttons, 12 px radius, 1.5 px black border; segmented control 44 px, 10 px radius; cards 16 px radius, 1.5 px border.
- **Errors are never color-only:** the field border gets thicker (2.5 px) and an alert icon plus message appears under it (`ErrorLine`).
- **Icons:** 24×24 line icons, 1.75 stroke, rounded caps (`Icon`; paths copied from the board).
- **Onboarding:** a step bar (`StepIndicator`) above the title.

## Screens: status
| # | Board screen | App screen | Status |
|---|---|---|---|
| 1 | Log in | `AuthScreen` (Log in / Sign up segmented control) | done |
| 2 | Create or join household | `HouseholdScreen` | done |
| 3 | Location | `LocationScreen` (also used from Household → Change) | done |
| 11 | Household | `HomeScreen` (name, invite code + Copy, profile rows, Log out) | done |
| 4 | Style quiz | `QuizScreen` (shown once, after location) | built; not yet checked on a device |
| 5, 6 | Today / Today, missing shoes | — | not built (needs `generate-outfit`) |
| 7, 8 | Closet / Edit garment | — | not built (needs closet) |
| 9, 10 | Add / Add: review tags | — | not built (needs upload + `analyze-garment`) |

## Deliberate differences from the board
- **Step count:** the board says "of 3" because household was step 1. Households are optional now (D18), so onboarding is **Location (step 1 of 2), then Style quiz (step 2 of 2)**.
- **Quiz questions follow the AI contract, not the board.** The board has three questions (style, colors, warm or cold). Decision D8 and the `QuizAnswers` type also need **occasions** and **avoided colors**, so the screen asks five: style, occasions, colors you reach for, colors you avoid, warm or cold. The board's styles "Minimal" and "Classic" are not in the contract's vocabulary (casual, smart casual, streetwear, sporty, formal), so the screen offers the contract's five. The board's color groups are kept (Black and white, Neutrals, Earth tones, Bright colors) and expand to exact tag-schema colors in `services/quiz.ts`; the groups never overlap, and a group cannot be both liked and avoided.
- **Quiz rules:** at least one style is required, everything else is optional, "In between" is preselected. There is no Skip, because finishing is what marks the quiz as done. It is first-time only: saving again would overwrite what thumbs up/down have since taught, so the Household tab has no "Style quiz" row for now.
- **Invite code:** the board's placeholder says "6 characters"; the database generates **8** hex characters (`0001_init.sql`), so the app says "8 characters". The code is displayed uppercase as on the board; input is case-insensitive.
- **Back button on Location:** the board has Back during onboarding. A household cannot be un-created, so onboarding shows no Back; the "Change location" flow from the Household tab does.
- **Bottom tab bar:** not shown yet, since Today, Closet and Add do not exist. The Household screen is built to sit above it (`top={20}`).
- **Style quiz row** in the Household profile list is omitted (see the quiz rules above).

## Not verified
Checked by typecheck (frontend and root), the Expo/Metro iOS bundle, and unit tests for the new `fieldForError` logic. **Not checked visually on a device** — compare each screen against the board in Expo Go (`cd frontend && npx expo start --tunnel -c`).

## Fix log
- **2026-10-04, Dynamic Island:** the Household screen (design offset 20) slid under the Dynamic Island on newer iPhones. `Screen` now uses `react-native-safe-area-context` (the app is wrapped in `SafeAreaProvider`) and pads by `max(design offset, device top inset + 12)`; the rule is the tested function `screenTopPadding` in `frontend/src/layout.ts`. Every screen benefits, not only Household.
