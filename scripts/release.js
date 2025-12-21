#!/usr/bin/env node
/**
 * LingTeX Release Script
 *
 * Usage:
 *   npm run release               # prompts for version
 *   npm run release -- --version 0.2.6
 *   npm run release -- --patch | --minor | --major
 *
 * Requires: git, npm, gh CLI (authenticated), Node.js
 */

const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { stdio: 'inherit', ...opts });
    return out;
  } catch (e) {
    console.error(`\nERROR running: ${cmd}`);
    process.exitCode = 1;
    throw e;
  }
}

function runCapture(cmd) {
  try {
    return String(execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  } catch (e) {
    return '';
  }
}

function computeSuggestions(cur) {
  const parts = String(cur || '0.0.0').split('.').map(x => parseInt(x || '0', 10) || 0);
  const p = [...parts]; p[2] = (p[2] || 0) + 1;
  const m = [...parts]; m[1] = (m[1] || 0) + 1; m[2] = 0;
  const M = [...parts]; M[0] = (M[0] || 0) + 1; M[1] = 0; M[2] = 0;
  return { patch: p.join('.'), minor: m.join('.'), major: M.join('.') };
}

function getArg(flag) {
  const idx = process.argv.findIndex(a => a === flag);
  if (idx >= 0) return true;
  return false;
}
function getArgValue(flag) {
  const idx = process.argv.findIndex(a => a === flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const cur = pkg.version;
  const lastTag = runCapture('git --no-pager tag --list "v*" --sort=-v:refname | head -n 1') || 'none';
  const { patch, minor, major } = computeSuggestions(cur);
  console.log(`Current package.json version: ${cur}`);
  console.log(`Most recent release tag: ${lastTag}`);
  console.log(`Suggested: patch ${patch}, minor ${minor}, major ${major}`);

  let version = getArgValue('--version');
  if (!version) {
    if (getArg('--patch')) version = patch;
    else if (getArg('--minor')) version = minor;
    else if (getArg('--major')) version = major;
  }

  if (!version) {
    // Prompt interactively
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    version = await new Promise(resolve => rl.question(`Version to release [default ${patch}]: `, ans => { rl.close(); resolve(ans && ans.trim() ? ans.trim() : patch); }));
  }

  console.log(`\nReleasing version ${version}…\n`);

  // Pre-commit tidy (ignore failure)
  try { run('git add -A'); run(`git commit -m "chore: pre-release"`); } catch {}

  // Bump version and update docs/version
  run(`npm version ${version} --no-git-tag-version`);
  run(`node scripts/update-version.js ${version}`);
  run(`node scripts/preflight-version.js ${version}`);

  // Update docs badges and commit
  try { run('git add docs/index.html docs/install.html'); run(`git commit -m "docs: bump website badge to v${version}"`); } catch {}
  try { run('git add package.json'); run(`git commit -m "chore: v${version}"`); } catch {}

  // Generate release notes
  const notes = runCapture(`node scripts/release-notes.js ${version}`);

  // Tag & build
  run(`git tag -a v${version} -m "LingTeX v${version}"`);
  run('npm run clean');
  run('npm run bundle');
  run('npm run package');

  // Push & GitHub release
  run('git push');
  run('git push --tags');

  if (!notes) {
    console.warn('Warning: release notes empty; proceeding without notes.');
  }
  const vsixName = `lingtex-${version}.vsix`;
  console.log(`Creating GitHub release for v${version}…`);
  run(`gh release create v${version} ${vsixName} --title "LingTeX v${version}" ${notes ? `--notes ${JSON.stringify(notes)}` : ''}`);

  console.log('\nRelease completed successfully.');
}

main().catch(err => {
  console.error(err?.message || String(err));
  process.exit(1);
});
