//
// Builds the view model for the clickable U.S. map.
//
// The map knows nothing about what a state means or what clicking one should
// do. Callers describe that through options, and the map turns it into shapes,
// tap targets and a config blob the browser-side component reads.
//
//   var map = usMap.build({
//     id: 'voter-registration',
//     caption: 'Pick your state.',
//     resolve: function(state) {
//       return { href: siteFor(state.name), target: '_blank' };
//     }
//   });
//
// Per-state options (from `resolve(state)`, or from `states` keyed by postal
// code, which wins):
//
//   href      open this URL on click; makes the state a real link
//   target    anchor target, e.g. '_blank'
//   rel       anchor rel; defaults to 'noopener noreferrer' for _blank
//   action    name of a browser-side handler registered with USMap.register()
//   value     scalar handed to listeners, e.g. a filter key
//   data      arbitrary object handed to listeners
//   title     tooltip and accessible name; defaults to the state name
//   label     text drawn on the state; defaults to the postal code
//   disabled  render it, but make it inert
//   selected  start out selected
//
var geometry = require('../data/us-states.json');

var SELECTION_MODES = ['none', 'single', 'multi'];

function isObject(value) {
  return value !== null && typeof value === 'object';
}

/* Explicit `states` entries win over whatever `resolve` returned. */
function merge(base, extra) {
  if (!isObject(extra)) return base;

  Object.keys(extra).forEach(function(key) {
    if (extra[key] !== undefined) base[key] = extra[key];
  });

  return base;
}

/* A state is a link if it has somewhere to go, interactive if something is
   listening, and otherwise just a shape on the map. */
function kindOf(state, selection) {
  if (state.disabled) return 'static';
  if (state.href) return 'link';
  if (state.action || selection !== 'none') return 'button';
  return 'static';
}

function buildState(base, options) {
  var resolved = merge({}, options.resolve ? options.resolve(base) : null);
  merge(resolved, options.states ? options.states[base.code] : null);

  var target = resolved.target || null;
  var state = {
    code: base.code,
    name: base.name,
    d: base.d,
    labelX: base.labelX,
    labelY: base.labelY,
    chipOrder: base.chipOrder,
    href: resolved.href || null,
    target: target,
    rel: resolved.rel || (target === '_blank' ? 'noopener noreferrer' : null),
    action: resolved.action || null,
    value: resolved.value !== undefined ? resolved.value : null,
    data: isObject(resolved.data) ? resolved.data : null,
    title: resolved.title || base.name,
    label: resolved.label !== undefined ? resolved.label : base.code,
    disabled: Boolean(resolved.disabled),
    selected: Boolean(resolved.selected)
  };

  state.kind = kindOf(state, options.selection);

  return state;
}

/* Everything the browser-side component needs, keyed by postal code. The
   markup itself only carries data-state, so handlers read payloads from here. */
function toClientConfig(map) {
  var states = {};

  map.states.forEach(function(state) {
    states[state.code] = {
      name: state.name,
      kind: state.kind,
      href: state.href,
      action: state.action,
      value: state.value,
      data: state.data,
      disabled: state.disabled,
      selected: state.selected
    };
  });

  return { id: map.id, selection: map.selection, states: states };
}

/* Inline JSON has to survive being read as HTML, so no raw '<' gets through. */
function serialize(config) {
  return JSON.stringify(config).replace(/</g, '\\u003c');
}

function build(options) {
  options = options || {};

  var selection = options.selection || 'none';
  if (SELECTION_MODES.indexOf(selection) < 0) {
    throw new Error('us-map: unknown selection mode "' + selection + '"');
  }

  var settings = {
    resolve: options.resolve || null,
    states: options.states || null,
    selection: selection
  };

  var states = geometry.map(function(base) {
    return buildState(base, settings);
  });

  var map = {
    id: options.id || 'us-map',
    selection: selection,
    caption: options.caption || null,
    railTitle: options.railTitle || ['SMALL', 'STATES'],
    states: states,

    /* Small states move to the rail, where they get a usable tap target. */
    chips: states.filter(function(state) {
      return state.chipOrder !== null;
    }).sort(function(a, b) {
      return a.chipOrder - b.chipOrder;
    })
  };

  map.configJson = serialize(toClientConfig(map));

  return map;
}

module.exports = { build: build };
