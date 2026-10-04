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
| 4 | Style quiz | — | not built (needs quiz feature) |
| 5, 6 | Today / Today, missing shoes | — | not built (needs `generate-outfit`) |
| 7, 8 | Closet / Edit garment | — | not built (needs closet) |
| 9, 10 | Add / Add: review tags | — | not built (needs upload + `analyze-garment`) |

## Deliberate differences from the board
- **Step count:** the board says "Step 1 of 3 / 2 of 3" because the style quiz is step 3. The quiz does not exist yet, so the app shows "of 2". Change `total` in `App.tsx` and `HouseholdScreen` to 3 when the quiz is built.
- **Invite code:** the board's placeholder says "6 characters"; the database generates **8** hex characters (`0001_init.sql`), so the app says "8 characters". The code is displayed uppercase as on the board; input is case-insensitive.
- **Back button on Location:** the board has Back during onboarding. A household cannot be un-created, so onboarding shows no Back; the "Change location" flow from the Household tab does.
- **Bottom tab bar:** not shown yet, since Today, Closet and Add do not exist. The Household screen is built to sit above it (`top={20}`).
- **Style quiz row** in the Household profile list is omitted until the quiz exists.

## Not verified
Checked by typecheck (frontend and root), the Expo/Metro iOS bundle, and unit tests for the new `fieldForError` logic. **Not checked visually on a device** — compare each screen against the board in Expo Go (`cd frontend && npx expo start --tunnel -c`).
