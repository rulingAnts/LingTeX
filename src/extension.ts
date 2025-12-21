import * as vscode from 'vscode';
import {
  registerTsvToInterlinearCommand,
  registerConvertExcelToTabularxCommand,
  registerTabularxToExcelCommand,
  registerConvertXLingPaperXmlToExcelCommand,
  registerTsvToTabularxCommand,
  registerAutoPreviewPane,
} from './features';
import { LingTeXViewProvider } from './panel/lingtexPanel';

export function activate(context: vscode.ExtensionContext) {
  // Compute and set context key for conditional UI (Activity Bar visibility)
  const CONTEXT_KEY = 'lingtex:relevant';
  const setRelevant = async (val: boolean) => {
    await vscode.commands.executeCommand('setContext', CONTEXT_KEY, val);
  };
  const computeRelevance = async (): Promise<boolean> => {
    const cfg = vscode.workspace.getConfiguration('lingtex');
    if (cfg.get<boolean>('alwaysShowActivityBar', false)) return true;
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return false;
    try {
      const uris = await vscode.workspace.findFiles('**/*.{tex,ltx,latex}', '**/{node_modules,.git,dist,out,build,coverage}/**', 1);
      return uris.length > 0;
    } catch {
      return false;
    }
  };
  const updateRelevance = async () => setRelevant(await computeRelevance());
  // Initialize relevance
  updateRelevance();
  // Watch for changes that might affect relevance
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{tex,ltx,latex}');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(updateRelevance),
    watcher.onDidDelete(updateRelevance),
    watcher.onDidChange(updateRelevance),
    vscode.workspace.onDidChangeWorkspaceFolders(updateRelevance),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('lingtex.alwaysShowActivityBar')) updateRelevance();
    })
  );

  // Sidebar webview panel
  const provider = new LingTeXViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LingTeXViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Real commands
  registerTsvToInterlinearCommand(context);
  registerConvertExcelToTabularxCommand(context);
  registerTabularxToExcelCommand(context);
  registerConvertXLingPaperXmlToExcelCommand(context);
  registerTsvToTabularxCommand(context);
  registerAutoPreviewPane(context);

  // Placeholder stubs for other commands
  const stubs: Array<[string, string]> = [
    ['lingtex.findMissingGlosses', 'Find Missing Glosses'],
    ['lingtex.sanitizeIntro', 'Sanitize Intro Sections'],
    ['lingtex.splitSections', 'Split Sections'],
  ];
  for (const [command, label] of stubs) {
    const disposable = vscode.commands.registerCommand(command, () => info(label));
    context.subscriptions.push(disposable);
  }
}

export function deactivate() {}

function info(message: string) {
  vscode.window.showInformationMessage(`LingTeX: ${message} (stub)`);
}
