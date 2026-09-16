# 000 — Baseline

**Milestone:** none; predates the process
**Status:** done, accepted as the starting point
**Finished:** 2026-09-16

## What this is

Everything built before we agreed on the sprint process. It was written
implementation-first and the tests were backfilled at the end, which is the
thing we have since agreed not to do. It is kept as the baseline rather than
rebuilt, by decision on 2026-09-16. Nothing below was driven by a failing test.

## What exists

**Map geometry**
- `scripts/build-us-states.js` — regenerates the geometry (`npm run data:states`).
  Pulls us-atlas `states-albers-10m` TopoJSON, already projected to Albers USA
  with Alaska and Hawaii inset, and decodes it to SVG paths. No runtime deps,
  deterministic output.
- `data/us-states.json` — 51 paths, label points, rail ordering.

**The map component** (API documented in `docs/us-map.md`)
- `lib/us-map.js` — builds the view model from a config. Knows nothing about
  what a state means.
- `views/us-map.jade` — the `+usMap(map)` mixin. A state renders as an `<a>`
  when it has an `href`, a keyboard-operable `role="button"` when something is
  listening, otherwise an inert shape.
- `public/javascripts/us-map.js` — events, named actions, selection.
- Styling lives in `public/stylesheets/style.css`, with `--us-map-fill` as the
  documented hook for data-driven colouring.

**One configuration of it**
- `lib/voter-registration.js` — links each state to its official registration
  page, read from `views/voter_reg.csv`.
- `views/index.jade`, `routes/index.js` — the home page map.

**Worked examples**
- `public/javascripts/us-map-examples.js` — popover, async detail panel, SVG
  ripple, animated zoom, choropleth, confirm-before-leaving, selection summary,
  timed tour. Each returns its own teardown.
- `views/map-examples.jade` at `/map-examples`, styles in
  `public/stylesheets/us-map-examples.css`.

**Tests** — 50 Playwright e2e tests in 4 files, all passing
- `voter-map.spec.js` — the home page: links, accessible names, chips, no-JS,
  phone width.
- `map-component.spec.js` — component API: events, selection, cancellation,
  keyboard, named actions.
- `map-paint.spec.js` — what is actually painted, sampled from pixels.
- `map-examples.spec.js` — each example, and that they compose.
- `tests/e2e/helpers/png.js` — dependency-free PNG reader. Needed because
  `getComputedStyle(path).fill` returns a stale value in this Chrome, so colour
  has to be asserted on real pixels.

## Bugs the backfilled tests did find

Worth recording, as the argument for writing them first next time.

1. `zoomTo`'s `options.duration || 450` coerced an explicit `duration: 0` back
   to 450, so "don't animate" was impossible.
2. `preventDefault()` on `us-map:select` cancels the map's own default but
   cannot stop other listeners, so a click `confirmLinks` had vetoed still
   opened a panel and fired a ripple — depending purely on listener
   registration order. Fixed by adding `us-map:activate`, which fires only
   after the veto window closes.

## Carried debt

Open items inherited from this work. None are scheduled; they need a sprint.

1. **`views/voter_reg.csv` is untracked in git but load-bearing.**
   `lib/voter-registration.js` reads it at startup and the e2e suite asserts
   against it. It also sits in `views/`, which is a template directory.
2. **D.C. has no row in the CSV**, so it renders inert on the home page map.
3. **No-JS hover contrast.** Labels live in their own SVG group so they do not
   swallow taps, which means CSS cannot reach them from the shape's `:hover`.
   The component inverts them with a class instead, so without JavaScript a
   hovered state's label stays dark slate on the blue fill.
4. **No unit-level tests.** `lib/us-map.js` is pure view-model code that needs
   no browser, but is currently only covered through the browser. The full e2e
   suite is ~10s, which is a usable but slow inner loop for red/green.
5. **Google login is mid-flight** on `main` (commit 878fa41, `wip: google
   login`). Untouched by this work, but `views/layout.jade` was edited here —
   a viewport meta and a `block head` were added.

## Open questions for the next sprint

- What is the milestone?
- What is the red/green unit — do we add fast unit tests for `lib/` and keep
  e2e as the outer ring, or stay e2e-only?
