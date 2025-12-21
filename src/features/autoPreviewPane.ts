import * as vscode from 'vscode';
import * as path from 'path';
// Track recently opened tabs so we can preserve focus on them after moving
const recentOpened = new Map<string, number>();

function resolvePathInFolder(raw: string | undefined, rootFsPath: string): string {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (val.startsWith('${workspaceFolder}')) return path.join(rootFsPath, val.replace('${workspaceFolder}', ''));
  if (!path.isAbsolute(val)) return path.join(rootFsPath, val);
  return val;
}

async function ensureGroupSplitDown(): Promise<void> {
  const groups = vscode.window.tabGroups.all;
  if (groups.length < 2) {
    await vscode.commands.executeCommand('workbench.action.splitEditorDown');
  }
}

async function openUriInColumn(uri: vscode.Uri, col: vscode.ViewColumn, preserveFocus: boolean = true, preview: boolean = true): Promise<void> {
  try {
    await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: col, preserveFocus, preview });
  } catch {}
}

function tabUri(tab: vscode.Tab | undefined): vscode.Uri | undefined {
  if (!tab) return undefined;
  const input: any = (tab as any).input;
  if (!input) return undefined;
  // Try common TabInput types that expose a URI
  try {
    if ('uri' in input && input.uri) return input.uri as vscode.Uri;
    if (input.text && input.text.uri) return input.text.uri as vscode.Uri;
    if (input.notebook && input.notebook.uri) return input.notebook.uri as vscode.Uri;
    if (input.custom && input.custom.uri) return input.custom.uri as vscode.Uri;
  } catch {}
  return undefined;
}

// Fallback move: if no URI is available, we skip moving to avoid focus churn.

