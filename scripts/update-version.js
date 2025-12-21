#!/usr/bin/env node
/**
 * Update user-facing version strings to match the release version.
 * - docs/index.html: badge alt text "Latest release (vX.Y.Z)"
 * - docs/install.html: badge alt text "Latest release badge (vX.Y.Z)"
 *
 * Usage: node scripts/update-version.js 0.2.6
 */
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacers) {
  const abs = path.resolve(filePath);
  let content = fs.readFileSync(abs, 'utf8');
  let changed = false;
  for (const { pattern, to } of replacers) {
    const next = content.replace(pattern, to);
    if (next !== content) { changed = true; content = next; }
  }
  if (changed) {
    fs.writeFileSync(abs, content);
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No changes in ${filePath}`);
  }
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/update-version.js <version>');
    process.exit(1);
  }
  // Normalize leading v removal if passed with v
  const v = String(version).replace(/^v/, '');

  // docs/index.html — ensure alt contains exact version
  replaceInFile('docs/index.html', [
    {
      pattern: /alt="Latest release \(v[0-9]+\.[0-9]+\.[0-9]+\)"/g,
      to: `alt="Latest release (v${v})"`
    },
    {
      // In case alt lacks version, add it (be conservative)
      pattern: /alt="Latest release"/g,
      to: `alt="Latest release (v${v})"`
    }
  ]);

  // docs/install.html — ensure alt contains exact version
  replaceInFile('docs/install.html', [
    {
      pattern: /alt="Latest release badge \(v[0-9]+\.[0-9]+\.[0-9]+\)"/g,
      to: `alt="Latest release badge (v${v})"`
    },
    {
      pattern: /alt="Latest release badge"/g,
      to: `alt="Latest release badge (v${v})"`
    }
  ]);

  console.log('Version strings synchronized to', v);
}

main();
