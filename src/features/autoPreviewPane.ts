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

async function openUriInColumn(uri: vscode.Uri, col: vscode.ViewColumn, preserveFocus: boolean = true): Promise<void> {
  try {
    await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: col, preserveFocus, preview: true });
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
  if (now < cooldownUntil) return;
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

  // Ensure bottom group exists only if we have a main PDF configured
  if (mainPdfPath) {
    await ensureGroupSplitDown();
  }
  // Open main PDF in bottom group if not already present
  if (mainPdfPath) {
    const groupsNow = vscode.window.tabGroups.all;
    const bottom = groupsNow[1];
    const bottomHasMainPdf = !!bottom && bottom.tabs.some(tb => {
      const u = tabUri(tb); return !!u && u.fsPath === mainPdfPath;
    });
    if (!bottomHasMainPdf) {
      await openUriInColumn(vscode.Uri.file(mainPdfPath), vscode.ViewColumn.Two, true);
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
      for (const tb of bottom.tabs) {
        const u = tabUri(tb);
        const isMainPdf = !!u && u.fsPath === mainPdfPath;
        if (!isMainPdf && u) {
          const openedAt = recentOpened.get(u.fsPath) || 0;
          const isRecent = openedAt > 0 && (Date.now() - openedAt) < 2000;
          // Focus the bottom tab, then move to above group
          await openUriInColumn(u, vscode.ViewColumn.Two, false);
          await vscode.commands.executeCommand('workbench.action.moveEditorToAboveGroup');
          if (!isRecent && origUri) {
            // Restore original focus for existing tabs
            await openUriInColumn(origUri, origCol, false);
          }
          // For recent tabs, keep focus on the moved tab (now on top)
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
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { enforceLayout().catch(()=>{}); }, 300);
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
        if (opened > 0 || closed > 0) schedule();
      } catch {
        // If event shape is unknown, still schedule conservatively
        schedule();
      }
    })
  );

  // Apply once on activation if enabled
  schedule();
}
