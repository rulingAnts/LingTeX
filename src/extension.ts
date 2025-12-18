import * as vscode from 'vscode';
import {
  registerTsvToInterlinearCommand,
  registerConvertExcelToTabularxCommand,
  registerTabularxToExcelCommand,
  registerConvertXLingPaperXmlToExcelCommand,
  registerTsvToTabularxCommand,
} from './features';

export function activate(context: vscode.ExtensionContext) {
  // Real commands
  registerTsvToInterlinearCommand(context);
  registerConvertExcelToTabularxCommand(context);
  registerTabularxToExcelCommand(context);
  registerConvertXLingPaperXmlToExcelCommand(context);
  registerTsvToTabularxCommand(context);

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
