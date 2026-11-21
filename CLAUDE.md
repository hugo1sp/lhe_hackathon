# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project-Specific Instructions

## Project concept

We are building a predictive system that forecasts migraines from wearable data (smartwatch / Fitbit-style devices: heart rate, HRV, sleep, activity, etc.). The user sees the likelihood that they will have a migraine, not just a yes/no.

Our edge: data collection is the major bottleneck for existing solutions, so we want to make collecting good data our differentiator.

Status: concept and context only. Architecture, feasibility, and technical direction are still to be discussed. Do not implement anything or choose technologies until the team decides.

Several people work at the same time directly on `main` (no branches, no PR review). Claude handles all git operations.

## Git workflow

- **Always run `git pull --rebase origin main` before changing anything**, and again before every push.
- Make small commits and push often so changes don't diverge.
- **Push automatically (without asking) whenever a change is complete and working.** First verify the code runs and tests (if any) pass. Never push broken or half-finished code.
- If a pull causes conflicts: read both sides, keep everyone's work, resolve the conflict, run `git rebase --continue`. Only ask the user if it's unclear which version should win.
- If a push is rejected: run `git pull --rebase origin main` and push again.
- Never use `git push --force` or `git reset --hard` on `main`.
- Don't create branches unless the user asks.
- Never commit `.env` or other secrets.

## Language

Communicate with the user in Swedish. Code, comments, and docs are written in English.
