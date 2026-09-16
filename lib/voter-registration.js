//
// One way to configure the map: point every state at its official voter
// registration page. Nothing here is baked into the map itself -- this is
// just a `resolve` function it can be built with.
//
var fs = require('fs');
var path = require('path');

var csvPath = path.join(__dirname, '..', 'views', 'voter_reg.csv');

/* voter_reg.csv is "state,site" -- one registration page per state. */
function readSites(file) {
  var lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1);
  var sites = {};

  lines.forEach(function(line) {
    var comma = line.indexOf(',');
    if (comma < 0) return;
    sites[line.slice(0, comma).trim()] = line.slice(comma + 1).trim();
  });

  return sites;
}

/* Read once at startup; the CSV is static, so a restart picks up edits. */
var sites = readSites(csvPath);

function resolve(state) {
  var site = sites[state.name];

  if (!site) {
    return {
      disabled: true,
      title: state.name + ' — no registration link'
    };
  }

  return {
    href: site,
    target: '_blank',
    title: 'Register to vote in ' + state.name,
    data: { site: site }
  };
}

module.exports = {
  resolve: resolve,
  sites: sites
};
