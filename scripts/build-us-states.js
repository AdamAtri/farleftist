#!/usr/bin/env node
//
// Regenerates data/us-states.json, the geometry behind the clickable map.
//
//   node scripts/build-us-states.js
//
// Source: us-atlas' states-albers-10m, a TopoJSON of the 50 states plus D.C.
// already projected into Albers USA (Alaska and Hawaii inset) on a 975x610
// canvas, so this script only has to decode TopoJSON into SVG path data --
// no map projection, and no runtime dependencies.

var fs = require('fs');
var path = require('path');

var SOURCE = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json';
var OUTPUT = path.join(__dirname, '..', 'data', 'us-states.json');

var USPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
  '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
  '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY'
};

// Too small to hit reliably on the map, so they move to the rail in this order.
var CHIPS = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];

function round(n) {
  return Math.round(n * 10) / 10;
}

// TopoJSON stores arcs quantized and delta-encoded; undo both.
function decodeArcs(topology) {
  var scale = topology.transform.scale;
  var translate = topology.transform.translate;

  return topology.arcs.map(function(arc) {
    var x = 0;
    var y = 0;

    return arc.map(function(delta) {
      x += delta[0];
      y += delta[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function buildRing(ring, arcs) {
  var points = [];

  ring.forEach(function(index) {
    // A negative index means the reverse of arc ~index.
    var arc = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
    // Each arc repeats the previous arc's last point.
    for (var i = points.length ? 1 : 0; i < arc.length; i++) points.push(arc[i]);
  });

  return points;
}

function ringToPath(points) {
  var d = '';
  var px = null;
  var py = null;

  points.forEach(function(point, i) {
    var x = round(point[0]);
    var y = round(point[1]);

    if (i === 0) d += 'M' + x + ' ' + y;
    else if (x === px && y === py) return; // rounding collapsed this step
    else if (y === py) d += 'H' + x;
    else if (x === px) d += 'V' + y;
    else d += 'L' + x + ' ' + y;

    px = x;
    py = y;
  });

  return d + 'Z';
}

function polygonsOf(geometry) {
  return geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
}

function toPath(geometry, arcs) {
  return polygonsOf(geometry).map(function(polygon) {
    return polygon.map(function(ring) {
      return ringToPath(buildRing(ring, arcs));
    }).join('');
  }).join('');
}

// Area and centroid of a ring, by the shoelace formula.
function ringStats(points) {
  var area = 0;
  var cx = 0;
  var cy = 0;

  for (var i = 0; i < points.length; i++) {
    var a = points[i];
    var b = points[(i + 1) % points.length];
    var cross = a[0] * b[1] - b[0] * a[1];

    area += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }

  area /= 2;
  if (!area) return { area: 0, cx: points[0][0], cy: points[0][1] };

  return { area: Math.abs(area), cx: cx / (6 * area), cy: cy / (6 * area) };
}

// Label the biggest landmass, so Michigan gets its lower peninsula and
// Hawaii gets the Big Island rather than a point out in the ocean.
function labelPoint(geometry, arcs) {
  var best = { area: -1 };

  polygonsOf(geometry).forEach(function(polygon) {
    var stats = ringStats(buildRing(polygon[0], arcs));
    if (stats.area > best.area) best = stats;
  });

  return best;
}

async function main() {
  var response = await fetch(SOURCE);
  if (!response.ok) throw new Error('fetch failed: ' + response.status + ' ' + SOURCE);

  var topology = await response.json();
  var arcs = decodeArcs(topology);

  var states = topology.objects.states.geometries.map(function(geometry) {
    var code = USPS[geometry.id];
    if (!code) throw new Error('no USPS code for FIPS ' + geometry.id);

    var label = labelPoint(geometry, arcs);
    var chipOrder = CHIPS.indexOf(code);

    return {
      code: code,
      name: geometry.properties.name,
      d: toPath(geometry, arcs),
      labelX: round(label.cx),
      labelY: round(label.cy),
      chipOrder: chipOrder < 0 ? null : chipOrder
    };
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  if (states.length !== 51) throw new Error('expected 51 states, got ' + states.length);

  fs.writeFileSync(OUTPUT, JSON.stringify(states) + '\n');
  console.log('wrote ' + states.length + ' states to ' + path.relative(process.cwd(), OUTPUT));
}

main().catch(function(err) {
  console.error(err.message);
  process.exit(1);
});
