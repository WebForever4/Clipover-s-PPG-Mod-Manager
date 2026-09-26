const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPaths } = require('../src/core/paths');
const { Library } = require('../src/core/library');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-')); }
function setup() {
  const root = tmp();
  const paths = createPaths(path.join(root, 'data'));
  return { root, paths, library: new Library(paths), gameMods: path.join(root, 'game', 'mods') };
}
function makeTree(files) {
  const dir = tmp();
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
module.exports = { tmp, setup, makeTree };
