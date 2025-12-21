import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

function getLingtexConfig(): vscode.WorkspaceConfiguration {
  const folders = vscode.workspace.workspaceFolders || [];
  const scopeUri = folders[0]?.uri;
  return vscode.workspace.getConfiguration('lingtex', scopeUri);
}

function simulateNoTex(): boolean {
  try {
    const cfg = getLingtexConfig();
    return !!cfg.get<boolean>('testing.simulateNoTex', false);
  } catch {
    return false;
  }
}

function whichAsync(bin: string, extraPaths: string[] = []): Promise<string | null> {
  const env = { ...process.env };
  const parts = (env.PATH || '').split(path.delimiter);
  for (const p of extraPaths) { if (!parts.includes(p)) parts.unshift(p); }
  env.PATH = parts.join(path.delimiter);
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    execFile(cmd, [bin], { env }, (err, stdout) => {
      if (err) return resolve(null);
      const loc = String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
      resolve(loc ? loc : null);
    });
  });
}

async function existsIn(dir: string, bin: string): Promise<boolean> {
  try { await fs.promises.stat(path.join(dir, bin)); return true; } catch { return false; }
}

async function findBinary(bin: string): Promise<string | null> {
  if (simulateNoTex()) return null;
  // Prefer PATH search but also check common platform locations
  const extra: string[] = [];
  if (process.platform === 'darwin') {
    extra.push('/Library/TeX/texbin');
    // Also check user-local TeX Live installs in ~/texlive/<year>/bin/universal-darwin
    try {
      const home = os.homedir();
      const base = path.join(home, 'texlive');
      const years = await fs.promises.readdir(base).catch(() => [] as string[]);
      for (const y of years) {
        const p = path.join(base, y, 'bin', 'universal-darwin');
        extra.push(p);
      }
    } catch {
      // ignore
    }
  } else if (process.platform === 'win32') {
    extra.push('C:/texlive/2024/bin/win32');
    extra.push('C:/texlive/2025/bin/win32');
    extra.push('C:/Program Files/MiKTeX/miktex/bin/x64');
    extra.push('C:/Program Files (x86)/MiKTeX/miktex/bin');
  }
  const loc = await whichAsync(bin, extra);
  if (loc) return loc;
  for (const dir of extra) {
    if (await existsIn(dir, bin)) return path.join(dir, bin);
    // Windows executables may have .exe or .bat
    if (await existsIn(dir, bin + '.exe')) return path.join(dir, bin + '.exe');
    if (await existsIn(dir, bin + '.bat')) return path.join(dir, bin + '.bat');
  }
  return null;
}

async function kpsewhich(file: string): Promise<string | null> {
  const bin = await findBinary('kpsewhich');
  if (!bin) return null;
  return new Promise((resolve) => {
    execFile(bin, [file], (err, stdout) => {
      if (err) return resolve(null);
      const loc = String(stdout || '').trim();
      resolve(loc ? loc : null);
    });
  });
}

async function tlmgrExists(): Promise<boolean> {
  return !!(await findBinary('tlmgr'));
}

async function detectLinuxPackageManager(): Promise<'apt'|'dnf'|'yum'|'pacman'|'zypper'|'unknown'> {
  if (await whichAsync('apt-get')) return 'apt';
  if (await whichAsync('dnf')) return 'dnf';
  if (await whichAsync('yum')) return 'yum';
  if (await whichAsync('pacman')) return 'pacman';
  if (await whichAsync('zypper')) return 'zypper';
  return 'unknown';
}

export async function detectTexEnvironment(): Promise<{ texFound: boolean; tlmgrFound: boolean; kpseFound: boolean }>
{
  if (simulateNoTex()) {
    return { texFound: false, tlmgrFound: false, kpseFound: false };
  }
  const latexmk = await findBinary('latexmk');
  const pdflatex = await findBinary('pdflatex');
  const xelatex = await findBinary('xelatex');
  const lualatex = await findBinary('lualatex');
  const texFound = !!(latexmk || pdflatex || xelatex || lualatex);
  const tlmgrFound = await tlmgrExists();
  const kpseFound = !!(await findBinary('kpsewhich'));
  return { texFound, tlmgrFound, kpseFound };
}

