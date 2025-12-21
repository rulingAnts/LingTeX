#!/usr/bin/env node
/**
 * Preflight version consistency checks.
 * Ensures package.json version and website badge alt texts match the input version.
 * Usage: node scripts/preflight-version.js 0.2.6
 */
const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.resolve(p), 'utf8'); }

function main() {
  const version = process.argv[2];
  if (!version) { console.error('Usage: node scripts/preflight-version.js <version>'); process.exit(1); }
  const v = String(version).replace(/^v/, '');
  const pkg = JSON.parse(read('package.json'));
  if (pkg.version !== v) {
    console.error(`package.json version ${pkg.version} != ${v}`);
    process.exit(2);
  }
  const index = read('docs/index.html');
  if (!index.includes(`Latest release (v${v})`)) {
    console.error(`docs/index.html badge alt does not include v${v}`);
    process.exit(3);
  }
  const install = read('docs/install.html');
  if (!install.includes(`Latest release badge (v${v})`)) {
    console.error(`docs/install.html badge alt does not include v${v}`);
    process.exit(4);
  }
  console.log('Preflight OK for version', v);
}

main();
