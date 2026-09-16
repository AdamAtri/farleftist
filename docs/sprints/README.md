# Sprints

How work happens in this repo. The order is not negotiable — the point of
writing the plan down is that work can be paused and picked up later, by
either of us, without reconstructing what we were thinking.

## The cycle

1. **Plan.** A sprint document lands in `docs/sprints/` and we agree on it.
   No production code is written before this exists.
2. **Red.** Write a test that fails, for the next smallest piece of the plan.
   Run it. See it fail for the reason you expect.
3. **Green.** Write the least amount of quality production code that turns
   that test green. No extra features, no speculative abstraction.
4. **Repeat** from step 2 until the sprint's checklist is done.

A test written after the code it covers proves nothing about the test. If
production code arrives first, the honest move is to say so in the sprint doc
rather than backfill tests and call it covered.

## Naming

`docs/sprints/NNN-short-name.md`, numbered in order. `000-baseline.md` is the
state of things before this process started.

## What a sprint document contains

```markdown
# NNN — Title

**Milestone:** which milestone this sprint serves
**Status:** planned | in progress | done
**Started / Finished:** dates

## Goal
One paragraph. What is true at the end that is not true now.

## Out of scope
The things we are deliberately not doing, so they stop coming up.

## Plan
Numbered steps, each small enough to be one red/green cycle. Each step names
the test that will be written first.

## Open questions
Anything that has to be decided before or during the sprint, and by whom.

## Log
Appended as we go: what got done, what changed, what we learned. This is the
part that makes the sprint resumable.
```

## Tests

`npm test` runs the Playwright e2e suite in `tests/e2e/`. It boots the app
itself on port 3100 and drives the machine's installed Chrome, so there is no
browser to download.

See `docs/us-map.md` for the map component's API.
