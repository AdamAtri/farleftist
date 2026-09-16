var express = require('express');
var router = express.Router();
var usMap = require('../lib/us-map');
var voterRegistration = require('../lib/voter-registration');

/* What a state does on click is configuration, not code. This one sends you
   to an official registration page; swap `resolve` for a different map. */
var registrationMap = usMap.build({
  id: 'voter-registration',
  caption: 'Pick your state to open its official voter registration page.',
  resolve: voterRegistration.resolve
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'FARLEFTIST',
    map: registrationMap
  });
});

/* A second map on the same data, wired up to show what a click can do.
   See public/javascripts/us-map-examples.js. */
var DEMO_LINKS = ['CA', 'TX', 'NY', 'FL'];

/* Stand-in numbers so the choropleth has something to colour. Deterministic
   so the page looks the same on every render -- replace with real data. */
function sampleValue(code) {
  var n = 0;
  for (var i = 0; i < code.length; i++) n = n * 31 + code.charCodeAt(i);
  return 5 + (n % 60);
}

var examplesMap = usMap.build({
  id: 'examples',
  selection: 'multi',
  caption: 'Every state here is interactive. Sample values, not real data.',
  resolve: function(state) {
    var config = { value: sampleValue(state.code) };

    /* A few real links, so the confirm-before-leaving example has something
       to intercept. */
    if (DEMO_LINKS.indexOf(state.code) >= 0) {
      var registration = voterRegistration.resolve(state);
      if (registration.href) {
        config.href = registration.href;
        config.target = '_blank';
      }
    }

    return config;
  }
});

/* GET the interaction examples. */
router.get('/map-examples', function(req, res, next) {
  res.render('map-examples', {
    title: 'Map interactions',
    map: examplesMap
  });
});

module.exports = router;
