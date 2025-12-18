import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import ExcelJS from 'exceljs';
import { DOMParser } from '@xmldom/xmldom';

export function registerConvertXLingPaperXmlToExcelCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('lingtex.convertXLingPaperXmlToExcel', async () => {
    const input = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'XML': ['xml'], 'All Files': ['*'] }
    });
    if (!input || input.length === 0) { return; }
    const inputPath = input[0].fsPath;

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'LingTeX: XLingPaper XML → Excel', cancellable: false }, async (progress) => {
      progress.report({ message: 'Parsing XML…' });
      const raw = await fs.readFile(inputPath);
      const sanitized = sanitizeXml(raw);
      const doc = new DOMParser().parseFromString(sanitized, 'application/xml');

      const tables = extractTables(doc);
      if (tables.length === 0) {
        vscode.window.showWarningMessage('No tables detected in XML');
      }

      progress.report({ message: 'Building workbook…' });
      const wb = new ExcelJS.Workbook();
      tables.forEach((rows, idx) => {
        const ws = wb.addWorksheet(`Table ${idx + 1}`);
        rows.forEach(r => ws.addRow(r));
      });

      const defaultName = applyFilenameTemplate(path.basename(inputPath, path.extname(inputPath)), 'xlsx');
      const home = os.homedir();
      const defaultUri = vscode.Uri.file(path.join(home, 'Downloads', defaultName));
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'Excel Workbook': ['xlsx'] },
        title: 'Save Excel file'
      });
      if (!saveUri) {
        vscode.window.showInformationMessage('LingTeX: Export cancelled');
        return;
      }
      await wb.xlsx.writeFile(saveUri.fsPath);
      vscode.window.showInformationMessage(`LingTeX: Wrote Excel to ${saveUri.fsPath}`);
      await vscode.env.openExternal(saveUri);
    });
  });
  context.subscriptions.push(disposable);
}

function sanitizeXml(buf: Buffer): string {
  // Remove BOM and any stray non-XML leading bytes
  let s = buf.toString('utf8');
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/^[^<]*</, '<');
  return s;
}

function extractTables(doc: any): string[][][] {
  const result: string[][][] = [];
  const tableNodes = Array.from((doc as any).getElementsByTagName('table')) as any[];
  if (tableNodes.length > 0) {
    for (const t of tableNodes) {
      const rows: string[][] = [];
      const tr = Array.from((t as any).getElementsByTagName('tr')) as any[];
      for (const r of tr) {
        const td = Array.from((r as any).getElementsByTagName('td')) as any[];
        const th = Array.from((r as any).getElementsByTagName('th')) as any[];
        const cells = td.concat(th);
        rows.push(cells.map((c: any) => ((c.textContent as string) || '').trim()));
      }
      result.push(rows);
    }
    return result;
  }
  // Fallback for XLingPaper-like structures (e.g., row/cell elements)
  const xRows = Array.from((doc as any).getElementsByTagName('row')) as any[];
  if (xRows.length > 0) {
    const rows: string[][] = [];
    for (const r of xRows) {
      const cells = Array.from((r as any).getElementsByTagName('cell')) as any[];
      rows.push(cells.map((c: any) => ((c.textContent as string) || '').trim()));
    }
    result.push(rows);
  }
  return result;
}

// This command defaults to prompting for a save location and name.

function applyFilenameTemplate(basename: string, ext: string): string {
  const cfg = vscode.workspace.getConfiguration('lingtex');
  const tmpl = cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}');
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const name = tmpl
    .replace(/\$\{basename\}/g, basename)
    .replace(/\$\{date\}/g, date)
    .replace(/\$\{time\}/g, time);
  return `${name}.${ext}`;
}
