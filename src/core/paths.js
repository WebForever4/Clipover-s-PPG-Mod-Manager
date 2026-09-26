const fs = require('fs');
const path = require('path');

function createPaths(root) {
  const p = {
    root,
    mods: path.join(root, 'mods'),
    downloads: path.join(root, 'downloads'),
    staging: path.join(root, 'staging'),
    settings: path.join(root, 'settings.json'),
    library: path.join(root, 'library.json'),
    profiles: path.join(root, 'profiles.json'),
    deployed: path.join(root, 'deployed.json'),
  };
  for (const d of [p.root, p.mods, p.downloads, p.staging]) fs.mkdirSync(d, { recursive: true });
  return p;
}

module.exports = { createPaths };
