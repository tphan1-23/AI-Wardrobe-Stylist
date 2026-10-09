# brain/ — shared project notes (Obsidian-compatible)

The team's shared memory for the AI Wardrobe Stylist capstone (CSCI 4397/6397). Plain Markdown with Obsidian `[[wikilinks]]`, versioned in git so every push updates the "brain" for everyone, including any Claude Code session or branch.

## Contents
- `AI Wardrobe Stylist - Capstone Project.md` — overview, scope, stack, milestone mapping, status log
- `AI Wardrobe - Requirements & Decisions.md` — decision log (D1…), draft requirements, gaps, open questions
- `AI Logic Ownership.md` — AI/ML plan, evaluation approach, tuning log (Manuel + Claude)
- `Work Plan.md` — branch map, roadmap (what is done, who builds what next), runbooks, incidents
- `Design Notes.md` — DressWell design system and screen status
- `SWE with AI Final Project Proposals - ….pdf` — original proposal

## How to use it
- **In Obsidian:** copy or link this folder into your vault (e.g. `…/02 Software Engineering with AI/Projects/AI Wardrobe`). Links like `[[02 Software Engineering with AI/SWE-AI Home|…]]` point at the class vault and show as unresolved if you don't have it — that's fine.
- **Update with the work:** when a decision is made or status changes, edit the notes in the same commit/PR as the code. Add a decision row (D#) rather than rewriting history.
- **Claude Code sessions:** `CLAUDE.md` tells agents to read `brain/` first. To see other people's in-flight work, run `git fetch --all` and read `brain/` on their branch.
- **Pull before you edit** to avoid conflicts in the decision log; add rows at the end of tables.

## Public repo — do NOT put here
Course materials (syllabus, schedules, grading), grades, credentials/API keys, identifiable photos, or anyone's personal data.
