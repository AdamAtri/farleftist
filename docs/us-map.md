# Clickable U.S. map

An SVG map of the 50 states plus D.C. where every state is a tap target. The
map itself has no opinion about what a state *means* — geometry lives in
`data/us-states.json`, and behaviour is configuration.

```
data/us-states.json        geometry: paths, label points, rail ordering
lib/us-map.js              builds the view model from your config
lib/voter-registration.js  one config: link each state to its registration page
views/us-map.jade        the +usMap(map) mixin
public/javascripts/us-map.js  events, actions, selection
scripts/build-us-states.js    regenerates the geometry (npm run data:states)
```

## Building a map

```js
var usMap = require('../lib/us-map');

var map = usMap.build({
  id: 'turnout',
  selection: 'single',
  caption: 'Pick a state.',
  resolve: function(state) {
    return { action: 'showTurnout', value: turnoutFor(state.code) };
  }
});

res.render('index', { map: map });
```

Then in the template:

```jade
include us-map
+usMap(map)
```

### build() options

| Option | Meaning |
| --- | --- |
| `id` | Identifies the map; `USMap.get(id)` looks it up in the browser |
| `selection` | `'none'` (default), `'single'` or `'multi'` |
| `caption` | Optional text under the map |
| `railTitle` | Lines above the small-state rail, default `['SMALL', 'STATES']` |
| `resolve(state)` | Called per state, returns that state's config |
| `states` | Config keyed by postal code; wins over `resolve` |

### Per-state config

| Key | Effect |
| --- | --- |
| `href` | Makes the state a real link to this URL |
| `target` / `rel` | Anchor attributes; `_blank` gets a safe `rel` by default |
| `action` | Name of a browser-side handler to run |
| `value` | Scalar passed to listeners |
| `data` | Object passed to listeners |
| `title` | Tooltip and accessible name; defaults to the state name |
| `label` | Text drawn on the state; defaults to the postal code |
| `disabled` | Renders it, but inert |
| `selected` | Starts out selected |

A state with an `href` renders as an `<a>`, so it works with no JavaScript. A
state with an `action` — or any state when `selection` is on — renders as a
keyboard-operable `role="button"`. Anything else is an inert shape.

## Side-effects in the browser

Every activation fires a cancelable `us-map:select` event on the map element
before anything else happens.

```js
document.querySelector('[data-us-map]').addEventListener('us-map:select', function(e) {
  console.log(e.detail.code, e.detail.name, e.detail.value, e.detail.data);
  e.preventDefault();   // cancels navigation, selection and the action
});
```

`us-map:change` fires after the selection changes, with
`e.detail.selection` as an array of postal codes.

Named actions keep per-state behaviour out of your event handler:

```js
USMap.register('showTurnout', function(state) {
  panel.textContent = state.name + ': ' + state.value;
  return false;   // returning false also cancels navigation
});
```

### API

```js
USMap.init(root, options)   // manual init; options can add actions/onSelect/onChange
USMap.get(id)               // the instance for a map id
USMap.register(name, fn)    // register a named action

map.select(code)            // also deselect / toggle / clear
map.setSelection(codes)
map.selection()             // array of selected codes
map.isSelected(code)
map.on(type, handler)
```

Maps initialise themselves on load, so `USMap.init` is only needed for markup
you add later.

## Regenerating the geometry

```
npm run data:states
```

Pulls us-atlas' `states-albers-10m` TopoJSON — already projected to Albers USA
with Alaska and Hawaii inset — and decodes it to SVG paths. No runtime
dependencies, and the output is deterministic.

## Notes

- The nine states too small to tap (VT, NH, MA, RI, CT, NJ, DE, MD, DC) also
  get a chip in the right-hand rail. A state and its chip highlight and select
  together.
- `views/voter_reg.csv` has no D.C. row, so D.C. renders inert on the
  voter-registration map.
