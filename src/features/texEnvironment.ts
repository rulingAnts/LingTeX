import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

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
  // Prefer PATH search but also check common platform locations
  const extra: string[] = [];
  if (process.platform === 'darwin') {
    extra.push('/Library/TeX/texbin');
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
    // Engines / foundations
    'xetex',
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
    'langsci-gb4e','gb4e'
  ];

  const checkEnv = vscode.commands.registerCommand('lingtex.tex.checkEnvironment', async () => {
    const env = await detectTexEnvironment();
    const msgs: string[] = [];
    msgs.push(env.texFound ? 'TeX distribution detected.' : 'No TeX distribution found.');
    msgs.push(env.kpseFound ? 'kpsewhich available.' : 'kpsewhich not found.');
    msgs.push(env.tlmgrFound ? 'tlmgr available.' : 'tlmgr not found.');
    vscode.window.showInformationMessage('LingTeX: ' + msgs.join(' '));
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
      const list = combined.join(' ');
      if (tl) {
        const texbin = path.dirname(tl);
        term.sendText(`PATH="${texbin}:$PATH" tlmgr install ${list}`);
        vscode.window.showInformationMessage('LingTeX: Installing recommended linguistics packages via tlmgr in terminal.');
      } else if (mpm) {
        // MiKTeX: install packages via mpm (admin mode ensures system-wide)
        term.sendText('echo "Installing recommended linguistics packages via MiKTeX mpm…"');
        for (const p of combined) {
          term.sendText(`mpm --admin --install=${p}`);
        }
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
      term.sendText(`PATH="${texbin}:$PATH" tlmgr install ${list}`);
      vscode.window.showInformationMessage('LingTeX: Installing selected packages via tlmgr in terminal.');
    } catch (e: any) {
      vscode.window.showErrorMessage('LingTeX: Install failed: ' + (e?.message || String(e)));
    }
  });
  context.subscriptions.push(installPkgs);

  const installDistribution = vscode.commands.registerCommand('lingtex.tex.installDistribution', async () => {
    const env = await detectTexEnvironment();
    if (env.texFound) {
      const choice = await vscode.window.showWarningMessage(
        'Warning: A TeX distribution is already installed. Installing another may cause toolchain conflicts, break PATH resolution, consume multiple gigabytes, and can be difficult to undo. Unless you are absolutely sure, do NOT continue. Prefer “Check Environment” or “Check Packages”.',
        { modal: true },
        'Cancel',
        'Check Environment',
        'Check Packages',
        'Install anyway'
      );
      if (choice === 'Check Environment') { await vscode.commands.executeCommand('lingtex.tex.checkEnvironment'); return; }
      if (choice === 'Check Packages') { await vscode.commands.executeCommand('lingtex.tex.checkPreamblePackages'); return; }
      if (choice !== 'Install anyway') return;
    }
    const term = vscode.window.createTerminal({ name: 'LingTeX: Install TeX distribution' });
    term.show();
    if (process.platform === 'darwin') {
      const brew = await findBinary('brew');
      if (brew) {
        term.sendText('brew install --cask basictex');
        term.sendText('echo "Configuring TeX Live for this shell session…"');
        term.sendText('export PATH=/Library/TeX/texbin:$PATH');
        term.sendText('tlmgr update --self');
        term.sendText('tlmgr install latexmk');
        term.sendText('echo "Installing recommended linguistics packages…"');
        term.sendText('tlmgr install fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e');
        vscode.window.showInformationMessage('LingTeX: Installing BasicTeX via Homebrew and recommended packages in terminal.');
      } else {
        term.sendText('echo "Homebrew not found. Downloading BasicTeX.pkg…"');
        term.sendText('curl -L -o "$HOME/Downloads/BasicTeX.pkg" https://mirror.ctan.org/systems/mac/mactex/BasicTeX.pkg');
        term.sendText('echo "Running installer (you may be prompted for your password)…"');
        term.sendText('sudo installer -pkg "$HOME/Downloads/BasicTeX.pkg" -target /');
        term.sendText('echo "Configuring TeX Live for this shell session…"');
        term.sendText('export PATH=/Library/TeX/texbin:$PATH');
        term.sendText('tlmgr update --self');
        term.sendText('tlmgr install latexmk');
        term.sendText('echo "Installing recommended linguistics packages…"');
        term.sendText('tlmgr install fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e');
        vscode.window.showInformationMessage('LingTeX: Downloaded BasicTeX and started installer in terminal.');
      }
    } else if (process.platform === 'linux') {
      const pm = await detectLinuxPackageManager();
      const opts = [
        { label: 'Minimal (latexmk + LaTeX)', value: 'minimal' },
        { label: 'Full (large download)', value: 'full' }
      ];
      const choice = await vscode.window.showQuickPick(opts, { placeHolder: 'Choose TeX Live install size' });
      if (!choice) return;
      let cmd = '';
      if (pm === 'apt') {
        cmd = choice.value === 'full' ? 'sudo apt-get update && sudo apt-get install -y texlive-full'
                                      : 'sudo apt-get update && sudo apt-get install -y texlive texlive-latex-extra latexmk';
      } else if (pm === 'dnf' || pm === 'yum') {
        cmd = choice.value === 'full' ? 'sudo '+pm+' install -y texlive-scheme-full'
                                      : 'sudo '+pm+' install -y texlive texlive-collection-latexrecommended latexmk';
      } else if (pm === 'pacman') {
        cmd = choice.value === 'full' ? 'sudo pacman -S --needed texlive-bin texlive-core texlive-latexextra latexmk'
                                      : 'sudo pacman -S --needed texlive-bin texlive-core latexmk';
      } else if (pm === 'zypper') {
        cmd = choice.value === 'full' ? 'sudo zypper install -y texlive texlive-latexextra latexmk'
                                      : 'sudo zypper install -y texlive texlive-latexextra latexmk';
      } else {
        vscode.window.showInformationMessage('LingTeX: Unknown Linux package manager. Please install TeX Live via your distro and include latexmk.');
        return;
      }
      term.sendText(cmd);
      vscode.window.showInformationMessage('LingTeX: Running TeX install via '+pm+' in terminal.');
      // Try to install recommended packages via tlmgr if available post-install
      term.sendText('echo "Attempting to install recommended linguistics packages (if tlmgr is available)…"');
      term.sendText('tlmgr install fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e || echo "tlmgr not available on distro installs. Please install packages via your package manager (e.g., texlive-latex-extra, biber, forest, qtree, tipa)."');
    } else if (process.platform === 'win32') {
      const winget = await findBinary('winget');
      const choco = await findBinary('choco');
      const opts = [
        { label: 'Install MiKTeX (recommended)', value: 'miktex' },
        { label: 'Install TeX Live', value: 'texlive' }
      ];
      const choice = await vscode.window.showQuickPick(opts, { placeHolder: 'Choose Windows TeX distribution' });
      if (!choice) return;
      if (winget) {
        const id = choice.value === 'miktex' ? 'MiKTeX.MiKTeX' : 'TeXLive.TeXLive';
        term.sendText(`winget install ${id}`);
        vscode.window.showInformationMessage('LingTeX: Running winget install for '+id+' in terminal.');
        if (choice.value === 'texlive') {
          term.sendText('echo "Installing recommended linguistics packages via tlmgr…"');
          term.sendText('tlmgr install fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e');
        } else {
          term.sendText('echo "Installing recommended linguistics packages via MiKTeX mpm…"');
          term.sendText('for %P in (fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e) do mpm --admin --install=%P');
        }
      } else if (choco) {
        const pkg = choice.value === 'miktex' ? 'miktex' : 'texlive';
        term.sendText(`choco install ${pkg} -y`);
        vscode.window.showInformationMessage('LingTeX: Running choco install for '+pkg+' in terminal.');
        if (choice.value === 'texlive') {
          term.sendText('echo "Installing recommended linguistics packages via tlmgr…"');
          term.sendText('tlmgr install fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e');
        } else {
          term.sendText('echo "Installing recommended linguistics packages via MiKTeX mpm…"');
          term.sendText('for %P in (fontspec datetime2 footmisc comment geometry csquotes biblatex biblatex-apa biber setspace enumitem ragged2e needspace placeins longtable tabularx array multirow makecell booktabs diagbox xcolor tcolorbox caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape l3packages forest pgf qtree tipa langsci-gb4e gb4e) do mpm --admin --install=%P');
        }
      } else {
        vscode.window.showInformationMessage('LingTeX: winget/choco not found. Please install MiKTeX or TeX Live manually.');
      }
    }
  });
  context.subscriptions.push(installDistribution);
}
