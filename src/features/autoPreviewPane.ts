import * as vscode from 'vscode';
import * as path from 'path';

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

async function openUriInColumn(uri: vscode.Uri, col: vscode.ViewColumn): Promise<void> {
  try {
    await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: col, preserveFocus: true, preview: false });
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

async function enforceLayout(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) return;
  // Read selected folder index (workspace-level)
  const winCfg = vscode.workspace.getConfiguration('lingtex');
  const idxRaw = winCfg.get<number>('ui.selectedFolderIndex', 0) ?? 0;
  const idx = Math.max(0, Math.min(folders.length - 1, Number(idxRaw) || 0));
  const scopeUri = folders[idx]?.uri;
  const rootFsPath = folders[idx]?.uri.fsPath || '';
  const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
  const enabled = !!cfg.get<boolean>('preview.autoPreviewPane', false);
  if (!enabled) return;

  const mainTexPath = resolvePathInFolder(cfg.get<string>('tex.mainFile', '') || '', rootFsPath);
  const mainPdfPath = resolvePathInFolder(cfg.get<string>('tex.mainPdf', '') || '', rootFsPath);

  // Ensure main TeX open in top group
  if (mainTexPath) {
    await openUriInColumn(vscode.Uri.file(mainTexPath), vscode.ViewColumn.One);
  }
  // Ensure bottom group exists
  await ensureGroupSplitDown();
  // Open main PDF in bottom group
  if (mainPdfPath) {
    await openUriInColumn(vscode.Uri.file(mainPdfPath), vscode.ViewColumn.Two);
  }

  // Move non-main PDF tabs out of bottom group
  try {
    const groups = vscode.window.tabGroups.all;
    const bottom = groups.find(g => g.viewColumn === vscode.ViewColumn.Two) || groups[1];
    if (bottom) {
      for (const tb of bottom.tabs) {
        const u = tabUri(tb);
        const isMainPdf = !!u && u.fsPath === mainPdfPath;
        if (!isMainPdf && u) {
          await openUriInColumn(u, vscode.ViewColumn.One);
        }
      }
    }
  } catch {}
}

export function registerAutoPreviewPane(context: vscode.ExtensionContext): void {
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { enforceLayout().catch(()=>{}); }, 200);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('lingtex.preview.autoPreviewPane') ||
        e.affectsConfiguration('lingtex.tex.mainFile') ||
        e.affectsConfiguration('lingtex.tex.mainPdf') ||
        e.affectsConfiguration('lingtex.ui.selectedFolderIndex')
      ) schedule();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => schedule()),
    (vscode.window.tabGroups as any).onDidChangeTabs?.(() => schedule())
  );

  // Initial enforcement
  schedule();
}