function parsePreamblePackages(texContent: string): string[] {
  // Only analyze up to \begin{document}
  const endIdx = texContent.indexOf('\\begin{document}');
  const head = endIdx >= 0 ? texContent.slice(0, endIdx) : texContent;
  const pkgs = new Set<string>();
  const reUse = /\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g;
  const reReq = /\\RequirePackage(?:\[[^\]]*\])?\{([^}]*)\}/g;
  const collect = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(head)) != null) {
      const list = (m[1] || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const p of list) pkgs.add(p);
    }
  };
  collect(reUse); collect(reReq);
  return Array.from(pkgs);
}

async function findMissingPackages(pkgs: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const p of pkgs) {
    // Try .sty then .cls
    const sty = await kpsewhich(p + '.sty');
    const cls = sty ? null : await kpsewhich(p + '.cls');
    if (!sty && !cls) missing.push(p);
  }
  return missing;
}

export function registerTexEnvironment(context: vscode.ExtensionContext): void {
  const recommendedLinguisticsPackages = [
    // Core packages
    'fontspec','datetime2','footmisc','comment','geometry','csquotes',
    'biblatex','biblatex-apa','biber','setspace','enumitem','ragged2e',
    'needspace','placeins','longtable','tabularx','array','multirow','makecell',
    'booktabs','diagbox','xcolor','tcolorbox','caption','glossaries-extra',
    'etoolbox','ulem','fancyhdr','hyperref','cleveref','pdflscape',
    // LaTeX3 packages providing xparse
    'l3packages',
    // Trees/graphics
    'forest','pgf','qtree','tipa',
    // gb4e (prefer langsci variant; include both to maximize success)
    'gb4e'
  ];

  const checkEnv = vscode.commands.registerCommand('lingtex.tex.checkEnvironment', async () => {
    const env = await detectTexEnvironment();
    const msgs: string[] = [];
    msgs.push(env.texFound ? 'TeX distribution detected.' : 'No TeX distribution found.');
    msgs.push(env.kpseFound ? 'kpsewhich available.' : 'kpsewhich not found.');
    msgs.push(env.tlmgrFound ? 'tlmgr available.' : 'tlmgr not found.');
    if (env.texFound) {
      // Offer to add TeX to PATH if detected but not present in PATH
      const tl = await findBinary('tlmgr');
      const binDir = tl ? path.dirname(tl) : (process.platform === 'darwin' ? '/Library/TeX/texbin' : '');
      const inPath = binDir ? (String(process.env.PATH || '').split(path.delimiter).includes(binDir)) : true;
      if (!inPath && binDir) {
        const action = await vscode.window.showInformationMessage('LingTeX: ' + msgs.join(' '), 'Add TeX to PATH');
        if (action === 'Add TeX to PATH') {
          await vscode.commands.executeCommand('lingtex.tex.addTexToPath');
          return;
        }
      } else {
        vscode.window.showInformationMessage('LingTeX: ' + msgs.join(' '));
      }
    } else {
      // Show platform-specific download links instead of running an installer flow.
      let buttons: string[] = [];
      let link: string | null = null;
      if (process.platform === 'darwin') {
        buttons = ['Download BasicTeX (macOS)', 'Open Install Guide', 'Cancel'];
        link = 'https://mirror.ctan.org/systems/mac/mactex/BasicTeX.pkg';
      } else if (process.platform === 'win32') {
        buttons = ['Download TeX Live (Windows)', 'Open Install Guide', 'Cancel'];
        link = 'https://mirror.ctan.org/systems/texlive/tlnet/install-tl-windows.exe';
      } else {
        buttons = ['Open Install Guide', 'Cancel'];
      }
      const choice = await vscode.window.showWarningMessage(
        'LingTeX: No TeX environment detected. Download a minimal distribution and use tlmgr to add packages.',
        { modal: true },
        ...buttons
      );
      if (!choice) return;
      if (choice.startsWith('Download') && link) {
        vscode.env.openExternal(vscode.Uri.parse(link));
      } else if (choice === 'Open Install Guide') {
        vscode.env.openExternal(vscode.Uri.parse('https://rulingants.github.io/LingTeX/install.html'));
      }
    }
  });
  context.subscriptions.push(checkEnv);

  const checkPkgs = vscode.commands.registerCommand('lingtex.tex.checkPreamblePackages', async () => {
    try {
      const folders = vscode.workspace.workspaceFolders || [];
      if (!folders.length) { vscode.window.showErrorMessage('LingTeX: No workspace folder.'); return; }
      const scopeUri = folders[0].uri;
      const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
      let mainTex = (cfg.get<string>('tex.mainFile', '') || '').trim();
      const rootFsPath = scopeUri.fsPath;
      if (mainTex.startsWith('${workspaceFolder}')) mainTex = path.join(rootFsPath, mainTex.replace('${workspaceFolder}', ''));
      else if (mainTex && !path.isAbsolute(mainTex)) mainTex = path.join(rootFsPath, mainTex);
      if (!mainTex) { vscode.window.showErrorMessage('LingTeX: Set “Main TeX file” in Settings.'); return; }
      const content = await fs.promises.readFile(mainTex, 'utf8');
      const pkgs = parsePreamblePackages(content);
      if (!pkgs.length) { vscode.window.showInformationMessage('LingTeX: No packages found in preamble.'); return; }
      const missing = await findMissingPackages(pkgs);
      if (!missing.length) { vscode.window.showInformationMessage('LingTeX: All preamble packages appear installed.'); return; }
      const pick = await vscode.window.showQuickPick(missing.map(m => ({ label: m })), { canPickMany: true, placeHolder: 'Missing packages — choose to install via tlmgr' });
      if (!pick || pick.length === 0) return;
      const sel = pick.map(p => p.label);
      await vscode.commands.executeCommand('lingtex.tex.installPackages', sel);
    } catch (e: any) {
      vscode.window.showErrorMessage('LingTeX: Package check failed: ' + (e?.message || String(e)));
    }
  });
  context.subscriptions.push(checkPkgs);

  const installRecommended = vscode.commands.registerCommand('lingtex.tex.installRecommendedPackages', async () => {
    try {
      const tl = await findBinary('tlmgr');
      const mpm = await findBinary('mpm');
      if (!tl && !mpm) { vscode.window.showErrorMessage('LingTeX: No package manager found (tlmgr/mpm). Install TeX Live or MiKTeX first, then try again.'); return; }
      const folders = vscode.workspace.workspaceFolders || [];
      if (!folders.length) { vscode.window.showErrorMessage('LingTeX: No workspace folder.'); return; }
      const scopeUri = folders[0].uri;
      const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
      let mainTex = (cfg.get<string>('tex.mainFile', '') || '').trim();
      const rootFsPath = scopeUri.fsPath;
      if (mainTex.startsWith('${workspaceFolder}')) mainTex = path.join(rootFsPath, mainTex.replace('${workspaceFolder}', ''));
      else if (mainTex && !path.isAbsolute(mainTex)) mainTex = path.join(rootFsPath, mainTex);

      // Merge recommended list with any missing preamble packages
      let combined = [...recommendedLinguisticsPackages];
      if (mainTex) {
        try {
          const content = await fs.promises.readFile(mainTex, 'utf8');
          const preamblePkgs = parsePreamblePackages(content);
          const missingFromPreamble = await findMissingPackages(preamblePkgs);
          combined = Array.from(new Set([...combined, ...missingFromPreamble]));
        } catch {
          // ignore read errors; proceed with recommended list
        }
      }
      // Create terminal and install via tlmgr or MiKTeX mpm
      const term = vscode.window.createTerminal({ name: 'LingTeX: Install recommended packages' });
      term.show();
      if (tl) {
        const texbin = path.dirname(tl);
        const pkgsList = combined.join(' ');
        // Define helpers and run per-package installs with progress + skip logic
        term.sendText(`export PATH="${texbin}:$PATH"`);
        term.sendText('tlmgr_safe() { OUTPUT=$(tlmgr "$@" 2>&1); if echo "$OUTPUT" | grep -qi "not writable\\|permission denied"; then echo "Permission denied, retrying with sudo..."; sudo -E tlmgr "$@"; else echo "$OUTPUT"; fi; }');
        term.sendText('tlmgr_safe option repository http://mirror.ctan.org/systems/texlive/tlnet');
        term.sendText('echo "Updating tlmgr…"');
        term.sendText('tlmgr_safe update --self');
        term.sendText('i=1; N=$(for P in '+pkgsList+'; do echo $P; done | wc -l | tr -d " "); for P in '+pkgsList+'; do echo "[$i/$N] Checking $P…"; OUT=$(tlmgr info "$P" 2>&1); if echo "$OUT" | grep -qi "cannot find"; then echo "Skipping $P (not found in repository)"; i=$((i+1)); continue; fi; if echo "$OUT" | grep -qi "installed: *Yes"; then echo "Skipping $P (already installed)"; i=$((i+1)); continue; fi; echo "[$i/$N] Installing $P…"; tlmgr_safe install "$P"; i=$((i+1)); done; echo "All requested packages processed."');
        vscode.window.showInformationMessage('LingTeX: Installing recommended linguistics packages via tlmgr with progress and safe skips.');
      } else if (mpm) {
        // MiKTeX: install packages via mpm (admin mode ensures system-wide)
        term.sendText('echo "Installing recommended linguistics packages via MiKTeX mpm…"');
        term.sendText('i=1; N=$(for P in '+combined.join(' ')+'; do echo $P; done | wc -l | tr -d " "); for P in '+combined.join(' ')+'; do echo "[$i/$N] Installing $P…"; mpm --admin --install="$P" || echo "Skipping $P (mpm error or unavailable)"; i=$((i+1)); done; echo "All requested packages processed."');
        vscode.window.showInformationMessage('LingTeX: Installing recommended linguistics packages via MiKTeX mpm in terminal.');
      }
    } catch (e: any) {
      vscode.window.showErrorMessage('LingTeX: Install failed: ' + (e?.message || String(e)));
    }
  });
  context.subscriptions.push(installRecommended);

  const installPkgs = vscode.commands.registerCommand('lingtex.tex.installPackages', async (pkgs?: string[]) => {
    try {
      const tl = await findBinary('tlmgr');
      if (!tl) { vscode.window.showErrorMessage('LingTeX: tlmgr not found. Install TeX Live / MacTeX (BasicTeX) first.'); return; }
      const term = vscode.window.createTerminal({ name: 'LingTeX: tlmgr install' });
      term.show();
      const texbin = path.dirname(tl);
      const list = Array.isArray(pkgs) && pkgs.length ? pkgs.join(' ') : '';
      if (!list) { vscode.window.showInformationMessage('LingTeX: No packages selected for installation.'); return; }
      term.sendText(`export PATH="${texbin}:$PATH"`);
      term.sendText('tlmgr_safe() { OUTPUT=$(tlmgr "$@" 2>&1); if echo "$OUTPUT" | grep -qi "not writable\\|permission denied"; then echo "Permission denied, retrying with sudo..."; sudo -E tlmgr "$@"; else echo "$OUTPUT"; fi; }');
      term.sendText('tlmgr_safe option repository http://mirror.ctan.org/systems/texlive/tlnet');
      term.sendText('i=1; N=$(for P in '+list+'; do echo $P; done | wc -l | tr -d " "); for P in '+list+'; do echo "[$i/$N] Checking $P…"; OUT=$(tlmgr info "$P" 2>&1); if echo "$OUT" | grep -qi "cannot find"; then echo "Skipping $P (not found in repository)"; i=$((i+1)); continue; fi; if echo "$OUT" | grep -qi "installed: *Yes"; then echo "Skipping $P (already installed)"; i=$((i+1)); continue; fi; echo "[$i/$N] Installing $P…"; tlmgr_safe install "$P"; i=$((i+1)); done; echo "All selected packages processed."');
      vscode.window.showInformationMessage('LingTeX: Installing selected packages via tlmgr with progress and safe skips.');
    } catch (e: any) {
      vscode.window.showErrorMessage('LingTeX: Install failed: ' + (e?.message || String(e)));
    }
  });
  context.subscriptions.push(installPkgs);

  const addTexToPath = vscode.commands.registerCommand('lingtex.tex.addTexToPath', async () => {
    try {
      const tl = await findBinary('tlmgr');
      let texbin = tl ? path.dirname(tl) : '';
      if (!texbin && process.platform === 'darwin') {
        const candidates: string[] = ['/Library/TeX/texbin'];
        try {
          const home = os.homedir();
          const base = path.join(home, 'texlive');
          const years = await fs.promises.readdir(base).catch(() => [] as string[]);
          for (const y of years) { candidates.push(path.join(base, y, 'bin', 'universal-darwin')); }
        } catch {}
        for (const c of candidates) { try { const st = await fs.promises.stat(c); if (st.isDirectory()) { texbin = c; break; } } catch {} }
      }
      if (!texbin) { vscode.window.showErrorMessage('LingTeX: Could not locate TeX bin directory to add to PATH.'); return; }
      const choice = await vscode.window.showQuickPick([
        { label: 'Persist for zsh (~/.zshrc)', description: 'Add export line to ~/.zshrc', value: 'zshrc' },
        { label: 'Only this terminal session', value: 'session' }
      ], { placeHolder: 'Add TeX to PATH permanently?' });
      if (!choice) return;
      if (choice.value === 'zshrc') {
        try {
          const zshrc = path.join(os.homedir(), '.zshrc');
          const line = `export PATH="${texbin}:$PATH"`;
          let contents = '';
          try { contents = await fs.promises.readFile(zshrc, 'utf8'); } catch {}
          if (!contents.includes(line)) {
            await fs.promises.appendFile(zshrc, (contents && !contents.endsWith('\n') ? '\n' : '') + line + '\n', 'utf8');
          }
          vscode.window.showInformationMessage('LingTeX: Added TeX to PATH in ~/.zshrc. Restart your shell or VS Code if needed.');
        } catch (e: any) {
          vscode.window.showErrorMessage('LingTeX: Failed to update ~/.zshrc: ' + (e?.message || String(e)));
        }
      } else {
        const term = vscode.window.createTerminal({ name: 'LingTeX: Add TeX to PATH' });
        term.show();
        term.sendText(`export PATH="${texbin}:$PATH"`);
        vscode.window.showInformationMessage('LingTeX: TeX added to PATH for current terminal session.');
      }
    } catch (e: any) {
      vscode.window.showErrorMessage('LingTeX: Add PATH failed: ' + (e?.message || String(e)));
    }
  });
  context.subscriptions.push(addTexToPath);

  // TeX distribution installation command temporarily disabled; preserved here for future testing.
  // const installDistribution = vscode.commands.registerCommand('lingtex.tex.installDistribution', async () => { /* disabled */ });
  // context.subscriptions.push(installDistribution);

  const toggleSimulateNoTex = vscode.commands.registerCommand('lingtex.testing.toggleSimulateNoTex', async () => {
    const cfg = getLingtexConfig();
    const current = !!cfg.get<boolean>('testing.simulateNoTex', false);
    await cfg.update('testing.simulateNoTex', !current, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(`LingTeX: simulateNoTex is now ${!current ? 'ON' : 'OFF'}.`);
  });
  context.subscriptions.push(toggleSimulateNoTex);
}
