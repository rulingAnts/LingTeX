#!/usr/bin/env node
/**
 * Extract release notes for a given version from CHANGELOG.md.
 * Usage: node scripts/release-notes.js 0.2.6
 */
const fs = require('fs');
const path = require('path');

function main() {
  const version = process.argv[2];
  if (!version) { console.error('Usage: node scripts/release-notes.js <version>'); process.exit(1); }
  const v = String(version).replace(/^v/, '');
  const changelogPath = path.resolve('CHANGELOG.md');
  const text = fs.readFileSync(changelogPath, 'utf8');
  const headerRe = new RegExp(`^##\\s+${v}\\b.*$`, 'm');
  const idx = text.search(headerRe);
  if (idx < 0) {
    // Fallback: use latest section
    const latestHeader = text.search(/^##\s+\d+\.\d+\.\d+\b.*$/m);
    if (latestHeader >= 0) {
      const nextHeader = text.slice(latestHeader + 1).search(/^##\s+/m);
      const section = nextHeader >= 0 ? text.slice(latestHeader, latestHeader + 1 + nextHeader) : text.slice(latestHeader);
      const body = section.split(/\r?\n/).slice(1).join('\n').trim();
      process.stdout.write(body || `LingTeX ${v} release`);
      return;
    }
    process.stdout.write(`LingTeX ${v} release`);
    return;
  }
  const after = text.slice(idx + 1);
  const nextHeaderRel = after.search(/^##\s+/m);
  const section = nextHeaderRel >= 0 ? text.slice(idx, idx + 1 + nextHeaderRel) : text.slice(idx);
  const body = section.split(/\r?\n/).slice(1).join('\n').trim();
  process.stdout.write(body || `LingTeX ${v} release`);
}

main();
