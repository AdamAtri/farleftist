//
// Worked examples for the clickable U.S. map (see docs/us-map.md).
//
// Each example is standalone: hand it a map instance to switch it on, and call
// what it hands back to switch it off. They are meant to be copied out of here
// into your own code, so they lean on each other as little as possible.
//
//   var map = USMap.get('examples');
//   var stop = USMapExamples.popover(map);
//   stop();   // unbind and clean up
//
// Between them they cover the interaction surface: hover popovers, click
// panels with async loading, SVG animation, animated zoom, data-driven
// colouring, intercepting a link, live selection summaries, and a timed tour.
//
// One rule they all follow: anything that reacts to a state listens for
// `us-map:activate`, which fires only after the `us-map:select` veto window
// has closed. Listening for `us-map:select` instead would mean a click that
// confirmLinks cancelled still opened a panel and fired a ripple, depending
// purely on which listener happened to be registered first.
//
(function(window, document) {
  'use strict';

  // ------------------------------------------------------------- plumbing --
  // Shared only to keep the examples short; none of it is required.

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    return function() { target.removeEventListener(type, handler); };
  }

  function teardown(jobs) {
    return function() {
      jobs.forEach(function(job) { job(); });
      jobs.length = 0;
    };
  }

  /* The painted shape inside a state or its rail chip. */
  function shapeOf(el) {
    if (!el) return null;
    return el.querySelector('.us-map__shape, .us-map__chip-box');
  }

  function svgOf(map) {
    return map.root.querySelector('svg');
  }

  // -------------------------------------------------------- 1. hover popover
  //
  // A floating label that follows the state under the pointer. Rides on
  // `us-map:enter` / `us-map:leave`, so it tracks keyboard focus too.
  //
  //   USMapExamples.popover(map, { render: function(s) { return s.name; } });
  //
  function popover(map, options) {
    options = options || {};

    var render = options.render || function(state) {
      return state.value === null ? state.name : state.name + ' — ' + state.value;
    };

    var node = element('div', 'us-map-popover');
    node.setAttribute('role', 'status');
    map.root.appendChild(node);

    function place(anchor) {
      // getBoundingClientRect works on SVG elements, so the popover can be a
      // plain div positioned over the map rather than SVG text.
      var box = anchor.getBoundingClientRect();
      var frame = map.root.getBoundingClientRect();
      var left = box.left - frame.left + box.width / 2;

      // keep it inside the map even for states at the edges
      left = Math.max(60, Math.min(frame.width - 60, left));

      node.style.left = Math.round(left) + 'px';
      node.style.top = Math.round(box.top - frame.top) + 'px';
    }

    var jobs = [
      listen(map.root, 'us-map:enter', function(event) {
        var content = render(event.detail);

        if (typeof content === 'string') node.textContent = content;
        else { node.textContent = ''; node.appendChild(content); }

        place(event.detail.element);
        node.classList.add('is-visible');
      }),

      listen(map.root, 'us-map:leave', function() {
        node.classList.remove('is-visible');
      }),

      function() { if (node.parentNode) node.parentNode.removeChild(node); }
    ];

    return teardown(jobs);
  }

  // --------------------------------------------------- 2. detail panel (async)
  //
  // Click a state, open a panel, load something for it. The token guards
  // against a slow response for one state landing after a faster one for
  // another -- the usual bug in click-to-load panels.
  //
  //   USMapExamples.detailPanel(map, {
  //     container: document.querySelector('#panel'),
  //     load: function(state) { return fetch('/api/' + state.code).then(r => r.json()); }
  //   });
  //
  function detailPanel(map, options) {
    options = options || {};

    var container = options.container || map.root.parentNode;

    var load = options.load || function(state) {
      // Stand-in for a real request.
      return new Promise(function(resolve) {
        window.setTimeout(function() {
          resolve({ 'Postal code': state.code, 'Sample value': state.value });
        }, 400);
      });
    };

    var panel = element('aside', 'us-map-panel');
    panel.setAttribute('aria-live', 'polite');
    container.appendChild(panel);

    var token = 0;

    function close() {
      token++;
      panel.classList.remove('is-open');
    }

    function open(state) {
      var mine = ++token;

      panel.textContent = '';
      panel.classList.add('is-open');

      var head = element('header', 'us-map-panel__head');
      head.appendChild(element('h2', 'us-map-panel__title', state.name));

      var dismiss = element('button', 'us-map-panel__close', '×');
      dismiss.type = 'button';
      dismiss.setAttribute('aria-label', 'Close');
      dismiss.addEventListener('click', close);
      head.appendChild(dismiss);

      panel.appendChild(head);

      var body = element('div', 'us-map-panel__body');
      body.appendChild(element('p', 'us-map-panel__loading', 'Loading…'));
      panel.appendChild(body);

      Promise.resolve(load(state)).then(function(fields) {
        if (mine !== token) return;   // a later click won

        body.textContent = '';
        var list = element('dl', 'us-map-panel__list');

        Object.keys(fields).forEach(function(key) {
          list.appendChild(element('dt', null, key));
          list.appendChild(element('dd', null, String(fields[key])));
        });

        body.appendChild(list);
      }, function() {
        if (mine !== token) return;
        body.textContent = 'Could not load that state.';
      });
    }

    var jobs = [
      listen(map.root, 'us-map:activate', function(event) { open(event.detail); }),
      function() { if (panel.parentNode) panel.parentNode.removeChild(panel); }
    ];

    return teardown(jobs);
  }

  // --------------------------------------------------------- 3. pulse (SVG)
  //
  // A ripple that expands out of the state you clicked. Clones the state's own
  // path and animates a growing stroke on the copy, so the ripple is the exact
  // shape of the state rather than a circle stuck on top of it.
  //
  function pulse(map, options) {
    options = options || {};

    var color = options.color || '#0284c7';
    var duration = options.duration === undefined ? 550 : options.duration;

    return listen(map.root, 'us-map:activate', function(event) {
      var shape = shapeOf(event.detail.element);
      if (!shape || !shape.animate) return;   // no Web Animations, no ripple

      var ghost = shape.cloneNode(false);
      ghost.setAttribute('class', 'us-map-pulse');
      ghost.style.fill = 'none';
      ghost.style.stroke = color;

      // Appending to the <svg> puts the ripple above every state.
      svgOf(map).appendChild(ghost);

      ghost.animate(
        [
          { strokeWidth: 0, opacity: 0.9 },
          { strokeWidth: 16, opacity: 0 }
        ],
        { duration: duration, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
      ).onfinish = function() {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      };
    });
  }

  // ------------------------------------------------------------- 4. zoom to
  //
  // Animates the viewBox to frame the selected state, which zooms the map
  // without touching the DOM. Escape, or clicking the ocean, zooms back out.
  // Honours prefers-reduced-motion, and `duration: 0` jumps without animating.
  //
  function zoomTo(map, options) {
    options = options || {};

    var svg = svgOf(map);
    var duration = options.duration === undefined ? 450 : options.duration;
    var padding = options.padding === undefined ? 0.8 : options.padding;

    var home = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    var current = home.slice();
    var frame = null;

    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function apply(box) {
      current = box.slice();
      svg.setAttribute('viewBox', current.map(function(n) {
        return Math.round(n * 100) / 100;
      }).join(' '));
    }

    function animate(target) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = null;

      // Jump straight there if the viewer asked for less motion, or if the
      // caller turned the animation off.
      if (still || duration <= 0) return apply(target);

      var from = current.slice();
      var start = window.performance.now();

      (function step(now) {
        var t = Math.min(1, (now - start) / duration);
        var k = ease(t);

        apply(from.map(function(value, i) {
          return value + (target[i] - value) * k;
        }));

        if (t < 1) frame = window.requestAnimationFrame(step);
        else frame = null;
      })(start);
    }

    function boxFor(code) {
      var shape = shapeOf(map.groups[code] && map.groups[code][0]);
      if (!shape) return null;

      // getBBox is already in viewBox units, which is exactly what we need.
      var box = shape.getBBox();
      var ratio = home[2] / home[3];

      var width = box.width * (1 + padding);
      var height = box.height * (1 + padding);

      // grow the short side so the zoomed frame keeps the map's aspect ratio
      if (width / height < ratio) width = height * ratio;
      else height = width / ratio;

      return [
        box.x + box.width / 2 - width / 2,
        box.y + box.height / 2 - height / 2,
        width,
        height
      ];
    }

    function to(code) {
      var target = boxFor(code);
      if (target) animate(target);
    }

    function reset() {
      animate(home.slice());
    }

    var jobs = [
      listen(map.root, 'us-map:activate', function(event) { to(event.detail.code); }),

      // A click that missed every state means "back out".
      listen(map.root, 'click', function(event) {
        if (!event.target.closest('[data-state]')) reset();
      }),

      listen(document, 'keydown', function(event) {
        if (event.key === 'Escape') reset();
      }),

      function() {
        if (frame) window.cancelAnimationFrame(frame);
        svg.setAttribute('viewBox', home.join(' '));
      }
    ];

    var stop = teardown(jobs);

    stop.to = to;        // zoom from your own code
    stop.reset = reset;

    return stop;
  }

  // ---------------------------------------------------------- 5. choropleth
  //
  // Colour states by a value. Writes the --us-map-fill custom property rather
  // than `fill`, so hover and selection still override it.
  //
  //   USMapExamples.choropleth(map, { values: { TX: 40, CA: 54 } });
  //
  function choropleth(map, options) {
    options = options || {};

    var values = options.values || {};
    var scale = options.scale || ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0284c7'];

    var numbers = Object.keys(values).map(function(code) { return values[code]; });
    var min = options.min === undefined ? Math.min.apply(null, numbers) : options.min;
    var max = options.max === undefined ? Math.max.apply(null, numbers) : options.max;

    function colorFor(value) {
      if (max === min) return scale[scale.length - 1];
      var ratio = (value - min) / (max - min);
      return scale[Math.min(scale.length - 1, Math.floor(ratio * scale.length))];
    }

    var painted = [];

    Object.keys(map.groups).forEach(function(code) {
      if (values[code] === undefined) return;

      var color = colorFor(values[code]);

      map.groups[code].forEach(function(el) {
        el.style.setProperty('--us-map-fill', color);
        painted.push(el);
      });
    });

    if (options.legend) {
      options.legend.textContent = '';
      options.legend.appendChild(element('span', 'us-map-legend__label', String(min)));

      scale.forEach(function(color) {
        var swatch = element('span', 'us-map-legend__swatch');
        swatch.style.background = color;
        options.legend.appendChild(swatch);
      });

      options.legend.appendChild(element('span', 'us-map-legend__label', String(max)));
    }

    return function() {
      painted.forEach(function(el) { el.style.removeProperty('--us-map-fill'); });
      painted.length = 0;
      if (options.legend) options.legend.textContent = '';
    };
  }

  // ------------------------------------------------ 6. confirm before leaving
  //
  // Catches a state that is a real link and asks first. preventDefault() on
  // `us-map:select` stops the navigation; the confirm does it by hand if the
  // answer is yes.
  //
  function confirmLinks(map, options) {
    options = options || {};

    var message = options.message || function(state) {
      return 'Open the official site for ' + state.name + '?';
    };

    var dialog = element('div', 'us-map-confirm');
    dialog.setAttribute('role', 'dialog');
    map.root.appendChild(dialog);

    function hide() {
      dialog.classList.remove('is-visible');
    }

    function ask(state) {
      dialog.textContent = '';
      dialog.appendChild(element('p', 'us-map-confirm__text', message(state)));

      var actions = element('div', 'us-map-confirm__actions');

      var go = element('button', 'us-map-confirm__go', 'Open');
      go.type = 'button';
      go.addEventListener('click', function() {
        hide();
        window.open(state.href, '_blank', 'noopener');
      });

      var cancel = element('button', 'us-map-confirm__cancel', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', hide);

      actions.appendChild(go);
      actions.appendChild(cancel);
      dialog.appendChild(actions);

      var box = state.element.getBoundingClientRect();
      var frame = map.root.getBoundingClientRect();

      dialog.style.left = Math.round(
        Math.max(110, Math.min(frame.width - 110, box.left - frame.left + box.width / 2))
      ) + 'px';
      dialog.style.top = Math.round(box.top - frame.top + box.height) + 'px';

      dialog.classList.add('is-visible');
      go.focus();
    }

    var jobs = [
      listen(map.root, 'us-map:select', function(event) {
        if (!event.detail.href) return;

        event.preventDefault();   // also stops selection and any action
        ask(event.detail);
      }),

      listen(document, 'keydown', function(event) {
        if (event.key === 'Escape') hide();
      }),

      function() { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); }
    ];

    return teardown(jobs);
  }

  // ---------------------------------------------------- 7. selection summary
  //
  // Mirrors a multi-select map into a list you can remove things from, driven
  // by `us-map:change`. The map stays the single source of truth.
  //
  function selectionSummary(map, options) {
    options = options || {};

    var container = options.container;
    if (!container) throw new Error('selectionSummary needs a container');

    function draw() {
      var codes = map.selection();

      container.textContent = '';

      if (!codes.length) {
        container.appendChild(element('p', 'us-map-summary__empty', 'No states selected.'));
        return;
      }

      var list = element('ul', 'us-map-summary__list');

      codes.forEach(function(code) {
        var item = element('li', 'us-map-summary__item');
        item.appendChild(element('span', null, map.detailFor(code).name));

        var remove = element('button', 'us-map-summary__remove', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + code);
        remove.addEventListener('click', function() { map.deselect(code); });

        item.appendChild(remove);
        list.appendChild(item);
      });

      container.appendChild(list);

      var clear = element('button', 'us-map-summary__clear', 'Clear all ' + codes.length);
      clear.type = 'button';
      clear.addEventListener('click', function() { map.clear(); });
      container.appendChild(clear);
    }

    draw();

    var jobs = [
      listen(map.root, 'us-map:change', draw),
      function() { container.textContent = ''; }
    ];

    return teardown(jobs);
  }

  // ------------------------------------------------------------- 8. the tour
  //
  // Walks the map on a timer, selecting each state in turn -- handy for an
  // attract loop or a walkthrough. Everything else reacts as if a person had
  // clicked, because it goes through the same public API.
  //
  function tour(map, codes, options) {
    options = options || {};

    var interval = options.interval || 900;
    var onStep = options.onStep;
    var timer = null;
    var i = 0;

    function step() {
      if (i >= codes.length) {
        if (options.loop) i = 0;
        else return stop();
      }

      var code = codes[i++];

      map.setSelection([code]);
      if (onStep) onStep(map.detailFor(code));

      timer = window.setTimeout(step, interval);
    }

    function stop() {
      if (timer) window.clearTimeout(timer);
      timer = null;
      if (options.onStop) options.onStop();
    }

    step();

    return stop;
  }

  window.USMapExamples = {
    popover: popover,
    detailPanel: detailPanel,
    pulse: pulse,
    zoomTo: zoomTo,
    choropleth: choropleth,
    confirmLinks: confirmLinks,
    selectionSummary: selectionSummary,
    tour: tour
  };
})(window, document);
