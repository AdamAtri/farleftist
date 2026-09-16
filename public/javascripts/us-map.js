//
// Browser-side half of the clickable U.S. map.
//
// Maps on the page initialise themselves. Clicking, tapping or keying a state
// fires a cancelable `us-map:select` event on the map, then runs whatever the
// state was configured to do -- follow its link, run a named action, update
// the selection, or any combination.
//
//   // veto a state: us-map:select fires first and can be cancelled
//   document.querySelector('[data-us-map]').addEventListener('us-map:select', function(e) {
//     e.preventDefault();   // stops navigation, selection and the action
//   });
//
//   // act on a state: us-map:activate fires only if nobody vetoed, whatever
//   // order the listeners were added in
//   document.querySelector('[data-us-map]').addEventListener('us-map:activate', function(e) {
//     console.log(e.detail.code, e.detail.name, e.detail.data);
//   });
//
//   // follow the pointer for popovers
//   map.addEventListener('us-map:enter', function(e) { show(e.detail.element); });
//   map.addEventListener('us-map:leave', hide);
//
//   // give a state's `action` name something to do
//   USMap.register('compare', function(state) { openPanel(state.code); });
//
//   // drive it from your own code
//   USMap.get('voter-registration').select('TX');
//
(function(window, document) {
  'use strict';

  var registry = {};   // action name -> handler, shared by every map
  var instances = {};  // map id -> instance

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  function readConfig(root) {
    var el = root.querySelector('[data-us-map-config]');
    if (!el) return {};

    try {
      return JSON.parse(el.textContent) || {};
    } catch (err) {
      if (window.console) window.console.warn('us-map: unreadable config', err);
      return {};
    }
  }

  /* The element that was actually hit, if it is something you can act on.
     Labels carry data-state too, but they never receive pointer events. */
  function hitFor(target) {
    var el = target && target.closest ? target.closest('[data-state]') : null;
    if (!el) return null;

    var interactive = el.classList.contains('us-map__hit') || el.classList.contains('us-map__chip');
    if (!interactive || el.classList.contains('is-static')) return null;

    return el;
  }

  function UsMap(root, options) {
    options = options || {};

    var config = readConfig(root);

    this.root = root;
    this.id = root.getAttribute('data-us-map') || config.id || 'us-map';
    this.states = config.states || {};
    this.selectionMode = options.selection || config.selection || 'none';
    this.actions = options.actions || {};
    this.selected = [];
    this.groups = {};
    this.active = null;         // state under the pointer or keyboard focus
    this.activeElement = null;

    var self = this;

    // Every piece of a state -- its shape, its label, its rail chip -- is
    // grouped under one code, so they highlight and select together.
    each(root.querySelectorAll('[data-state]'), function(el) {
      var code = el.getAttribute('data-state');
      if (!self.groups[code]) self.groups[code] = [];
      self.groups[code].push(el);

      if (self.selectionMode !== 'none' && el.getAttribute('role') === 'button') {
        el.setAttribute('aria-pressed', 'false');
      }
    });

    this.bind();

    var preselected = Object.keys(this.states).filter(function(code) {
      return self.states[code].selected;
    });

    if (preselected.length) this.setSelection(preselected, true);
    if (options.onSelect) root.addEventListener('us-map:select', options.onSelect);
    if (options.onChange) root.addEventListener('us-map:change', options.onChange);
  }

  UsMap.prototype.bind = function() {
    var self = this;
    var root = this.root;

    root.addEventListener('click', function(event) {
      var hit = hitFor(event.target);
      if (hit) self.activate(hit.getAttribute('data-state'), event, hit);
    });

    root.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;

      var hit = hitFor(event.target);
      if (!hit || hit.getAttribute('role') !== 'button') return;

      event.preventDefault(); // Space would scroll the page
      self.activate(hit.getAttribute('data-state'), event, hit);
    });

    // Pointer and keyboard both drive one "active state" slot, so entering a
    // new state leaves the old one exactly once.
    function highlight(on) {
      return function(event) {
        var hit = hitFor(event.target);
        if (!hit) return;

        var code = hit.getAttribute('data-state');

        if (!on) {
          if (self.active !== code) return;
          self.leave();
          return;
        }

        if (self.active === code) return;
        if (self.active) self.leave();

        self.active = code;
        self.activeElement = hit;
        self.mark(code, 'is-active', true);
        self.emit('us-map:enter', self.detailFor(code, hit));
      };
    }

    root.addEventListener('mouseover', highlight(true));
    root.addEventListener('mouseout', highlight(false));
    root.addEventListener('focusin', highlight(true));
    root.addEventListener('focusout', highlight(false));
  };

  UsMap.prototype.emit = function(type, detail, cancelable) {
    var event;

    try {
      event = new CustomEvent(type, { bubbles: true, cancelable: !!cancelable, detail: detail });
    } catch (err) {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent(type, true, !!cancelable, detail);
    }

    return this.root.dispatchEvent(event);
  };

  /* What listeners and action handlers receive. `element` is the thing the
     pointer or keyboard actually hit -- the state on the map, or its rail
     chip -- which is what you anchor a popover to. */
  UsMap.prototype.detailFor = function(code, element) {
    var info = this.states[code] || {};
    var group = this.groups[code];

    return {
      code: code,
      name: info.name || code,
      href: info.href || null,
      action: info.action || null,
      value: info.value !== undefined ? info.value : null,
      data: info.data || null,
      selected: this.isSelected(code),
      element: element || (group && group[0]) || null,
      map: this
    };
  };

  UsMap.prototype.activate = function(code, originalEvent, element) {
    var detail = this.detailFor(code, element);
    detail.originalEvent = originalEvent || null;

    // Listeners get first refusal: preventDefault stops the link, the
    // selection change and the action alike.
    if (!this.emit('us-map:select', detail, true)) {
      if (originalEvent) originalEvent.preventDefault();
      return false;
    }

    if (this.selectionMode !== 'none') this.toggle(code);

    if (detail.action) {
      var handler = this.actions[detail.action] || registry[detail.action];

      if (!handler) {
        if (window.console) {
          window.console.warn('us-map: no handler registered for action "' + detail.action + '"');
        }
      } else if (handler.call(this, detail, this) === false && originalEvent) {
        originalEvent.preventDefault();
        return false;
      }
    }

    // The veto window is closed. Anything that should only happen when a
    // state really was activated listens for this instead of us-map:select,
    // so it does not depend on which listener was registered first.
    detail.selected = this.isSelected(code);
    this.emit('us-map:activate', detail);

    return true;
  };

  UsMap.prototype.leave = function() {
    if (!this.active) return this;

    var code = this.active;
    var element = this.activeElement;

    this.active = null;
    this.activeElement = null;
    this.mark(code, 'is-active', false);
    this.emit('us-map:leave', this.detailFor(code, element));

    return this;
  };

  UsMap.prototype.mark = function(code, className, on) {
    (this.groups[code] || []).forEach(function(el) {
      if (on) el.classList.add(className);
      else el.classList.remove(className);

      if (className === 'is-selected' && el.hasAttribute('aria-pressed')) {
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    });
  };

  UsMap.prototype.isSelected = function(code) {
    return this.selected.indexOf(code) >= 0;
  };

  UsMap.prototype.selection = function() {
    return this.selected.slice();
  };

  UsMap.prototype.setSelection = function(codes, silent) {
    var self = this;
    var next = [];

    (codes || []).forEach(function(code) {
      if (self.groups[code] && next.indexOf(code) < 0) next.push(code);
    });

    if (this.selectionMode === 'none') next = [];
    else if (this.selectionMode === 'single') next = next.slice(-1);

    var changed = next.length !== this.selected.length || next.some(function(code, i) {
      return code !== self.selected[i];
    });

    this.selected.forEach(function(code) {
      if (next.indexOf(code) < 0) self.mark(code, 'is-selected', false);
    });

    next.forEach(function(code) {
      if (self.selected.indexOf(code) < 0) self.mark(code, 'is-selected', true);
    });

    this.selected = next;

    if (changed && !silent) {
      this.emit('us-map:change', { selection: this.selection(), map: this });
    }

    return this;
  };

  UsMap.prototype.select = function(code) {
    var next = this.selectionMode === 'multi' ? this.selected.concat([code]) : [code];
    return this.setSelection(next);
  };

  UsMap.prototype.deselect = function(code) {
    return this.setSelection(this.selected.filter(function(other) {
      return other !== code;
    }));
  };

  UsMap.prototype.toggle = function(code) {
    return this.isSelected(code) ? this.deselect(code) : this.select(code);
  };

  UsMap.prototype.clear = function() {
    return this.setSelection([]);
  };

  UsMap.prototype.on = function(type, handler) {
    this.root.addEventListener(type, handler);
    return this;
  };

  function init(root, options) {
    if (!root) return null;
    if (root.usMap) return root.usMap;

    var map = new UsMap(root, options);

    root.usMap = map;
    instances[map.id] = map;

    return map;
  }

  function initAll() {
    each(document.querySelectorAll('[data-us-map]'), function(root) {
      init(root);
    });
  }

  window.USMap = {
    init: init,
    get: function(id) {
      return instances[id] || null;
    },
    register: function(name, handler) {
      registry[name] = handler;
      return this;
    },
    actions: registry
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})(window, document);
