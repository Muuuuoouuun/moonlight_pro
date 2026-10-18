'use strict';
const fs = require('node:fs');
const path = require('node:path');
function readBuildInfo(directory = __dirname) {
  let built = {};
  try { built = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json'), 'utf8')); } catch { /* Development tree. */ }
  return { version: require('./package.json').version,
    revision: /^[a-f0-9]{40}$/.test(built.revision || '') ? built.revision.slice(0, 12) : 'development',
    builtAt: Number.isFinite(Date.parse(built.builtAt)) ? built.builtAt : null,
    modified: built.modified === true };
}
module.exports = { readBuildInfo };