let isEnforcing = false;
let cooldownUntil = 0;
async function enforceLayout(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) return;
  const now = Date.now();
  // Compute urgent state before honoring cooldown
  const groupsPeek = vscode.window.tabGroups.all;
  const totalTabsPeek = groupsPeek.reduce((acc, g) => acc + g.tabs.length, 0);
  // Read selected folder index (workspace-level)
  const winCfg = vscode.workspace.getConfiguration('lingtex');
  const idxRaw = winCfg.get<number>('ui.selectedFolderIndex', 0) ?? 0;
  const idx = Math.max(0, Math.min(folders.length - 1, Number(idxRaw) || 0));
  const scopeUri = folders[idx]?.uri;
  const rootFsPath = folders[idx]?.uri.fsPath || '';
  const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
  const enabled = !!cfg.get<boolean>('preview.autoPreviewPane', false);
  if (!enabled) return;
  if (isEnforcing) return;
  isEnforcing = true;

  const mainTexPath = resolvePathInFolder(cfg.get<string>('tex.mainFile', '') || '', rootFsPath);
  const mainPdfPath = resolvePathInFolder(cfg.get<string>('tex.mainPdf', '') || '', rootFsPath);
  if (!mainPdfPath) { isEnforcing = false; return; }

    // Determine current tabs and gently establish layout
    const groupsInit = vscode.window.tabGroups.all;
    const totalTabsInit = groupsInit.reduce((acc, g) => acc + g.tabs.length, 0);
    const urgent = (totalTabsInit === 0) || (groupsInit.length === 1 && groupsInit[0].tabs.length === 1 && (() => {
      const onlyTab = groupsInit[0].tabs[0];
      const onlyUri = tabUri(onlyTab); return !!onlyUri && onlyUri.fsPath === mainPdfPath;
    })());
    // If not urgent and within cooldown, skip enforcement
    if (!urgent && now < cooldownUntil) { isEnforcing = false; return; }
    if (totalTabsInit === 0) {
      // Nothing open: open main TeX on top (if set), then open PDF and move it down to create the bottom group
      if (mainTexPath) {
        await openUriInColumn(vscode.Uri.file(mainTexPath), vscode.ViewColumn.One, true, true);
      }
      // Open PDF and focus it so we can move it down
      await openUriInColumn(vscode.Uri.file(mainPdfPath), vscode.ViewColumn.One, false, true);
      await new Promise(res => setTimeout(res, 100));
      await vscode.commands.executeCommand('moveActiveEditor', { to: 'down', by: 'group' });
      await vscode.commands.executeCommand('workbench.action.keepEditor');
    } else if (groupsInit.length === 1 && groupsInit[0].tabs.length === 1) {
      // Only one tab open. If it's the main PDF, open main TeX on top, then move the PDF down after a short delay.
      const onlyTab = groupsInit[0].tabs[0];
      const onlyUri = tabUri(onlyTab);
      const isOnlyMainPdf = !!onlyUri && onlyUri.fsPath === mainPdfPath;
      if (isOnlyMainPdf) {
        if (mainTexPath) {
          await openUriInColumn(vscode.Uri.file(mainTexPath), vscode.ViewColumn.One, true, true);
        }
        // Open the PDF and then move it down to the bottom group
        await openUriInColumn(vscode.Uri.file(mainPdfPath), vscode.ViewColumn.One, false, true);
        await new Promise(res => setTimeout(res, 100));
        await vscode.commands.executeCommand('moveActiveEditor', { to: 'down', by: 'group' });
        await vscode.commands.executeCommand('workbench.action.keepEditor');
      } else {
        // General case below
        const groupsNow = vscode.window.tabGroups.all;
        const bottom = groupsNow[1];
        const bottomHasMainPdf = !!bottom && bottom.tabs.some(tb => {
          const u = tabUri(tb); return !!u && u.fsPath === mainPdfPath;
        });
        if (!bottomHasMainPdf) {
          await openUriInColumn(vscode.Uri.file(mainPdfPath), vscode.ViewColumn.Two, true, true);
        }
        // If top is empty and we have a main TeX configured, open it to avoid full-screen PDF
        const top = vscode.window.tabGroups.all[0];
        if (top && top.tabs.length === 0 && mainTexPath) {
          await openUriInColumn(vscode.Uri.file(mainTexPath), vscode.ViewColumn.One, true, true);
        }
      }
    } else {
      // Open main PDF in bottom group if not already present; opening in column Two will create the group if absent
      const groupsNow = vscode.window.tabGroups.all;
      const bottom = groupsNow[1];
      const bottomHasMainPdf = !!bottom && bottom.tabs.some(tb => {
        const u = tabUri(tb); return !!u && u.fsPath === mainPdfPath;
      });
      if (!bottomHasMainPdf) {
        await openUriInColumn(vscode.Uri.file(mainPdfPath), vscode.ViewColumn.Two, true, true);
      }
      // If top is empty and we have a main TeX configured, open it to avoid full-screen PDF
      const top = vscode.window.tabGroups.all[0];
      if (top && top.tabs.length === 0 && mainTexPath) {
        await openUriInColumn(vscode.Uri.file(mainTexPath), vscode.ViewColumn.One, true, true);
      }
    }

  // Move non-main PDF tabs out of bottom group
  try {
    const groups = vscode.window.tabGroups.all;
    const bottom = groups[1];
    if (bottom) {
      const origEditor = vscode.window.activeTextEditor;
      const origUri = origEditor?.document?.uri;
      const origCol = origEditor?.viewColumn ?? vscode.ViewColumn.One;
      const activeBottomTab: vscode.Tab | undefined = (bottom as any).activeTab || undefined;
      const activeUri = tabUri(activeBottomTab);
      const isActiveMainPdf = !!activeUri && activeUri.fsPath === mainPdfPath;

      // Prefer moving the most recently opened bottom tab (non-PDF) and keep focus on it
      let recentCandidate: vscode.Tab | undefined;
      let recentCandidateUri: vscode.Uri | undefined;
      for (const tb of bottom.tabs) {
        const u = tabUri(tb);
        if (!u || u.fsPath === mainPdfPath) continue;
        const openedAt = recentOpened.get(u.fsPath) || 0;
        if (openedAt > 0 && (!recentCandidate || openedAt > (recentOpened.get(recentCandidateUri!.fsPath) || 0))) {
          recentCandidate = tb; recentCandidateUri = u;
        }
      }

      if (recentCandidate && recentCandidateUri) {
        // Activate the newly opened bottom tab and move it up; keep focus on it after move
        await openUriInColumn(recentCandidateUri, vscode.ViewColumn.Two, false, true);
        await new Promise(res => setTimeout(res, 75));
        await vscode.commands.executeCommand('moveActiveEditor', { to: 'up', by: 'group' });
        // Pin the editor to avoid preview closure after move
        await vscode.commands.executeCommand('workbench.action.keepEditor');
      } else if (activeBottomTab && activeUri && !isActiveMainPdf) {
        const openedAt = recentOpened.get(activeUri.fsPath) || 0;
        const isRecent = openedAt > 0 && (Date.now() - openedAt) < 2000;
        // Activate explicitly, then move the active bottom tab up by group
        await openUriInColumn(activeUri, vscode.ViewColumn.Two, false, true);
        await new Promise(res => setTimeout(res, 75));
        await vscode.commands.executeCommand('moveActiveEditor', { to: 'up', by: 'group' });
        await vscode.commands.executeCommand('workbench.action.keepEditor');
        if (!isRecent && origUri) {
          // Restore original focus for existing tabs
          await openUriInColumn(origUri, origCol, false, true);
        }
        // Recent tabs keep focus after move
      }

      // Optional cleanup: if other non-main-PDF tabs remain bottom, move them up without focus churn
      for (const tb of bottom.tabs) {
        const u = tabUri(tb);
        const isMainPdf = !!u && u.fsPath === mainPdfPath;
        if (!isMainPdf && u && tb !== activeBottomTab && (!recentCandidate || tb !== recentCandidate)) {
          await openUriInColumn(u, vscode.ViewColumn.One, true, true);
        }
      }
    }
  } catch {}
  // Set a short cooldown to avoid immediate re-enforcement on tab-change events caused by our moves
  cooldownUntil = Date.now() + 400;
  isEnforcing = false;
  // Prune old entries from recentOpened
  try {
    const now2 = Date.now();
    for (const [k, t] of Array.from(recentOpened.entries())) {
      if ((now2 - t) > 5000) recentOpened.delete(k);
    }
  } catch {}
}

export function registerAutoPreviewPane(context: vscode.ExtensionContext): void {
  let timer: NodeJS.Timeout | undefined;
  const schedule = (delayMs: number = 300) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { enforceLayout().catch(()=>{}); }, Math.max(0, delayMs));
  };

  // React only to the requested events
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lingtex.preview.autoPreviewPane') || e.affectsConfiguration('lingtex.ui.selectedFolderIndex')) schedule();
    }),
    (vscode.window.tabGroups as any).onDidChangeTabs?.((ev: any) => {
      try {
        const opened = Array.isArray(ev?.opened) ? ev.opened.length : 0;
        const closed = Array.isArray(ev?.closed) ? ev.closed.length : 0;
        // Record recently opened URIs
        if (Array.isArray(ev?.opened)) {
          for (const tb of ev.opened) {
            const u = tabUri(tb);
            if (u) recentOpened.set(u.fsPath, Date.now());
          }
        }
        if (opened > 0 || closed > 0) schedule(75);
      } catch {
        // If event shape is unknown, still schedule conservatively
        schedule(150);
      }
    })
  );
  cooldownUntil = Date.now() + 500;

  // Apply once on activation if enabled
  schedule();
}
